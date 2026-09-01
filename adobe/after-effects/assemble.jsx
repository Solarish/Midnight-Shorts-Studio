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

  var LAYER_ALIASES = {
    "PRESENTER": ["PORTRAIT", "PRESENTER", "CHARACTER", "TALENT"],
    "PORTRAIT": ["PORTRAIT", "PRESENTER", "CHARACTER", "TALENT"],
    "BACKGROUND": ["BACKGROUND", "BG", "BACK"],
    "BG": ["BACKGROUND", "BG", "BACK"],
    "PRESENTER_NAME": ["SUBTITLE", "PRESENTER_NAME", "NAME", "LOWER_THIRD"],
    "SUBTITLE": ["SUBTITLE", "PRESENTER_NAME", "NAME", "LOWER_THIRD"],
    "TITLE": ["TITLE", "HEADLINE", "HEADER"]
  };

  function findLayer(comp, name) {
    var layer = findLayerQuiet(comp, name);
    if (layer) return layer;
    throw new Error("Layer not found in " + comp.name + ": " + name);
  }

  function findLayerQuiet(comp, name) {
    if (!comp || !comp.numLayers) return null;
    for (var i = 1; i <= comp.numLayers; i += 1) {
      if (comp.layer(i).name === name) return comp.layer(i);
    }
    var aliases = LAYER_ALIASES[name] || [];
    for (var a = 0; a < aliases.length; a += 1) {
      for (var j = 1; j <= comp.numLayers; j += 1) {
        if (comp.layer(j).name === aliases[a]) return comp.layer(j);
      }
    }
    var lower = String(name).toLowerCase();
    for (var k = 1; k <= comp.numLayers; k += 1) {
      if (comp.layer(k).name.toLowerCase() === lower) return comp.layer(k);
    }
    return null;
  }

  function findProjectItem(name) {
    var lower = String(name).toLowerCase();
    for (var i = 1; i <= app.project.numItems; i += 1) {
      var item = app.project.item(i);
      if (item.name === name) return item;
    }
    var aliases = LAYER_ALIASES[name] || [];
    for (var a = 0; a < aliases.length; a += 1) {
      for (var j = 1; j <= app.project.numItems; j += 1) {
        if (app.project.item(j).name === aliases[a]) return app.project.item(j);
      }
    }
    for (var k = 1; k <= app.project.numItems; k += 1) {
      if (app.project.item(k).name.toLowerCase() === lower) return app.project.item(k);
    }
    return null;
  }

  function findCompQuiet(name) {
    for (var i = 1; i <= app.project.numItems; i += 1) {
      var item = app.project.item(i);
      if (item instanceof CompItem && item.name === name) return item;
    }
    return null;
  }

  function bindText(comp, bindings) {
    for (var layerName in bindings) {
      if (!bindings.hasOwnProperty(layerName)) continue;
      var textValue = String(bindings[layerName]);
      var subComp = findCompQuiet(layerName);
      if (subComp) {
        var bound = false;
        for (var l = 1; l <= subComp.numLayers; l += 1) {
          var subLayer = subComp.layer(l);
          var subSourceText = subLayer.property("Source Text");
          if (subSourceText) {
            var docVal = subSourceText.value;
            docVal.text = textValue;
            subSourceText.setValue(docVal);
            bound = true;
            break;
          }
        }
        if (bound) continue;
      }
      var layer = findLayerQuiet(comp, layerName);
      if (layer) {
        var sourceText = layer.property("Source Text");
        if (sourceText) {
          var documentValue = sourceText.value;
          documentValue.text = textValue;
          sourceText.setValue(documentValue);
        }
      }
    }
  }

  function bindFootage(comp, bindings) {
    for (var layerName in bindings) {
      if (!bindings.hasOwnProperty(layerName)) continue;
      var sourceFile = new File(bindings[layerName]);
      if (!sourceFile.exists) throw new Error("Footage not found: " + sourceFile.fsName);

      // 1. Project-level FootageItem replacement (e.g. Media 1, Media 2, etc.)
      var projItem = findProjectItem(layerName);
      if (projItem && projItem instanceof FootageItem) {
        try {
          projItem.replace(sourceFile);
          fitProjectItemLayers(projItem, (job && job.mediaFit) || "cover");
          continue;
        } catch (e) {
          // Fall through
        }
      }

      // 2. Pre-comp Item replacement
      if (projItem && projItem instanceof CompItem && projItem.numLayers > 0) {
        var imported = app.project.importFile(new ImportOptions(sourceFile));
        for (var m = 1; m <= projItem.numLayers; m += 1) {
          var mLayer = projItem.layer(m);
          if (mLayer && mLayer.replaceSource) {
            mLayer.replaceSource(imported, false);
            fitLayerToComp(mLayer, projItem, (job && job.mediaFit) || "cover");
            break;
          }
        }
        continue;
      }

      // 3. Direct layer in target comp
      var directLayer = findLayerQuiet(comp, layerName);
      if (directLayer && directLayer.replaceSource) {
        var importedDirect = app.project.importFile(new ImportOptions(sourceFile));
        directLayer.replaceSource(importedDirect, false);
        fitLayerToComp(directLayer, comp, (job && job.mediaFit) || "cover");
        continue;
      }

      // 4. Nested layer in any sub-comp
      var replacedNested = false;
      for (var c = 1; c <= app.project.numItems; c += 1) {
        var anyComp = app.project.item(c);
        if (anyComp instanceof CompItem) {
          var nLayer = findLayerQuiet(anyComp, layerName);
          if (nLayer && nLayer.replaceSource) {
            var impNested = app.project.importFile(new ImportOptions(sourceFile));
            nLayer.replaceSource(impNested, false);
            fitLayerToComp(nLayer, anyComp, (job && job.mediaFit) || "cover");
            replacedNested = true;
            break;
          }
        }
      }
      if (replacedNested) continue;

      // 5. Fallback for generic slot names (e.g. PORTRAIT) across Media 1..21
      var replacedSlots = false;
      for (var s = 1; s <= 21; s++) {
        var slotItem = findProjectItem("Media " + s);
        if (slotItem && slotItem instanceof FootageItem) {
          try {
            slotItem.replace(sourceFile);
            fitProjectItemLayers(slotItem, (job && job.mediaFit) || "cover");
            replacedSlots = true;
          } catch (_) {}
        }
      }
      if (replacedSlots) continue;

      // If slot is not in template (e.g. Media 18 skipped in template), log and continue safely
      warning("slot-not-found", layerName);
    }
  }

  function fitLayerToComp(layer, comp, fitMode) {
    try {
      if (!layer || !comp || !layer.source) return false;
      var scale = layer.property("Scale");
      var position = layer.property("Position");
      if (position) position.setValue([comp.width / 2, comp.height / 2]);
      if (fitMode === "center" || !scale) return true;
      var sourceWidth = layer.source.width;
      var sourceHeight = layer.source.height;
      if (!(sourceWidth > 0 && sourceHeight > 0)) return false;
      var scaleX = (comp.width / sourceWidth) * 100;
      var scaleY = (comp.height / sourceHeight) * 100;
      var value = fitMode === "contain" ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY);
      scale.setValue([value, value]);
      return true;
    } catch (_) {
      return false;
    }
  }

  function fitProjectItemLayers(projectItem, fitMode) {
    for (var i = 1; i <= app.project.numItems; i += 1) {
      var item = app.project.item(i);
      if (!(item instanceof CompItem)) continue;
      for (var layerIndex = 1; layerIndex <= item.numLayers; layerIndex += 1) {
        var layer = item.layer(layerIndex);
        if (layer && layer.source === projectItem) fitLayerToComp(layer, item, fitMode);
      }
    }
  }

  function applyTiming(comp, timing) {
    if (!timing) return;
    var duration = Number(timing.durationSeconds);
    if (!(duration > 0) && Number(timing.secondsPerPhoto) > 0) {
      duration = Number(timing.secondsPerPhoto) * 21;
    }
    if (!(duration > 0) && timing.pacing === "cinematic") duration = 15;
    if (!(duration > 0) && timing.pacing === "dynamic") duration = 10;
    if (duration > 0) {
      comp.duration = duration;
      comp.workAreaStart = 0;
      comp.workAreaDuration = duration;
      milestone("timing-duration-applied", String(duration));
    }
    var requestedFrameRate = Number(timing.frameRate);
    if (requestedFrameRate > 0 && requestedFrameRate <= 120) {
      comp.frameRate = requestedFrameRate;
      milestone("timing-frame-rate-applied", String(requestedFrameRate));
    }
  }

  function parseHexColor(value) {
    var match = /^#?([0-9a-f]{6})$/i.exec(String(value || ""));
    if (!match) return null;
    return [
      parseInt(match[1].substr(0, 2), 16) / 255,
      parseInt(match[1].substr(2, 2), 16) / 255,
      parseInt(match[1].substr(4, 2), 16) / 255
    ];
  }

  function includesAlias(value, aliases) {
    var lower = String(value || "").toLowerCase();
    for (var i = 0; i < aliases.length; i += 1) {
      if (lower.indexOf(aliases[i]) >= 0) return true;
    }
    return false;
  }

  function setNamedColor(comp, aliases, color) {
    if (!comp || !color) return false;
    var changed = false;
    for (var layerIndex = 1; layerIndex <= comp.numLayers; layerIndex += 1) {
      var layer = comp.layer(layerIndex);
      var effects = layer.property("ADBE Effect Parade") || layer.property("Effects");
      if (!effects) continue;
      for (var effectIndex = 1; effectIndex <= effects.numProperties; effectIndex += 1) {
        var effect = effects.property(effectIndex);
        for (var propertyIndex = 1; propertyIndex <= effect.numProperties; propertyIndex += 1) {
          var property = effect.property(propertyIndex);
          if (!includesAlias(layer.name + " " + effect.name + " " + property.name, aliases)) continue;
          try {
            var current = property.value;
            if (current instanceof Array && current.length >= 3) {
              property.setValue(color);
              changed = true;
            }
          } catch (_) {}
        }
      }
    }
    return changed;
  }

  function setNamedLayersEnabled(namePart, enabled) {
    var changed = false;
    var lowerName = String(namePart).toLowerCase();
    for (var itemIndex = 1; itemIndex <= app.project.numItems; itemIndex += 1) {
      var item = app.project.item(itemIndex);
      if (!(item instanceof CompItem)) continue;
      for (var layerIndex = 1; layerIndex <= item.numLayers; layerIndex += 1) {
        var layer = item.layer(layerIndex);
        if (String(layer.name).toLowerCase().indexOf(lowerName) < 0) continue;
        layer.enabled = Boolean(enabled);
        changed = true;
      }
    }
    return changed;
  }

  function setDepthOfField(enabled) {
    var changed = false;
    for (var itemIndex = 1; itemIndex <= app.project.numItems; itemIndex += 1) {
      var item = app.project.item(itemIndex);
      if (!(item instanceof CompItem)) continue;
      for (var layerIndex = 1; layerIndex <= item.numLayers; layerIndex += 1) {
        var options = item.layer(layerIndex).property("ADBE Camera Options Group");
        var property = options && options.property("ADBE Camera Depth of Field");
        if (!property) continue;
        try {
          property.setValue(enabled ? 1 : 0);
          changed = true;
        } catch (_) {}
      }
    }
    return changed;
  }

  function applyStyling(styling) {
    if (!styling) return;
    var themes = {
      "psu_blue_gold": { primary: "#003C71", accent: "#F2A900", background: "#061022" },
      "dark_minimal": { primary: "#E5E7EB", accent: "#94A3B8", background: "#0B0F19" }
    };
    var theme = themes[styling.theme] || {};
    var colorComp = findCompQuiet("COLOR");
    var colors = [
      { name: "primary", aliases: ["primary", "main", "หลัก"], value: styling.primaryColor || theme.primary },
      { name: "accent", aliases: ["accent", "gold", "รอง"], value: styling.accentColor || theme.accent },
      { name: "background", aliases: ["background", "bg", "พื้นหลัง"], value: styling.backgroundColor || theme.background }
    ];
    for (var colorIndex = 0; colorIndex < colors.length; colorIndex += 1) {
      var entry = colors[colorIndex];
      if (!entry.value) continue;
      if (setNamedColor(colorComp, entry.aliases, parseHexColor(entry.value))) {
        milestone("styling-color-applied", entry.name);
      } else {
        warning("styling-color-control-not-found", entry.name);
      }
    }
    if (typeof styling.enableParticles === "boolean") {
      if (setNamedLayersEnabled("particle", styling.enableParticles)) milestone("styling-particles-applied", String(styling.enableParticles));
      else warning("styling-particle-layer-not-found", "particle");
    }
    if (typeof styling.enableDepthOfField === "boolean") {
      if (setDepthOfField(styling.enableDepthOfField)) milestone("styling-depth-of-field-applied", String(styling.enableDepthOfField));
      else warning("styling-camera-control-not-found", "depth-of-field");
    }
  }

  var job = null;
  var resultFile = $.global.AVA_RESULT_FILE || null;
  var logFile = $.global.AVA_LOG_FILE || null;
  var stage = "bootstrap";
  var undoStarted = false;
  var projectOpened = false;
  var warnings = [];

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

  function warning(code, detail) {
    warnings.push({ code: code, detail: detail });
    milestone(code, detail);
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
    if (app.project && (app.project.numItems > 0 || app.project.file || app.project.dirty)) {
      throw new Error("After Effects already has a project open. Save and close it, then retry in a dedicated clean AE session.");
    }
    if (app.project) {
      try {
        app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
      } catch (_) {}
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
    applyTiming(comp, job.timing || {});
    applyStyling(job.styling || {});
    bindText(comp, job.text || {});
    milestone("text-bound");
    bindFootage(comp, job.footage || {});
    milestone("footage-bound");
    app.project.save(new File(job.outputProject));
    milestone("project-saved", job.outputProject);
    app.endUndoGroup();
    undoStarted = false;
    writeResult(resultFile, { protocolVersion: 1, jobId: job.id, generation: job.generation, ok: true, project: job.outputProject, composition: comp.name, warnings: warnings, stage: "complete" });
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
        writeResult(resultFile, { protocolVersion: 1, jobId: job && job.id, generation: job && job.generation, ok: false, error: error.toString(), line: error.line, stage: failedStage });
      } catch (writeError) {
        milestone("result-write-failed", writeError.toString());
      }
    }
  }
}());
