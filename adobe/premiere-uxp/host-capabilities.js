(function (root) {
  var fs = require("fs");

  function ensure(value, message) {
    if (!value) throw new Error(message);
    return value;
  }

  function hostErrorMessage(error) {
    if (typeof error === "string" && error) return error;
    if (error && typeof error.message === "string" && error.message) return error.message;
    var details = [];
    if (error && error.name) details.push("name=" + error.name);
    if (error && error.code) details.push("code=" + error.code);
    if (error && error.description) details.push("description=" + error.description);
    if (details.length > 0) return details.join(", ");
    try {
      var serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") return serialized;
    } catch (_) {}
    return "unknown native host error";
  }

  function normalizedPath(value) {
    return String(value || "").replace(/\\/g, "/").toLowerCase();
  }

  function fileUrl(value) {
    return /^file:\/\//.test(value) ? value : "file://" + value;
  }

  async function statOutput(value) {
    if (typeof fs.lstatSync === "function") return fs.lstatSync(fileUrl(value));
    return fs.stat(fileUrl(value));
  }

  function tickTime(ppro, milliseconds) {
    ensure(Number.isFinite(milliseconds) && milliseconds >= 0, "Timeline time must be non-negative");
    return ppro.TickTime.createWithSeconds(milliseconds / 1000);
  }

  function publicGuid(value) {
    if (!value) return undefined;
    return typeof value.toString === "function" ? value.toString() : String(value);
  }

  async function createOutputProject(ppro, job, log) {
    var project;
    if (job.templateProject) {
      log("Opening Premiere template project");
      var options = root.AvaPremiereAssembly.createOpenOptions(ppro);
      project = options ? await ppro.Project.open(job.templateProject, options) : await ppro.Project.open(job.templateProject);
      ensure(project, "Premiere could not open the template project");
      ensure(await project.saveAs(job.outputProject), "Premiere could not save the output project copy");
    } else {
      project = await ppro.Project.createProject(job.outputProject);
      ensure(project, "Premiere could not create the output project");
    }
    return project;
  }

  async function createSequence(ppro, project, job) {
    var presetPath = ensure(job.sequencePresetPath, "premiere.build requires a trusted sequencePresetPath on Premiere 25.6");
    var sequence = typeof project.createSequenceWithPresetPath === "function"
      ? await project.createSequenceWithPresetPath(job.sequenceName, presetPath)
      : await project.createSequence(job.sequenceName, presetPath);
    ensure(sequence, "Premiere could not create the requested sequence from its preset");
    ensure(await project.setActiveSequence(sequence), "Premiere could not activate the created sequence");
    return sequence;
  }

  async function importSources(ppro, project, timelineSpec, log) {
    var values = [];
    (timelineSpec.scenes || []).forEach(function (entry) { values.push(entry.source); });
    (timelineSpec.overlays || []).forEach(function (entry) {
      if (entry.text) throw new Error("Premiere 25.6 host does not support generated text overlays; render text in AE or provide an overlay asset");
      if (entry.asset) values.push(entry.asset);
    });
    (timelineSpec.audio || []).forEach(function (entry) { values.push(entry.path); });
    var unique = values.filter(function (value, index) { return values.indexOf(value) === index; });
    var rootFolder = await project.getRootItem();
    var rootItem = ppro.ProjectItem.cast(rootFolder);
    if (unique.length) ensure(await project.importFiles(unique, true, rootItem, false), "Premiere failed to import TimelineSpec media");
    var clips = {};
    for (var index = 0; index < unique.length; index += 1) {
      var clipItem = await root.AvaPremiereAssembly.findImportedClip(ppro, project, unique[index]);
      ensure(clipItem, "Imported media was not found in the output project: " + unique[index]);
      var projectItem = ppro.ProjectItem.cast(clipItem);
      ensure(projectItem, "Imported media could not be cast to ProjectItem: " + unique[index]);
      clips[normalizedPath(unique[index])] = projectItem;
    }
    log("Imported " + unique.length + " TimelineSpec source(s)");
    return clips;
  }

  async function importDynamicLinks(ppro, project, timelineSpec, log) {
    var dynamicLinks = timelineSpec.dynamicLinks || [];
    if (!dynamicLinks.length) return {};
    var rootFolder = await project.getRootItem();
    var rootItem = ppro.ProjectItem ? ppro.ProjectItem.cast(rootFolder) : rootFolder;
    var comps = {};
    for (var index = 0; index < dynamicLinks.length; index += 1) {
      var link = dynamicLinks[index];
      log("Importing Dynamic Link AE composition '" + link.composition + "' from " + link.project);
      var imported = await project.importAEComps(link.project, [link.composition], rootItem);
      var isNonEmptyCollection = imported && typeof imported === "object" && typeof imported.length === "number" && imported.length > 0;
      var isSuccess = imported === true || isNonEmptyCollection;
      if (!isSuccess && typeof project.importAllAEComps === "function") {
        log("Named AE composition import was rejected; falling back to importing all compositions from the isolated AEP");
        imported = await project.importAllAEComps(link.project, rootItem);
        isNonEmptyCollection = imported && typeof imported === "object" && typeof imported.length === "number" && imported.length > 0;
        isSuccess = imported === true || isNonEmptyCollection;
      }
      ensure(isSuccess, "Premiere failed to import After Effects composition '" + link.composition + "' from: " + link.project);
      var finder = root.AvaPremiereAssembly && root.AvaPremiereAssembly.findImportedAEComp;
      ensure(typeof finder === "function", "AvaPremiereAssembly.findImportedAEComp capability is required for comp resolution");
      var compItem = await finder(ppro, project, link.project, link.composition);
      if (!compItem) {
        var describe = root.AvaPremiereAssembly && root.AvaPremiereAssembly.describeAECompCandidates;
        var candidates = typeof describe === "function" ? await describe(ppro, project) : [];
        throw new Error("Imported After Effects composition was not found in the output project: " + link.composition + " (" + link.project + "); visible project items=" + JSON.stringify(candidates));
      }
      var projectItem = ppro.ProjectItem ? ppro.ProjectItem.cast(compItem) : compItem;
      ensure(projectItem, "Imported After Effects composition could not be cast to ProjectItem: " + link.composition);
      comps[link.id] = projectItem;
    }
    log("Imported " + dynamicLinks.length + " Dynamic Link composition(s)");
    return comps;
  }

  async function executeAction(project, createAction, label) {
    var success = false;
    await project.lockedAccess(function () {
      success = project.executeTransaction(function (compoundAction) {
        var action = createAction();
        ensure(action, "Premiere did not create the requested timeline action");
        compoundAction.addAction(action);
      }, label);
    });
    ensure(success !== false, "Premiere rejected timeline action: " + label);
  }

  async function setSourceRange(ppro, project, projectItem, sourceInMs, durationMs, id, mediaPath) {
    var clipItem = projectItem;
    if (ppro.ClipProjectItem) {
      if (typeof ppro.ClipProjectItem.cast === "function") clipItem = ppro.ClipProjectItem.cast(projectItem);
      else if (typeof ppro.ClipProjectItem.castOrThrow === "function") clipItem = ppro.ClipProjectItem.castOrThrow(projectItem);
      else if (typeof ppro.ClipProjectItem.queryCast === "function") clipItem = ppro.ClipProjectItem.queryCast(projectItem);
    }
    if ((!clipItem || typeof clipItem.createSetInOutPointsAction !== "function") && mediaPath) {
      var finder = root.AvaPremiereAssembly && root.AvaPremiereAssembly.findImportedClip;
      if (typeof finder === "function") {
        clipItem = await finder(ppro, project, mediaPath);
      }
    }
    ensure(clipItem && typeof clipItem.createSetInOutPointsAction === "function",
      "Premiere ClipProjectItem source-range capability is unavailable for " + id);
    await executeAction(project, function () {
      return clipItem.createSetInOutPointsAction(
        tickTime(ppro, sourceInMs),
        tickTime(ppro, sourceInMs + durationMs)
      );
    }, "AVA source range " + id);
    return clipItem;
  }

  async function clearSourceRange(project, clipItem, id) {
    ensure(clipItem && typeof clipItem.createClearInOutPointsAction === "function",
      "Premiere ClipProjectItem clear-range capability is unavailable for " + id);
    await executeAction(project, function () {
      return clipItem.createClearInOutPointsAction();
    }, "AVA clear source range " + id);
  }

  async function verifyInsertedItemRange(ppro, sequence, projectItem, trackIndex, startMs, durationMs, id) {
    var track = await sequence.getVideoTrack(trackIndex);
    ensure(track, "Premiere video track is unavailable for " + id);
    var items = track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
    var expectedId = typeof projectItem.getId === "function" ? projectItem.getId() : undefined;
    var expectedStart = startMs / 1000;
    var expectedEnd = (startMs + durationMs) / 1000;
    for (var index = 0; index < items.length; index += 1) {
      var candidateProjectItem = await items[index].getProjectItem();
      var candidateId = candidateProjectItem && typeof candidateProjectItem.getId === "function" ? candidateProjectItem.getId() : undefined;
      if (expectedId && candidateId !== expectedId) continue;
      var start = await items[index].getStartTime();
      var end = await items[index].getEndTime();
      if (start && Math.abs(start.seconds - expectedStart) < 0.05) {
        ensure(end && Math.abs(end.seconds - expectedEnd) < 0.05,
          "Premiere inserted range mismatch for " + id + ": expected end " + expectedEnd + "s, got " + (end && end.seconds) + "s");
        return;
      }
    }
    throw new Error("Premiere could not verify inserted source range for " + id);
  }

  async function placeTimeline(ppro, project, sequence, timelineSpec, clips, dynamicLinkClips, log) {
    if (typeof dynamicLinkClips === "function" && log === undefined) {
      log = dynamicLinkClips;
      dynamicLinkClips = {};
    }
    log = typeof log === "function" ? log : function () {};
    dynamicLinkClips = dynamicLinkClips || {};
    ensure(!(timelineSpec.transitions || []).some(function (entry) { return entry.type !== "cut"; }),
      "Premiere 25.6 native transition automation is unavailable; use cuts or render transitions in AE");
    var editor = ppro.SequenceEditor.getEditor(sequence);
    ensure(editor, "Premiere SequenceEditor is unavailable");
    var sceneReceipts = [];
    for (var index = 0; index < timelineSpec.scenes.length; index += 1) {
      var scene = timelineSpec.scenes[index];
      var clip = clips[normalizedPath(scene.source)];
      var start = tickTime(ppro, scene.startMs);
      var audioInserted = scene.audioPolicy === "preserve";
      var audioTrackIndex = audioInserted ? scene.track - 1 : -1;
      var sourceRange = scene.sourceInMs > 0
        ? await setSourceRange(ppro, project, clip, scene.sourceInMs, scene.durationMs, scene.id, scene.source)
        : undefined;
      await executeAction(project, function () {
        return editor.createOverwriteItemAction(clip, start, scene.track - 1, audioTrackIndex);
      }, "AVA scene " + scene.id);
      if (sourceRange) {
        await clearSourceRange(project, sourceRange, scene.id);
        await verifyInsertedItemRange(ppro, sequence, clip, scene.track - 1, scene.startMs, scene.durationMs, scene.id);
      } else {
        await trimInsertedItem(ppro, project, sequence, clip, scene.track - 1, scene.startMs, 0, scene.durationMs, false, scene.id);
      }
      var sceneReceipt = {
        id: scene.id,
        source: scene.source,
        startMs: scene.startMs,
        sourceInMs: scene.sourceInMs || 0,
        durationMs: scene.durationMs,
        videoTrack: scene.track,
        audioPolicy: scene.audioPolicy,
        audioTrack: audioInserted ? scene.track : -1,
        audioInserted: audioInserted
      };
      if (scene.storyboardItemId !== undefined) sceneReceipt.storyboardItemId = scene.storyboardItemId;
      if (scene.editorialKind !== undefined) sceneReceipt.editorialKind = scene.editorialKind;
      if (scene.parentStoryboardItemId !== undefined) sceneReceipt.parentStoryboardItemId = scene.parentStoryboardItemId;
      sceneReceipts.push(sceneReceipt);
    }
    var overlayReceipts = [];
    for (var overlayIndex = 0; overlayIndex < (timelineSpec.overlays || []).length; overlayIndex += 1) {
      var overlay = timelineSpec.overlays[overlayIndex];
      var overlayClip = clips[normalizedPath(overlay.asset)];
      await executeAction(project, function () {
        return editor.createOverwriteItemAction(overlayClip, tickTime(ppro, overlay.startMs), overlay.track - 1, -1);
      }, "AVA overlay " + overlay.id);
      var overlayItem = await trimInsertedItem(ppro, project, sequence, overlayClip, overlay.track - 1, overlay.startMs, 0, overlay.durationMs, false, overlay.id);
      var transformParameters = overlay.transformExplicit
        ? await applyOverlayTransform(ppro, project, overlayItem, overlay, timelineSpec)
        : [];
      var overlayReceipt = {
        id: overlay.id,
        asset: overlay.asset,
        startMs: overlay.startMs,
        durationMs: overlay.durationMs,
        videoTrack: overlay.track,
        audioPolicy: "mute",
        audioTrack: -1,
        audioInserted: false
      };
      if (overlay.transformExplicit) {
        overlayReceipt.position = overlay.position;
        overlayReceipt.scale = overlay.scale;
        overlayReceipt.opacity = overlay.opacity;
        overlayReceipt.boundTransformParameters = transformParameters;
      }
      if (overlay.storyboardItemId !== undefined) overlayReceipt.storyboardItemId = overlay.storyboardItemId;
      if (overlay.editorialKind !== undefined) overlayReceipt.editorialKind = overlay.editorialKind;
      if (overlay.parentStoryboardItemId !== undefined) overlayReceipt.parentStoryboardItemId = overlay.parentStoryboardItemId;
      overlayReceipts.push(overlayReceipt);
    }
    var graphicReceipts = [];
    // project.importFiles can resolve before Premiere's native importer leaves
    // its modal state. insertMogrtFromPath rejects every otherwise-valid
    // argument with "Invalid parameter" during that short window.
    if ((timelineSpec.graphics || []).length > 0 && (timelineSpec.scenes || timelineSpec.overlays || []).length > 0) {
      await new Promise(function (resolve) { setTimeout(resolve, 2500); });
    }
    for (var graphicIndex = 0; graphicIndex < (timelineSpec.graphics || []).length; graphicIndex += 1) {
      var graphic = timelineSpec.graphics[graphicIndex];
      ensure(typeof editor.insertMogrtFromPath === "function", "Premiere 25.6 insertMogrtFromPath capability is unavailable");
      // Premiere 26.5 documents track "index" values but has shipped builds
      // that disagree at the native boundary about zero/one-based indices and
      // the sentinel for a silent template. Probe only representations of the
      // requested V track; an Invalid parameter failure does not mutate the
      // sequence. Never fall back to a different video track.
      var trackAttempts = [
        [graphic.track - 1, -1], [graphic.track - 1, 0], [graphic.track - 1, 1],
        [graphic.track, -1], [graphic.track, 0], [graphic.track, 1]
      ];
      var pathAttempts = [graphic.mogrtPath, fileUrl(graphic.mogrtPath)];
      var inserted;
      var insertionErrors = [];
      await project.lockedAccess(async function () {
        for (var pathIndex = 0; pathIndex < pathAttempts.length && (!inserted || inserted.length < 1); pathIndex += 1) {
          for (var attemptIndex = 0; attemptIndex < trackAttempts.length; attemptIndex += 1) {
            var attempt = trackAttempts[attemptIndex];
            try {
              inserted = await editor.insertMogrtFromPath(pathAttempts[pathIndex], tickTime(ppro, graphic.startMs), attempt[0], attempt[1]);
              if (inserted && inserted.length > 0) break;
              insertionErrors.push("path=" + pathIndex + ",V=" + attempt[0] + ",A=" + attempt[1] + ": empty result");
            } catch (error) {
              insertionErrors.push("path=" + pathIndex + ",V=" + attempt[0] + ",A=" + attempt[1] + ": " + hostErrorMessage(error));
            }
          }
        }
        if ((!inserted || inserted.length < 1) && typeof editor.insertMogrtFromLibrary === "function") {
          var elementName = String(graphic.mogrtPath).split("/").pop().replace(/\.mogrt$/i, "");
          var libraryNames = ["Local", "Local Templates", "Motion Graphics Templates"];
          for (var libraryIndex = 0; libraryIndex < libraryNames.length && (!inserted || inserted.length < 1); libraryIndex += 1) {
            for (var libraryTrackIndex = 0; libraryTrackIndex < trackAttempts.length; libraryTrackIndex += 1) {
              var libraryTrack = trackAttempts[libraryTrackIndex];
              try {
                inserted = await editor.insertMogrtFromLibrary(libraryNames[libraryIndex], elementName, tickTime(ppro, graphic.startMs), libraryTrack[0], libraryTrack[1]);
                if (inserted && inserted.length > 0) break;
                insertionErrors.push("library=" + libraryNames[libraryIndex] + ",V=" + libraryTrack[0] + ",A=" + libraryTrack[1] + ": empty result");
              } catch (libraryError) {
                insertionErrors.push("library=" + libraryNames[libraryIndex] + ",V=" + libraryTrack[0] + ",A=" + libraryTrack[1] + ": " + hostErrorMessage(libraryError));
              }
            }
          }
        }
      });
      if (!inserted || inserted.length < 1) {
        var installedMogrtPath = "unavailable";
        var sequenceTrackCounts = "unavailable";
        try { installedMogrtPath = await ppro.SequenceEditor.getInstalledMogrtPath(); } catch (_) {}
        try { sequenceTrackCounts = "video=" + await sequence.getVideoTrackCount() + ",audio=" + await sequence.getAudioTrackCount(); } catch (_) {}
        throw new Error("Premiere failed all insertMogrtFromPath forms for " + graphic.id +
          "; installedMogrtPath=" + installedMogrtPath + "; tracks=" + sequenceTrackCounts + "; attempts=" + insertionErrors.join(" | "));
      }
      ensure(inserted && inserted.length > 0, "Premiere failed to insert MOGRT for " + graphic.id + ": " + graphic.mogrtPath);
      var graphicItem = inserted[0];
      await executeAction(project, function () {
        return graphicItem.createSetEndAction(tickTime(ppro, graphic.startMs + graphic.durationMs));
      }, "AVA trim graphic " + graphic.id);
      var parameterEvidence = await bindGraphicParameters(ppro, project, graphicItem, graphic);
      graphicReceipts.push({
        id: graphic.id,
        mogrtPath: graphic.mogrtPath,
        startMs: graphic.startMs,
        durationMs: graphic.durationMs,
        videoTrack: graphic.track,
        text: graphic.text,
        bindingMode: graphic.bindingMode || "runtime",
        boundParameters: parameterEvidence.bound,
        seededParameters: parameterEvidence.seeded,
        parameterDiagnostics: parameterEvidence.diagnostics,
        seedReceipt: graphic.seedReceipt,
        editable: true,
        audioPolicy: "mute",
        audioTrack: -1,
        audioInserted: false,
        storyboardItemId: graphic.storyboardItemId,
        editorialKind: graphic.editorialKind
      });
    }
    var dynamicLinkReceipts = [];
    for (var dlIndex = 0; dlIndex < (timelineSpec.dynamicLinks || []).length; dlIndex += 1) {
      var link = timelineSpec.dynamicLinks[dlIndex];
      var compItem = dynamicLinkClips[link.id];
      ensure(compItem, "Dynamic Link project item missing for " + link.id);
      // TimelineSpec track is 1-based (e.g. V1 -> track 1, V3 -> track 3).
      // Premiere UXP createOverwriteItemAction requires a 0-based video track index (track - 1).
      // audioTrack index is -1 to guarantee video-only placement (no AE audio inserted).
      // The returned receipt preserves the 1-based videoTrack for specification consistency.
      await executeAction(project, function () {
        return editor.createOverwriteItemAction(compItem, tickTime(ppro, link.startMs), link.track - 1, -1);
      }, "AVA dynamic link " + link.id);
      await trimInsertedItem(ppro, project, sequence, compItem, link.track - 1, link.startMs, 0, link.durationMs, false, link.id);
      var dlReceipt = {
        id: link.id,
        project: link.project,
        composition: link.composition,
        startMs: link.startMs,
        durationMs: link.durationMs,
        videoTrack: link.track,
        audioPolicy: "mute",
        audioTrack: -1,
        audioInserted: false
      };
      if (link.storyboardItemId !== undefined) dlReceipt.storyboardItemId = link.storyboardItemId;
      if (link.editorialKind !== undefined) dlReceipt.editorialKind = link.editorialKind;
      if (link.parentStoryboardItemId !== undefined) dlReceipt.parentStoryboardItemId = link.parentStoryboardItemId;
      dynamicLinkReceipts.push(dlReceipt);
    }
    var audioReceipts = [];
    for (var audioIndex = 0; audioIndex < (timelineSpec.audio || []).length; audioIndex += 1) {
      var audio = timelineSpec.audio[audioIndex];
      var audioClip = clips[normalizedPath(audio.path)];
      await executeAction(project, function () {
        return editor.createOverwriteItemAction(audioClip, tickTime(ppro, audio.startMs), -1, audioIndex);
      }, "AVA audio " + audio.id);
      if (audio.durationMs) await trimInsertedItem(ppro, project, sequence, audioClip, audioIndex, audio.startMs, 0, audio.durationMs, true, audio.id);
      var audioReceipt = {
        id: audio.id,
        path: audio.path,
        startMs: audio.startMs,
        audioTrack: audioIndex + 1,
        audioInserted: true
      };
      if (audio.durationMs !== undefined) audioReceipt.durationMs = audio.durationMs;
      audioReceipts.push(audioReceipt);
    }
    log("Placed TimelineSpec scenes, overlays, editable graphics, dynamic links and audio");
    var placementReceipt = {
      scenes: sceneReceipts,
      overlays: overlayReceipts,
      dynamicLinks: dynamicLinkReceipts,
      audio: audioReceipts
    };
    if (timelineSpec.graphics !== undefined) placementReceipt.graphics = graphicReceipts;
    return placementReceipt;
  }

  async function bindGraphicParameters(ppro, project, trackItem, graphic) {
    ensure(trackItem && typeof trackItem.getComponentChain === "function", "Inserted MOGRT does not expose editable component parameters for " + graphic.id);
    var parameterMap = graphic.parameterMap || {};
    var keys = Object.keys(graphic.text || {});
    var requiredNames = keys.map(function (field) { return parameterMap[field] || field; });
    var params = {};
    // The AE capsule is attached asynchronously after the TrackItem appears.
    // Poll the live chain so fast machines do not need a fixed global delay and
    // slower imports do not produce a false "parameter missing" failure.
    for (var pollIndex = 0; pollIndex < 20; pollIndex += 1) {
      params = await readComponentParameters(trackItem, graphic.id);
      if (requiredNames.every(function (name) { return Boolean(params[name]); })) break;
      await new Promise(function (resolve) { setTimeout(resolve, 250); });
    }
    if (graphic.bindingMode === "preseeded") {
      ensure(graphic.seedReceipt && graphic.seedReceipt.mode === "preseeded", "Pre-seeded MOGRT receipt is missing for " + graphic.id);
      ensure(graphic.seedReceipt.outputPath === graphic.mogrtPath, "Pre-seeded MOGRT receipt path mismatch for " + graphic.id);
      for (var seededIndex = 0; seededIndex < requiredNames.length; seededIndex += 1) {
        ensure(params[requiredNames[seededIndex]], "Pre-seeded MOGRT parameter '" + requiredNames[seededIndex] + "' is missing for " + graphic.id);
      }
      var diagnostics = [];
      for (var diagnosticIndex = 0; diagnosticIndex < requiredNames.length; diagnosticIndex += 1) {
        var diagnosticName = requiredNames[diagnosticIndex];
        var diagnosticParam = params[diagnosticName];
        var diagnostic = { displayName: diagnosticName };
        try {
          diagnostic.keyframesSupported = typeof diagnosticParam.areKeyframesSupported === "function"
            ? await diagnosticParam.areKeyframesSupported()
            : undefined;
        } catch (supportError) { diagnostic.keyframesError = hostErrorMessage(supportError); }
        try {
          var currentValue = typeof diagnosticParam.getValueAtTime === "function"
            ? await diagnosticParam.getValueAtTime(tickTime(ppro, graphic.startMs))
            : undefined;
          diagnostic.valueType = typeof currentValue;
          diagnostic.value = typeof currentValue === "string" ? currentValue.slice(0, 4000) : currentValue;
        } catch (valueError) { diagnostic.valueError = hostErrorMessage(valueError); }
        try {
          var startKeyframe = typeof diagnosticParam.getStartValue === "function"
            ? await diagnosticParam.getStartValue()
            : undefined;
          var startValue = startKeyframe && startKeyframe.value;
          diagnostic.startValueType = typeof startValue;
          if (typeof startValue === "string") diagnostic.startValue = startValue.slice(0, 4000);
          else if (startValue !== undefined) diagnostic.startValue = JSON.parse(JSON.stringify(startValue));
        } catch (startError) { diagnostic.startValueError = hostErrorMessage(startError); }
        diagnostics.push(diagnostic);
      }
      return { bound: [], seeded: requiredNames, diagnostics: diagnostics };
    }
    var bound = [];
    for (var index = 0; index < keys.length; index += 1) {
      var field = keys[index];
      var displayName = parameterMap[field] || field;
      var target = params[displayName];
      ensure(target, "MOGRT parameter '" + displayName + "' (field '" + field + "') is missing for " + graphic.id + "; available=" + Object.keys(params).join("|"));
      var keyframe;
      try {
        keyframe = target.createKeyframe(graphic.text[field]);
      } catch (createError) {
        throw new Error("Premiere 26.5 cannot bind AE MOGRT Source Text parameter '" + displayName + "' through the public UXP ComponentParam API: " + hostErrorMessage(createError) + ". Use a pre-seeded editable MOGRT for this cover; refusing to save placeholder text.");
      }
      await executeAction(project, function (param, value) {
        return function () { return param.createSetValueAction(value, false); };
      }(target, keyframe), "AVA bind graphic " + graphic.id + " " + displayName);
      bound.push(displayName);
    }
    return { bound: bound, seeded: [], diagnostics: [] };
  }

  async function componentParameters(trackItem, id) {
    ensure(trackItem && typeof trackItem.getComponentChain === "function", "Track item does not expose component parameters for " + id);
    return readComponentParameters(trackItem, id);
  }

  async function readComponentParameters(trackItem, id) {
    var chain = await trackItem.getComponentChain();
    ensure(chain, "Component chain is unavailable for " + id);
    var params = {};
    var componentCount = Number(await chain.getComponentCount());
    for (var componentIndex = 0; componentIndex < componentCount; componentIndex += 1) {
      var component = await chain.getComponentAtIndex(componentIndex);
      var paramCount = Number(await component.getParamCount());
      for (var paramIndex = 0; paramIndex < paramCount; paramIndex += 1) {
        var param = await component.getParam(paramIndex);
        params[String(param.displayName)] = param;
      }
    }
    return params;
  }

  async function applyOverlayTransform(ppro, project, trackItem, overlay, timelineSpec) {
    var params = await componentParameters(trackItem, overlay.id);
    var map = overlay.parameterMap || { position: "Position", scale: "Scale", opacity: "Opacity" };
    var point = ppro.PointF && typeof ppro.PointF === "function" ? new ppro.PointF() : {};
    point.x = overlay.position.x;
    point.y = overlay.position.y;
    var values = {
      position: point,
      scale: overlay.scale * 100,
      opacity: overlay.opacity * 100
    };
    var bound = [];
    for (var index = 0; index < Object.keys(values).length; index += 1) {
      var field = Object.keys(values)[index];
      var displayName = map[field];
      var param = params[displayName];
      ensure(param, "Premiere parameter '" + displayName + "' is missing; cannot apply " + field + " for " + overlay.id);
      var keyframe = param.createKeyframe(values[field]);
      await executeAction(project, function (target, value) {
        return function () { return target.createSetValueAction(value, false); };
      }(param, keyframe), "AVA overlay transform " + overlay.id + " " + displayName);
      bound.push(displayName);
    }
    return bound;
  }

  async function trimInsertedItem(ppro, project, sequence, projectItem, trackIndex, startMs, sourceInMs, durationMs, audio, id) {
    var track = audio ? await sequence.getAudioTrack(trackIndex) : await sequence.getVideoTrack(trackIndex);
    ensure(track, "Premiere track is unavailable for " + id);
    var items = track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
    var expectedId = typeof projectItem.getId === "function" ? projectItem.getId() : undefined;
    var item;
    for (var index = items.length - 1; index >= 0; index -= 1) {
      var candidateProjectItem = await items[index].getProjectItem();
      var candidateId = candidateProjectItem && typeof candidateProjectItem.getId === "function" ? candidateProjectItem.getId() : undefined;
      if (!expectedId || candidateId === expectedId) { item = items[index]; break; }
    }
    ensure(item, "Premiere could not resolve inserted track item for " + id);
    var success = false;
    await project.lockedAccess(function () {
      success = project.executeTransaction(function (compoundAction) {
        // Overwrite already fixes the sequence start. Setting start again can
        // invalidate the live track-item handle in Premiere 25.6. Still images
        // also do not expose a finite source range, so source In/Out actions are
        // needed only when TimelineSpec explicitly requests a non-zero in.
        var actions = [];
        if (sourceInMs > 0) {
          actions.push(item.createSetInPointAction(tickTime(ppro, sourceInMs)));
          actions.push(item.createSetOutPointAction(tickTime(ppro, sourceInMs + durationMs)));
        } else {
          // A source In/Out range already defines the resulting clip duration.
          // Adding TrackItemTrimEndAction as well is redundant and crashes
          // Premiere Pro Beta 26.5 with a native null-pointer abort for A-roll.
          actions.push(item.createSetEndAction(tickTime(ppro, startMs + durationMs)));
        }
        actions.forEach(function (action) {
          ensure(action, "Premiere did not create a trim action for " + id);
          compoundAction.addAction(action);
        });
      }, "AVA trim " + id);
    });
    ensure(success !== false, "Premiere rejected trim action for " + id);
    return item;
  }

  async function buildTimeline(ppro, job, log) {
    var project = await createOutputProject(ppro, job, log);
    var sequence = await createSequence(ppro, project, job);
    var clips = await importSources(ppro, project, job.timelineSpec, log);
    var dynamicLinkClips = await importDynamicLinks(ppro, project, job.timelineSpec, log);
    var placementResults = await placeTimeline(ppro, project, sequence, job.timelineSpec, clips, dynamicLinkClips, log);
    ensure(await project.save(), "Premiere could not save the assembled project");
    var target = {
      project: job.outputProject,
      sequenceName: job.sequenceName,
      sequenceGuid: publicGuid(sequence.guid),
      scenes: placementResults.scenes,
      overlays: placementResults.overlays,
      graphics: placementResults.graphics,
      dynamicLinks: placementResults.dynamicLinks,
      audio: placementResults.audio
    };
    try { Object.defineProperty(target, "_project", { value: project, enumerable: false }); } catch (_) {}
    try { Object.defineProperty(target, "_sequence", { value: sequence, enumerable: false }); } catch (_) {}
    return target;
  }

  async function resolveExportTarget(ppro, target) {
    var project = target._project || await ppro.Project.open(target.project);
    ensure(project, "Premiere could not open the export project");
    var sequence = target._sequence;
    if (!sequence && target.sequenceGuid && typeof project.getSequence === "function") sequence = project.getSequence(target.sequenceGuid);
    if (!sequence) {
      var sequences = await project.getSequences();
      sequence = sequences.find(function (value) {
        return (target.sequenceGuid && publicGuid(value.guid) === target.sequenceGuid) || (target.sequenceName && value.name === target.sequenceName);
      });
      if (!sequence && sequences && sequences.length > 0) {
        if (typeof project.getActiveSequence === "function") {
          try { sequence = await project.getActiveSequence(); } catch (_) {}
        }
        if (!sequence) sequence = sequences[0];
      }
    }
    ensure(sequence, "Premiere export sequence was not found in project: " + (target.sequenceName || target.sequenceGuid || "default"));
    return { project: project, sequence: sequence };
  }

  async function waitForStableFile(output, timeoutMs, requiredStableSamples) {
    var deadline = Date.now() + timeoutMs;
    var previousSize = -1;
    var stable = 0;
    var required = Number(requiredStableSamples || 15);
    while (Date.now() < deadline) {
      try {
        var info = await statOutput(output);
        if (info.size > 0 && info.size === previousSize) stable += 1;
        else stable = 0;
        previousSize = info.size;
        if (stable >= required) return info.size;
      } catch (_) {}
      await new Promise(function (resolve) { setTimeout(resolve, 1000); });
    }
    throw new Error("Premiere export did not produce a stable output before timeout: " + output);
  }

  async function ensureFreshExportPath(output) {
    try {
      await statOutput(output);
      throw new Error("Premiere export output already exists; use a unique output path: " + output);
    } catch (error) {
      if (/output already exists/.test(error && error.message || "")) throw error;
      if (error && error.code && error.code !== "ENOENT") throw error;
    }
  }

  function immediateExportCompletion(ppro, encoder, timeoutMs) {
    ensure(ppro.EventManager && typeof ppro.EventManager.addGlobalEventListener === "function", "Premiere export completion EventManager is unavailable");
    var eventType = ppro.OperationCompleteEvent || (ppro.Constants && ppro.Constants.OperationCompleteEvent);
    var eventName = eventType && (eventType.EVENT_EXPORT_MEDIA_COMPLETE || eventType.EXPORT_MEDIA_COMPLETE);
    ensure(eventName, "Premiere in-app export completion event is unavailable");
    var listener;
    var timer;
    var promise = new Promise(function (resolve, reject) {
      listener = function (event) {
        var state = event && event.state;
        var successState = eventType && eventType.OPERATION_STATE_SUCCESS;
        if (state !== undefined && successState !== undefined && state !== successState) {
          reject(new Error("Premiere in-app export failed with operation state " + state));
          return;
        }
        resolve(event);
      };
      ppro.EventManager.addGlobalEventListener(eventName, listener);
      timer = setTimeout(function () {
        reject(new Error("Premiere in-app export completion event timed out"));
      }, timeoutMs);
    });
    return {
      promise: promise,
      dispose: function () {
        clearTimeout(timer);
        if (typeof ppro.EventManager.removeGlobalEventListener === "function") {
          ppro.EventManager.removeGlobalEventListener(eventName, listener);
        }
      }
    };
  }

  async function prepareExport(ppro, target, request) {
    ensure(request.presetPath, "Premiere " + request.format + " export requires a trusted .epr presetPath");
    var expectedExtension = request.format === "h264" ? ".mp4" : ".mov";
    ensure(normalizedPath(request.output).endsWith(expectedExtension), "Premiere " + request.format + " output must end in " + expectedExtension);
    var resolved = await resolveExportTarget(ppro, target);
    var presetExtension;
    try {
      presetExtension = await ppro.EncoderManager.getExportFileExtension(resolved.sequence, request.presetPath);
    } catch (error) {
      throw new Error("Premiere could not inspect " + request.format + " preset: " + hostErrorMessage(error));
    }
    if (presetExtension) ensure(expectedExtension === "." + String(presetExtension).replace(/^\./, "").toLowerCase(), "Premiere preset extension does not match " + request.format);
    return { project: resolved.project, sequence: resolved.sequence };
  }

  async function exportSequence(ppro, target, request, job, log, prepared) {
    var resolved = prepared || await prepareExport(ppro, target, request);
    var encoder = ppro.EncoderManager.getManager();
    ensure(encoder, "Premiere EncoderManager is unavailable");
    await ensureFreshExportPath(request.output);
    log("Exporting " + request.format + " sequentially");
    var timeoutMs = Number(job.exportTimeoutMs || 1_200_000);
    var completion = immediateExportCompletion(ppro, encoder, timeoutMs);
    try {
      var operation = Promise.resolve(
        encoder.exportSequence(resolved.sequence, ppro.Constants.ExportType.IMMEDIATELY, request.output, request.presetPath, true)
      );
      var rejected = operation.then(function (accepted) {
        if (!accepted) throw new Error("Premiere rejected " + request.format + " export");
        return new Promise(function () {});
      }, function (error) {
        throw new Error("Premiere exportSequence failed for " + request.format + ": " + hostErrorMessage(error));
      });
      var stableOutput = waitForStableFile(request.output, timeoutMs, job.exportStableSamples).then(function (bytes) {
        return { kind: "stable-output", bytes: bytes };
      });
      var settled = await Promise.race([
        completion.promise.then(function () { return { kind: "completion-event" }; }),
        rejected,
        stableOutput
      ]);
      var bytes = settled && settled.kind === "stable-output"
        ? settled.bytes
        : await waitForStableFile(request.output, timeoutMs, job.exportStableSamples);
      return { ok: true, format: request.format, output: request.output, presetPath: request.presetPath, bytes: bytes, completedAt: new Date().toISOString() };
    } catch (error) {
      if (/^Premiere (?:exportSequence failed|rejected|in-app export completion)/.test(error && error.message || "")) throw error;
      throw new Error("Premiere exportSequence failed for " + request.format + ": " + hostErrorMessage(error));
    } finally {
      completion.dispose();
    }
  }

  root.AvaPremiereHostCapabilities = {
    protocolVersion: 1,
    buildTimeline: buildTimeline,
    prepareExport: prepareExport,
    exportSequence: exportSequence
  };
  root.AvaPremiereHostInternals = {
    createSequence: createSequence,
    importSources: importSources,
    importDynamicLinks: importDynamicLinks,
    placeTimeline: placeTimeline,
    bindGraphicParameters: bindGraphicParameters,
    applyOverlayTransform: applyOverlayTransform,
    setSourceRange: setSourceRange,
    clearSourceRange: clearSourceRange,
    verifyInsertedItemRange: verifyInsertedItemRange,
    prepareExport: prepareExport,
    exportSequence: exportSequence,
    waitForStableFile: waitForStableFile
  };
}(globalThis));
