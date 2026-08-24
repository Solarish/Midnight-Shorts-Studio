(function () {
  function quoteString(value) {
    return '"' + String(value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t") + '"';
  }

  function serialize(value) {
    if (typeof JSON !== "undefined" && JSON.stringify) return JSON.stringify(value, null, 2);
    if (value === null) return "null";
    if (typeof value === "string") return quoteString(value);
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (value instanceof Array) {
      var arrayValues = [];
      for (var i = 0; i < value.length; i += 1) arrayValues.push(serialize(value[i]));
      return "[" + arrayValues.join(",") + "]";
    }
    var objectValues = [];
    for (var key in value) {
      if (value.hasOwnProperty(key) && typeof value[key] !== "undefined") {
        objectValues.push(quoteString(key) + ":" + serialize(value[key]));
      }
    }
    return "{" + objectValues.join(",") + "}";
  }

  function writeResult(filePath, value) {
    var file = new File(filePath);
    file.encoding = "UTF-8";
    if (!file.open("w")) throw new Error("Cannot write result file: " + filePath);
    file.write(serialize(value) + "\n");
    file.close();
  }

  function readJson(filePath) {
    var file = new File(filePath);
    file.encoding = "UTF-8";
    if (!file.open("r")) throw new Error("Cannot open job file: " + filePath);
    var source = file.read();
    file.close();
    if (typeof JSON !== "undefined" && JSON.parse) return JSON.parse(source);
    return eval("(" + source + ")");
  }

  function findComp(name) {
    for (var i = 1; i <= app.project.numItems; i += 1) {
      var item = app.project.item(i);
      if (item instanceof CompItem && item.name === name) return item;
    }
    throw new Error("Composition not found: " + name);
  }

  function findLayer(comp, name) {
    for (var i = 1; i <= comp.numLayers; i += 1) {
      if (comp.layer(i).name === name) return comp.layer(i);
    }
    throw new Error("Layer not found in " + comp.name + ": " + name);
  }

  function bindText(comp, bindings) {
    for (var layerName in bindings) {
      if (!bindings.hasOwnProperty(layerName)) continue;
      var layer = findLayer(comp, layerName);
      var sourceText = layer.property("Source Text");
      if (!sourceText) throw new Error("Layer is not a text layer: " + layerName);
      var documentValue = sourceText.value;
      documentValue.text = String(bindings[layerName]);
      sourceText.setValue(documentValue);
    }
  }

  function bindFootage(comp, bindings) {
    for (var layerName in bindings) {
      if (!bindings.hasOwnProperty(layerName)) continue;
      var layer = findLayer(comp, layerName);
      var sourceFile = new File(bindings[layerName]);
      if (!sourceFile.exists) throw new Error("Footage not found: " + sourceFile.fsName);
      var imported = app.project.importFile(new ImportOptions(sourceFile));
      layer.replaceSource(imported, false);
    }
  }

  var job = null;
  var resultFile = $.global.AVA_RESULT_FILE || null;
  var logFile = $.global.AVA_LOG_FILE || null;
  var stage = "bootstrap";
  var undoStarted = false;
  var projectOpened = false;

  function milestone(nextStage, detail) {
    stage = nextStage;
    if (!logFile) return;
    try {
      var file = new File(logFile);
      file.encoding = "UTF-8";
      if (!file.open("a")) return;
      file.writeln(new Date().toString() + " | " + nextStage + (detail ? " | " + detail : ""));
      file.close();
    } catch (_) {}
  }

  try {
    milestone("runner-started");
    if ($.global.AVA_JOB) {
      job = $.global.AVA_JOB;
    } else if ($.global.AVA_JOB_FILE) {
      job = readJson($.global.AVA_JOB_FILE);
    } else {
      throw new Error("AVA_JOB was not provided");
    }
    resultFile = job.resultFile || resultFile;
    logFile = job.logFile || logFile;
    milestone("job-ready", job.composition || "MASTER");
    if (app.project && app.project.numItems > 0) {
      throw new Error("After Effects already has a project open. Use a dedicated clean AE session for automation.");
    }
    var templateFile = new File(job.templateProject);
    if (!templateFile.exists) throw new Error("Template project not found: " + job.templateProject);
    milestone("template-verified", templateFile.fsName);
    app.open(templateFile);
    projectOpened = true;
    milestone("template-opened");
    app.beginUndoGroup("PSU Automated Video Assembly");
    undoStarted = true;
    var comp = findComp(job.composition || "MASTER");
    milestone("composition-found", comp.name);
    bindText(comp, job.text || {});
    milestone("text-bound");
    bindFootage(comp, job.footage || {});
    milestone("footage-bound");
    app.project.save(new File(job.outputProject));
    milestone("project-saved", job.outputProject);
    app.endUndoGroup();
    undoStarted = false;
    writeResult(resultFile, { ok: true, project: job.outputProject, composition: comp.name, stage: "complete" });
    milestone("result-written", resultFile);
    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    projectOpened = false;
    milestone("project-closed");
  } catch (error) {
    var failedStage = stage;
    if (undoStarted) {
      try { app.endUndoGroup(); } catch (_) {}
    }
    milestone("failed", error.toString());
    if (projectOpened && app.project) {
      try { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (_) {}
    }
    if (resultFile) {
      try {
        writeResult(resultFile, { ok: false, error: error.toString(), line: error.line, stage: failedStage });
      } catch (writeError) {
        milestone("result-write-failed", writeError.toString());
      }
    }
  }
}());
