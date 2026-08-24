(function () {
  function writeResult(filePath, value) {
    var file = new File(filePath);
    file.encoding = "UTF-8";
    if (!file.open("w")) throw new Error("Cannot write result file: " + filePath);
    file.write(JSON.stringify(value, null, 2));
    file.close();
  }

  function readJson(filePath) {
    var file = new File(filePath);
    file.encoding = "UTF-8";
    if (!file.open("r")) throw new Error("Cannot open job file: " + filePath);
    var value = JSON.parse(file.read());
    file.close();
    return value;
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

  var job;
  var undoStarted = false;
  try {
    if (!$.global.AVA_JOB_FILE) throw new Error("AVA_JOB_FILE was not provided");
    job = readJson($.global.AVA_JOB_FILE);
    if (app.project && app.project.numItems > 0) {
      throw new Error("After Effects already has a project open. Use a dedicated clean AE session for automation.");
    }
    app.open(new File(job.templateProject));
    app.beginUndoGroup("PSU Automated Video Assembly");
    undoStarted = true;
    var comp = findComp(job.composition || "MASTER");
    bindText(comp, job.text || {});
    bindFootage(comp, job.footage || {});
    app.project.save(new File(job.outputProject));
    app.endUndoGroup();
    undoStarted = false;
    writeResult(job.resultFile, { ok: true, project: job.outputProject, composition: comp.name });
    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
  } catch (error) {
    if (undoStarted) {
      try { app.endUndoGroup(); } catch (_) {}
    }
    if (job && job.resultFile) {
      writeResult(job.resultFile, { ok: false, error: error.toString(), line: error.line });
    }
    throw error;
  }
}());
