(function (root) {
  function ensure(value, message) {
    if (!value) throw new Error(message);
    return value;
  }

  function createOpenOptions(ppro) {
    if (typeof ppro.OpenProjectOptions !== "function") return undefined;
    var options = ppro.OpenProjectOptions();
    if (options && typeof options.setShowLocateFileDialog === "function") {
      options = options.setShowLocateFileDialog(false);
    }
    if (options && typeof options.setShowConvertProjectDialog === "function") {
      options = options.setShowConvertProjectDialog(false);
    }
    if (options && typeof options.setShowWarningDialog === "function") {
      options = options.setShowWarningDialog(false);
    }
    if (options && typeof options.setAddToMRUList === "function") {
      options = options.setAddToMRUList(false);
    }
    return options;
  }

  function normalizedPath(value) {
    return String(value || "").replace(/\\/g, "/").toLowerCase();
  }

  async function findImportedClip(ppro, project, mediaPath) {
    var matches;
    if (typeof ppro.ClipProjectItem.findItemsMatchingMediaPath === "function") {
      matches = await ppro.ClipProjectItem.findItemsMatchingMediaPath(mediaPath, false);
    } else {
      matches = await collectProjectItems(ppro, await project.getRootItem());
    }
    if (!matches || matches.length === 0) return null;

    var expectedPath = normalizedPath(mediaPath);
    for (var i = 0; i < matches.length; i += 1) {
      try {
        var candidateProject = await matches[i].getProject();
        if (!candidateProject || candidateProject.guid !== project.guid) continue;
        var clip = ppro.ClipProjectItem.cast(matches[i]);
        var actualPath = await clip.getMediaFilePath();
        if (normalizedPath(actualPath) === expectedPath) return clip;
      } catch (_) {}
    }
    return null;
  }

  async function collectProjectItems(ppro, rootItem) {
    var pending = [rootItem];
    var clips = [];
    while (pending.length > 0) {
      var item = pending.shift();
      try {
        var clip = ppro.ClipProjectItem.cast(item);
        await clip.getMediaFilePath();
        clips.push(item);
        continue;
      } catch (_) {}
      try {
        var folder = ppro.FolderItem.cast(item);
        var children = await folder.getItems();
        for (var childIndex = 0; childIndex < children.length; childIndex += 1) {
          pending.push(children[childIndex]);
        }
      } catch (_) {}
    }
    return clips;
  }

  async function assemblePremiereJob(ppro, job, log) {
    log = typeof log === "function" ? log : function () {};
    ensure(job && job.type === "premiere.assemble", "Unsupported or missing Premiere job type");
    ensure(job.protocolVersion === 1, "Premiere protocolVersion 1 is required");
    ensure(job.id, "Premiere job id is required");
    ensure(job.generation, "Premiere job generation is required");
    ensure(job.outputProject, "Premiere outputProject is required for safe automation");

    var project;
    if (job.templateProject) {
      log("Opening Premiere template");
      var options = createOpenOptions(ppro);
      project = options
        ? await ppro.Project.open(job.templateProject, options)
        : await ppro.Project.open(job.templateProject);
      ensure(project, "Premiere could not open the template project");
      ensure(await project.saveAs(job.outputProject), "Premiere could not create the output project copy");
      log("Created output project copy");
    } else {
      log("Creating Premiere output project");
      project = await ppro.Project.createProject(job.outputProject);
      ensure(project, "Premiere could not create the output project");
    }

    var rootFolder = await project.getRootItem();
    var rootItem = ppro.ProjectItem.cast(rootFolder);

    for (var aeIndex = 0; aeIndex < (job.aeComps || []).length; aeIndex += 1) {
      var ae = job.aeComps[aeIndex];
      var importedAE = ae.compositions && ae.compositions.length > 0
        ? await project.importAEComps(ae.project, ae.compositions, rootItem)
        : await project.importAllAEComps(ae.project, rootItem);
      ensure(importedAE, "Premiere failed to import After Effects compositions from: " + ae.project);
      log("Imported After Effects compositions");
    }

    if (job.media && job.media.length > 0) {
      ensure(await project.importFiles(job.media, true, rootItem, false), "Premiere failed to import media files");
      log("Imported " + job.media.length + " media file(s)");
    }

    var sequence;
    if (job.createSequence && job.media && job.media.length > 0) {
      var clips = [];
      for (var mediaIndex = 0; mediaIndex < job.media.length; mediaIndex += 1) {
        var clip = await findImportedClip(ppro, project, job.media[mediaIndex]);
        ensure(clip, "Imported media not found in output project: " + job.media[mediaIndex]);
        clips.push(clip);
      }
      sequence = await project.createSequenceFromMedia(job.sequenceName, clips, rootItem);
      ensure(sequence, "Premiere could not create the requested sequence");
      ensure(await project.setActiveSequence(sequence), "Premiere could not activate the created sequence");
      log("Created sequence " + job.sequenceName);
    }

    if (job.save) ensure(await project.save(), "Premiere could not save the output project");
    log("Saved Premiere output project");
    var sequenceGuid = sequence && sequence.guid;
    if (sequenceGuid && typeof sequenceGuid.toString === "function") {
      sequenceGuid = sequenceGuid.toString();
    }
    return {
      project: job.outputProject,
      sequenceName: sequence ? job.sequenceName : undefined,
      sequenceGuid: sequence ? sequenceGuid : undefined,
      importedMedia: job.media || []
    };
  }

  async function collectAECompCandidates(ppro, rootItem) {
    var pending = [rootItem];
    var candidates = [];
    while (pending.length > 0) {
      var item = pending.shift();
      if (!item) continue;
      var isFolder = false;
      try {
        if (ppro.FolderItem && typeof ppro.FolderItem.cast === "function") {
          var folder = ppro.FolderItem.cast(item);
          if (folder && typeof folder.getItems === "function") {
            var children = await folder.getItems();
            if (children && typeof children.length === "number") {
              for (var c = 0; c < children.length; c += 1) {
                pending.push(children[c]);
              }
              isFolder = true;
            }
          }
        }
      } catch (_) {}
      if (!isFolder && item !== rootItem) {
        candidates.push(item);
      }
    }
    return candidates;
  }

  async function findImportedAEComp(ppro, project, aepPath, compositionName) {
    ensure(typeof aepPath === "string" && aepPath.length > 0, "AEP path is required for comp resolution");
    ensure(typeof compositionName === "string" && compositionName.trim().length > 0, "Composition name is required for comp resolution");
    var expectedPath = normalizedPath(aepPath);
    var aepFileName = String(aepPath).replace(/\\/g, "/").split("/").pop();
    var premiereDynamicLinkName = normalizedPath(compositionName + "/" + aepFileName);
    var rootFolder = await project.getRootItem();
    var rootItem = ppro.ProjectItem ? ppro.ProjectItem.cast(rootFolder) : rootFolder;
    var items = [];
    // Dynamic Link compositions are ClipProjectItems in Premiere, but some
    // builds do not expose them through FolderItem.getItems immediately after
    // import. The host's media-path index is the authoritative lookup path.
    if (ppro.ClipProjectItem && typeof ppro.ClipProjectItem.findItemsMatchingMediaPath === "function") {
      try {
        var indexedItems = await ppro.ClipProjectItem.findItemsMatchingMediaPath(aepPath, false);
        if (indexedItems && typeof indexedItems.length === "number") {
          for (var indexed = 0; indexed < indexedItems.length; indexed += 1) items.push(indexedItems[indexed]);
        }
      } catch (_) {}
    }
    var treeItems = await collectAECompCandidates(ppro, rootItem || rootFolder);
    for (var treeIndex = 0; treeIndex < treeItems.length; treeIndex += 1) {
      if (items.indexOf(treeItems[treeIndex]) === -1) items.push(treeItems[treeIndex]);
    }
    var exactMatches = [];
    var nameMatches = [];
    for (var i = 0; i < items.length; i += 1) {
      var item = items[i];
      try {
        var candidateProject = typeof item.getProject === "function" ? await item.getProject() : null;
        if (candidateProject && candidateProject.guid && project.guid && candidateProject.guid !== project.guid) continue;
        var mediaPath = typeof item.getMediaFilePath === "function" ? await item.getMediaFilePath() : "";
        var name = item.name;
        var pathMatches = mediaPath ? normalizedPath(mediaPath) === expectedPath : false;
        // Premiere Beta 26.5 exposes imported Dynamic Link items as
        // "<composition>/<aep-file>" and omits getMediaFilePath(). Treat this
        // canonical display name as an exact source+composition identity.
        var isNameMatch = name === compositionName || normalizedPath(name) === premiereDynamicLinkName;
        if (pathMatches && isNameMatch) {
          exactMatches.push(item);
        } else if (isNameMatch) {
          nameMatches.push(item);
        }
      } catch (_) {}
    }
    if (exactMatches.length === 1) {
      return ppro.ProjectItem ? ppro.ProjectItem.cast(exactMatches[0]) : exactMatches[0];
    }
    if (exactMatches.length > 1) {
      throw new Error("Ambiguous After Effects composition: multiple items match composition name '" + compositionName + "' and path " + aepPath);
    }
    if (nameMatches.length === 1) {
      return ppro.ProjectItem ? ppro.ProjectItem.cast(nameMatches[0]) : nameMatches[0];
    }
    if (nameMatches.length > 1) {
      throw new Error("Ambiguous After Effects composition: multiple items match composition name '" + compositionName + "'");
    }
    return null;
  }

  async function describeAECompCandidates(ppro, project) {
    var rootFolder = await project.getRootItem();
    var rootItem = ppro.ProjectItem ? ppro.ProjectItem.cast(rootFolder) : rootFolder;
    var items = await collectAECompCandidates(ppro, rootItem || rootFolder);
    var descriptions = [];
    for (var i = 0; i < items.length && i < 50; i += 1) {
      var item = items[i];
      var mediaPath = "";
      try {
        if (typeof item.getMediaFilePath === "function") mediaPath = await item.getMediaFilePath();
      } catch (_) {}
      descriptions.push({ name: item && item.name, type: item && item.type, mediaPath: mediaPath });
    }
    return descriptions;
  }

  function validateTimelineSpecDocument(value) {
    ensure(value && typeof value === "object" && !Array.isArray(value), "TimelineSpec must be an object");
    ensure(value.schemaVersion === 1, "TimelineSpec schemaVersion 1 is required");
    ensure(Array.isArray(value.scenes) && value.scenes.length > 0, "TimelineSpec requires scenes");
    var ids = {};
    for (var index = 0; index < value.scenes.length; index += 1) {
      var scene = value.scenes[index];
      ensure(scene && typeof scene === "object", "TimelineSpec scene must be an object");
      ensure(typeof scene.id === "string" && /^[A-Za-z0-9_-]+$/.test(scene.id), "TimelineSpec scene id is invalid");
      ensure(!ids[scene.id], "TimelineSpec scene id is duplicated: " + scene.id);
      ids[scene.id] = true;
      ensure(typeof scene.source === "string" && scene.source.length > 0, "TimelineSpec scene source is required");
      ensure(typeof scene.durationMs === "number" && scene.durationMs > 0, "TimelineSpec scene durationMs must be positive");
      ensure(typeof scene.audio === "boolean", "TimelineSpec scene audio must be a boolean");
      ensure(scene.audioPolicy === "preserve" || scene.audioPolicy === "mute", "TimelineSpec scene audioPolicy must be 'preserve' or 'mute'");
      ensure(scene.audio === (scene.audioPolicy === "preserve"), "TimelineSpec scene audio must match audioPolicy");
      if (scene.editorialKind !== undefined) {
        ensure(["a_roll", "b_roll", "cover_card", "title", "logo_outro"].indexOf(scene.editorialKind) !== -1, "TimelineSpec scene editorialKind is invalid");
      }
      if (scene.storyboardItemId !== undefined) {
        ensure(typeof scene.storyboardItemId === "string" && /^[A-Za-z0-9_-]+$/.test(scene.storyboardItemId), "TimelineSpec scene storyboardItemId is invalid");
      }
    }
    if (value.overlays !== undefined) {
      ensure(Array.isArray(value.overlays), "TimelineSpec overlays must be an array");
      for (var ovIndex = 0; ovIndex < value.overlays.length; ovIndex += 1) {
        var ov = value.overlays[ovIndex];
        ensure(ov && typeof ov === "object", "TimelineSpec overlay must be an object");
        ensure(typeof ov.id === "string" && /^[A-Za-z0-9_-]+$/.test(ov.id), "TimelineSpec overlay id is invalid");
        ensure(!ids[ov.id], "TimelineSpec overlay id is duplicated: " + ov.id);
        ids[ov.id] = true;
        ensure(ov.audioPolicy === "mute", "TimelineSpec overlays[" + ovIndex + "].audioPolicy must equal 'mute'");
        if (ov.editorialKind !== undefined) {
          ensure(["a_roll", "b_roll", "cover_card", "title", "logo_outro"].indexOf(ov.editorialKind) !== -1, "TimelineSpec overlay editorialKind is invalid");
        }
        if (ov.storyboardItemId !== undefined) {
          ensure(typeof ov.storyboardItemId === "string" && /^[A-Za-z0-9_-]+$/.test(ov.storyboardItemId), "TimelineSpec overlay storyboardItemId is invalid");
        }
      }
    }
    if (value.graphics !== undefined) {
      ensure(Array.isArray(value.graphics), "TimelineSpec graphics must be an array");
      for (var graphicIndex = 0; graphicIndex < value.graphics.length; graphicIndex += 1) {
        var graphic = value.graphics[graphicIndex];
        ensure(graphic && typeof graphic === "object" && !Array.isArray(graphic), "TimelineSpec graphic must be an object");
        ensure(typeof graphic.id === "string" && /^[A-Za-z0-9_-]+$/.test(graphic.id), "TimelineSpec graphic id is invalid");
        ensure(!ids[graphic.id], "TimelineSpec graphic id is duplicated: " + graphic.id);
        ids[graphic.id] = true;
        ensure(typeof graphic.mogrtPath === "string" && /^([A-Za-z]:[\\\/]|\/)/.test(graphic.mogrtPath), "TimelineSpec graphic mogrtPath must be absolute");
        ensure(typeof graphic.startMs === "number" && graphic.startMs >= 0 && graphic.startMs % 40 === 0, "TimelineSpec graphic startMs must be frame-aligned");
        ensure(typeof graphic.durationMs === "number" && graphic.durationMs > 0 && graphic.durationMs % 40 === 0, "TimelineSpec graphic durationMs must be frame-aligned");
        ensure(typeof graphic.track === "number" && Number.isInteger(graphic.track) && graphic.track >= 1, "TimelineSpec graphic track must be positive");
        ensure(graphic.text && typeof graphic.text === "object" && !Array.isArray(graphic.text) && Object.keys(graphic.text).length > 0, "TimelineSpec graphic text bindings are required");
        ensure(graphic.bindingMode === undefined || graphic.bindingMode === "runtime" || graphic.bindingMode === "preseeded", "TimelineSpec graphic bindingMode is invalid");
        if (graphic.bindingMode === "preseeded") {
          ensure(graphic.seedReceipt && graphic.seedReceipt.mode === "preseeded", "TimelineSpec pre-seeded graphic receipt is required");
          ensure(graphic.seedReceipt.outputPath === graphic.mogrtPath, "TimelineSpec pre-seeded graphic receipt path mismatch");
          ensure(graphic.seedReceipt.text && JSON.stringify(graphic.seedReceipt.text) === JSON.stringify(Object.fromEntries(Object.keys(graphic.text).map(function (field) { return [(graphic.parameterMap || {})[field] || field, graphic.text[field]]; }))), "TimelineSpec pre-seeded graphic text receipt mismatch");
        }
      }
    }
    if (value.dynamicLinks !== undefined) {
      ensure(Array.isArray(value.dynamicLinks), "TimelineSpec dynamicLinks must be an array");
      if (value.dynamicLinks.length > 0) {
        ensure(
          typeof value.durationMs === "number" &&
          Number.isInteger(value.durationMs) &&
          value.durationMs > 0 &&
          (value.durationMs % 40 === 0),
          "TimelineSpec durationMs must be an explicit positive frame-aligned integer when dynamicLinks are present"
        );
      }
      var dlTracks = {};
      for (var dlIndex = 0; dlIndex < value.dynamicLinks.length; dlIndex += 1) {
        var dl = value.dynamicLinks[dlIndex];
        ensure(dl && typeof dl === "object" && !Array.isArray(dl), "TimelineSpec dynamicLinks[" + dlIndex + "] must be an object");
        ensure(typeof dl.id === "string" && /^[A-Za-z0-9_-]+$/.test(dl.id), "TimelineSpec dynamicLinks[" + dlIndex + "].id is invalid");
        ensure(!ids[dl.id], "TimelineSpec dynamicLink id is duplicated: " + dl.id);
        ids[dl.id] = true;
        ensure(typeof dl.project === "string" && dl.project.length > 0 && (/^([A-Za-z]:[\\\/]|\/)/.test(dl.project)), "TimelineSpec dynamicLinks[" + dlIndex + "].project must be an absolute path");
        ensure(typeof dl.composition === "string" && dl.composition.trim().length > 0, "TimelineSpec dynamicLinks[" + dlIndex + "].composition must be a non-empty string");
        ensure(typeof dl.startMs === "number" && Number.isInteger(dl.startMs) && dl.startMs >= 0 && (dl.startMs % 40 === 0), "TimelineSpec dynamicLinks[" + dlIndex + "].startMs must be non-negative and frame-aligned at 25fps");
        ensure(typeof dl.durationMs === "number" && Number.isInteger(dl.durationMs) && dl.durationMs > 0 && (dl.durationMs % 40 === 0), "TimelineSpec dynamicLinks[" + dlIndex + "].durationMs must be positive and frame-aligned at 25fps");
        ensure(typeof dl.track === "number" && Number.isInteger(dl.track) && dl.track >= 1, "TimelineSpec dynamicLinks[" + dlIndex + "].track must be a positive integer");
        ensure(dl.audioPolicy === "mute", "TimelineSpec dynamicLinks[" + dlIndex + "].audioPolicy must equal 'mute'");
        if (dl.editorialKind !== undefined) {
          ensure(["a_roll", "b_roll", "cover_card", "title", "logo_outro"].indexOf(dl.editorialKind) !== -1, "TimelineSpec dynamicLink editorialKind is invalid");
        }
        if (dl.storyboardItemId !== undefined) {
          ensure(typeof dl.storyboardItemId === "string" && /^[A-Za-z0-9_-]+$/.test(dl.storyboardItemId), "TimelineSpec dynamicLink storyboardItemId is invalid");
        }
        ensure(dl.startMs + dl.durationMs <= value.durationMs, "TimelineSpec dynamicLink '" + dl.id + "' exceeds timeline bounds");
        var trackKey = String(dl.track);
        if (!dlTracks[trackKey]) dlTracks[trackKey] = [];
        for (var priorIdx = 0; priorIdx < dlTracks[trackKey].length; priorIdx += 1) {
          var prior = dlTracks[trackKey][priorIdx];
          var overlap = Math.min(dl.startMs + dl.durationMs, prior.startMs + prior.durationMs) - Math.max(dl.startMs, prior.startMs);
          ensure(overlap <= 0, "TimelineSpec dynamicLinks '" + prior.id + "' and '" + dl.id + "' collide on track " + dl.track);
        }
        dlTracks[trackKey].push(dl);
      }
    }
    return value;
  }

  function validateExportRequests(values) {
    ensure(Array.isArray(values) && values.length > 0, "Premiere export requests are required");
    var seen = {};
    return values.map(function (request) {
      ensure(request && typeof request === "object", "Premiere export request must be an object");
      ensure(request.format === "h264" || request.format === "prores", "Premiere export format must be h264 or prores");
      ensure(!seen[request.format], "Premiere export format is duplicated: " + request.format);
      seen[request.format] = true;
      ensure(typeof request.output === "string" && request.output.length > 0, "Premiere export output is required");
      return request;
    });
  }

  async function executeSequentialExports(exportOne, requests, receipts, prepareOne) {
    ensure(typeof exportOne === "function", "Premiere export host capability is unavailable");
    receipts = receipts || {};
    var results = [];
    var validated = validateExportRequests(requests);
    for (var index = 0; index < validated.length; index += 1) {
      var request = validated[index];
      var recovered = typeof receipts.recoverExport === "function"
        ? await receipts.recoverExport(request)
        : undefined;
      if (recovered) {
        ensure(recovered.ok === true, "Recovered Premiere export failed for " + request.format);
        ensure(recovered.format === request.format, "Recovered Premiere export receipt format mismatch");
        ensure(recovered.output === request.output, "Recovered Premiere export receipt output mismatch");
        results.push(recovered);
        continue;
      }
      var prepared = typeof prepareOne === "function" ? await prepareOne(request) : undefined;
      if (typeof receipts.startExport === "function") await receipts.startExport(request);
      var receipt = await exportOne(request, prepared);
      ensure(receipt && receipt.ok === true, "Premiere export failed for " + request.format);
      ensure(receipt.format === request.format, "Premiere export receipt format mismatch");
      ensure(receipt.output === request.output, "Premiere export receipt output mismatch");
      if (typeof receipts.completeExport === "function") await receipts.completeExport(request, receipt);
      results.push(receipt);
    }
    return results;
  }

  async function executePremiereJob(ppro, job, log, hostCapabilities) {
    if (job && job.type === "premiere.assemble") return assemblePremiereJob(ppro, job, log);
    log = typeof log === "function" ? log : function () {};
    ensure(job && (job.type === "premiere.build" || job.type === "premiere.export"), "Unsupported Premiere job type");
    ensure(job.protocolVersion === 1, "Premiere protocolVersion 1 is required");
    ensure(job.id && job.generation, "Premiere job id and generation are required");
    var exportRequests = job.exports || [];
    if (job.type === "premiere.export") validateExportRequests(exportRequests);
    else if (exportRequests.length > 0) validateExportRequests(exportRequests);
    ensure(hostCapabilities && typeof hostCapabilities === "object", "Premiere TimelineSpec host capability is not installed for this Premiere 25.6 build");

    var target;
    if (job.type === "premiere.build") {
      validateTimelineSpecDocument(job.timelineSpec);
      ensure(job.outputProject, "premiere.build outputProject is required");
      ensure(typeof hostCapabilities.buildTimeline === "function", "Premiere TimelineSpec build capability is unavailable");
      target = typeof hostCapabilities.recoverBuild === "function"
        ? await hostCapabilities.recoverBuild(job)
        : undefined;
      if (!target) {
        if (typeof hostCapabilities.startBuild === "function") await hostCapabilities.startBuild(job);
        target = await hostCapabilities.buildTimeline(ppro, job, log);
        if (typeof hostCapabilities.completeBuild === "function") await hostCapabilities.completeBuild(job, target);
      }
      ensure(target && target.project, "Premiere TimelineSpec build did not return a project");

      // Validate scene placement receipts
      var requestedScenes = (job.timelineSpec && job.timelineSpec.scenes) || [];
      ensure(Array.isArray(target.scenes), "Premiere TimelineSpec build did not return scenes evidence");
      ensure(target.scenes.length === requestedScenes.length, "Premiere TimelineSpec build scenes receipt count mismatch");
      var sceneReceiptMap = {};
      for (var sIdx = 0; sIdx < target.scenes.length; sIdx += 1) {
        var s = target.scenes[sIdx];
        ensure(s && typeof s === "object", "Scene receipt must be an object");
        ensure(typeof s.id === "string" && s.id.length > 0, "Scene receipt id is required");
        ensure(!sceneReceiptMap[s.id], "Duplicate scene receipt for id '" + s.id + "'");
        sceneReceiptMap[s.id] = s;
      }
      for (var sReqIdx = 0; sReqIdx < requestedScenes.length; sReqIdx += 1) {
        var sReq = requestedScenes[sReqIdx];
        var sReceipt = sceneReceiptMap[sReq.id];
        ensure(sReceipt, "Missing scene receipt for requested id '" + sReq.id + "'");
        ensure(sReceipt.source === sReq.source, "Scene receipt source mismatch for '" + sReq.id + "'");
        ensure(sReceipt.startMs === sReq.startMs, "Scene receipt startMs mismatch for '" + sReq.id + "'");
        ensure(sReceipt.sourceInMs === (sReq.sourceInMs || 0), "Scene receipt sourceInMs mismatch for '" + sReq.id + "'");
        ensure(sReceipt.durationMs === sReq.durationMs, "Scene receipt durationMs mismatch for '" + sReq.id + "'");
        ensure(sReceipt.videoTrack === sReq.track, "Scene receipt videoTrack mismatch for '" + sReq.id + "': expected " + sReq.track + ", got " + sReceipt.videoTrack);
        ensure(sReceipt.audioPolicy === sReq.audioPolicy, "Scene receipt audioPolicy mismatch for '" + sReq.id + "'");
        ensure(sReceipt.storyboardItemId === sReq.storyboardItemId, "Scene receipt storyboardItemId mismatch for '" + sReq.id + "'");
        ensure(sReceipt.editorialKind === sReq.editorialKind, "Scene receipt editorialKind mismatch for '" + sReq.id + "'");
        ensure(sReceipt.parentStoryboardItemId === sReq.parentStoryboardItemId, "Scene receipt parentStoryboardItemId mismatch for '" + sReq.id + "'");
        if (sReq.audioPolicy === "preserve") {
          ensure(sReceipt.audioTrack === sReq.track, "Scene receipt audioTrack mismatch for '" + sReq.id + "': expected " + sReq.track + ", got " + sReceipt.audioTrack);
          ensure(sReceipt.audioInserted === true, "Scene receipt audioInserted must be true for preserve on '" + sReq.id + "'");
        } else {
          ensure(sReceipt.audioTrack === -1, "Scene receipt audioTrack must be -1 for mute on '" + sReq.id + "'");
          ensure(sReceipt.audioInserted === false, "Scene receipt audioInserted must be false for mute on '" + sReq.id + "'");
        }
      }

      // Validate overlay placement receipts
      var requestedOverlays = (job.timelineSpec && job.timelineSpec.overlays) || [];
      if (requestedOverlays.length > 0 || target.overlays !== undefined) {
        ensure(Array.isArray(target.overlays), "Premiere TimelineSpec build did not return overlays evidence");
        ensure(target.overlays.length === requestedOverlays.length, "Premiere TimelineSpec build overlays receipt count mismatch");
        var overlayReceiptMap = {};
        for (var oIdx = 0; oIdx < target.overlays.length; oIdx += 1) {
          var o = target.overlays[oIdx];
          ensure(o && typeof o === "object", "Overlay receipt must be an object");
          ensure(typeof o.id === "string" && o.id.length > 0, "Overlay receipt id is required");
          ensure(!overlayReceiptMap[o.id], "Duplicate overlay receipt for id '" + o.id + "'");
          overlayReceiptMap[o.id] = o;
        }
        for (var oReqIdx = 0; oReqIdx < requestedOverlays.length; oReqIdx += 1) {
          var oReq = requestedOverlays[oReqIdx];
          var oReceipt = overlayReceiptMap[oReq.id];
          ensure(oReceipt, "Missing overlay receipt for requested id '" + oReq.id + "'");
          ensure(oReceipt.asset === oReq.asset, "Overlay receipt asset mismatch for '" + oReq.id + "'");
          ensure(oReceipt.startMs === oReq.startMs, "Overlay receipt startMs mismatch for '" + oReq.id + "'");
          ensure(oReceipt.durationMs === oReq.durationMs, "Overlay receipt durationMs mismatch for '" + oReq.id + "'");
          ensure(oReceipt.videoTrack === oReq.track, "Overlay receipt videoTrack mismatch for '" + oReq.id + "': expected " + oReq.track + ", got " + oReceipt.videoTrack);
          ensure(oReceipt.audioPolicy === "mute", "Overlay receipt audioPolicy must equal 'mute' for '" + oReq.id + "'");
          ensure(oReceipt.storyboardItemId === oReq.storyboardItemId, "Overlay receipt storyboardItemId mismatch for '" + oReq.id + "'");
          ensure(oReceipt.editorialKind === oReq.editorialKind, "Overlay receipt editorialKind mismatch for '" + oReq.id + "'");
          ensure(oReceipt.parentStoryboardItemId === oReq.parentStoryboardItemId, "Overlay receipt parentStoryboardItemId mismatch for '" + oReq.id + "'");
          ensure(oReceipt.audioTrack === -1, "Overlay receipt audioTrack must equal -1 for '" + oReq.id + "'");
          ensure(oReceipt.audioInserted === false, "Overlay receipt audioInserted must be false for '" + oReq.id + "'");
        }
      }

      // Validate dynamic link receipts
      var requestedGraphics = (job.timelineSpec && job.timelineSpec.graphics) || [];
      if (requestedGraphics.length > 0 || target.graphics !== undefined) {
        ensure(Array.isArray(target.graphics), "Premiere TimelineSpec build did not return graphics evidence");
        ensure(target.graphics.length === requestedGraphics.length, "Premiere TimelineSpec build graphics receipt count mismatch");
        for (var gIdx = 0; gIdx < requestedGraphics.length; gIdx += 1) {
          var gReq = requestedGraphics[gIdx];
          var gReceipt = target.graphics.find(function (entry) { return entry.id === gReq.id; });
          ensure(gReceipt, "Missing graphic receipt for requested id '" + gReq.id + "'");
          ensure(gReceipt.mogrtPath === gReq.mogrtPath, "Graphic receipt MOGRT mismatch for '" + gReq.id + "'");
          ensure(gReceipt.videoTrack === gReq.track, "Graphic receipt track mismatch for '" + gReq.id + "'");
          ensure(gReceipt.editable === true, "Graphic receipt must prove editable parameters for '" + gReq.id + "'");
          if (gReq.bindingMode === "preseeded") {
            ensure(gReceipt.bindingMode === "preseeded", "Graphic receipt binding mode mismatch for '" + gReq.id + "'");
            ensure(Array.isArray(gReceipt.seededParameters) && gReceipt.seededParameters.length === Object.keys(gReq.text).length, "Graphic receipt seeded parameter count mismatch for '" + gReq.id + "'");
            ensure(gReceipt.seedReceipt && gReceipt.seedReceipt.outputSha256 === gReq.seedReceipt.outputSha256, "Graphic seeded MOGRT digest mismatch for '" + gReq.id + "'");
          } else {
            ensure(Array.isArray(gReceipt.boundParameters) && gReceipt.boundParameters.length === Object.keys(gReq.text).length, "Graphic receipt parameter binding count mismatch for '" + gReq.id + "'");
          }
        }
      }

      // Validate dynamic link receipts
      var requestedDynamicLinks = (job.timelineSpec && job.timelineSpec.dynamicLinks) || [];
      if (requestedDynamicLinks.length > 0 || target.dynamicLinks !== undefined) {
        ensure(Array.isArray(target.dynamicLinks), "Premiere TimelineSpec build did not return dynamicLinks evidence");
        ensure(target.dynamicLinks.length === requestedDynamicLinks.length, "Premiere TimelineSpec build dynamicLinks receipt count mismatch");
        var receiptMap = {};
        for (var rIdx = 0; rIdx < target.dynamicLinks.length; rIdx += 1) {
          var r = target.dynamicLinks[rIdx];
          ensure(r && typeof r === "object", "Dynamic link receipt must be an object");
          ensure(typeof r.id === "string" && r.id.length > 0, "Dynamic link receipt id is required");
          ensure(!receiptMap[r.id], "Duplicate dynamic link receipt for id '" + r.id + "'");
          receiptMap[r.id] = r;
        }
        for (var reqIdx = 0; reqIdx < requestedDynamicLinks.length; reqIdx += 1) {
          var req = requestedDynamicLinks[reqIdx];
          var receipt = receiptMap[req.id];
          ensure(receipt, "Missing dynamic link receipt for requested id '" + req.id + "'");
          ensure(receipt.project === req.project, "Dynamic link receipt project mismatch for '" + req.id + "'");
          ensure(receipt.composition === req.composition, "Dynamic link receipt composition mismatch for '" + req.id + "'");
          ensure(receipt.startMs === req.startMs, "Dynamic link receipt startMs mismatch for '" + req.id + "'");
          ensure(receipt.durationMs === req.durationMs, "Dynamic link receipt durationMs mismatch for '" + req.id + "'");
          ensure(receipt.videoTrack === req.track, "Dynamic link receipt videoTrack mismatch for '" + req.id + "': expected " + req.track + ", got " + receipt.videoTrack);
          ensure(receipt.storyboardItemId === req.storyboardItemId, "Dynamic link receipt storyboardItemId mismatch for '" + req.id + "'");
          ensure(receipt.editorialKind === req.editorialKind, "Dynamic link receipt editorialKind mismatch for '" + req.id + "'");
          ensure(receipt.parentStoryboardItemId === req.parentStoryboardItemId, "Dynamic link receipt parentStoryboardItemId mismatch for '" + req.id + "'");
          ensure(receipt.audioTrack === -1, "Dynamic link receipt audioTrack must equal -1 for '" + req.id + "'");
          ensure(receipt.audioInserted === false, "Dynamic link receipt audioInserted must be false for '" + req.id + "'");
        }
      }

      // Validate audio receipts
      var requestedAudio = (job.timelineSpec && job.timelineSpec.audio) || [];
      if (requestedAudio.length > 0 || target.audio !== undefined) {
        ensure(Array.isArray(target.audio), "Premiere TimelineSpec build did not return audio evidence");
        ensure(target.audio.length === requestedAudio.length, "Premiere TimelineSpec build audio receipt count mismatch");
        var audioReceiptMap = {};
        for (var aIdx = 0; aIdx < target.audio.length; aIdx += 1) {
          var a = target.audio[aIdx];
          ensure(a && typeof a === "object", "Audio receipt must be an object");
          ensure(typeof a.id === "string" && a.id.length > 0, "Audio receipt id is required");
          ensure(!audioReceiptMap[a.id], "Duplicate audio receipt for id '" + a.id + "'");
          audioReceiptMap[a.id] = a;
        }
        for (var aReqIdx = 0; aReqIdx < requestedAudio.length; aReqIdx += 1) {
          var aReq = requestedAudio[aReqIdx];
          var aReceipt = audioReceiptMap[aReq.id];
          ensure(aReceipt, "Missing audio receipt for requested id '" + aReq.id + "'");
          ensure(aReceipt.path === aReq.path, "Audio receipt path mismatch for '" + aReq.id + "'");
          ensure(aReceipt.startMs === aReq.startMs, "Audio receipt startMs mismatch for '" + aReq.id + "'");
          ensure(aReceipt.audioTrack === (aReqIdx + 1), "Audio receipt audioTrack mismatch for '" + aReq.id + "': expected " + (aReqIdx + 1) + ", got " + aReceipt.audioTrack);
          ensure(aReceipt.audioInserted === true, "Audio receipt audioInserted must be true for '" + aReq.id + "'");
        }
      }
    } else {
      ensure(job.project, "premiere.export project is required");
      target = { project: job.project, sequenceName: job.sequenceName };
    }
    var receipts = exportRequests.length === 0 ? [] : await executeSequentialExports(function (request, prepared) {
      ensure(typeof hostCapabilities.exportSequence === "function", "Premiere export host capability is unavailable");
      return hostCapabilities.exportSequence(ppro, target, request, job, log, prepared);
    }, exportRequests, {
      recoverExport: function (request) {
        return typeof hostCapabilities.recoverExport === "function" ? hostCapabilities.recoverExport(job, request) : undefined;
      },
      startExport: function (request) {
        return typeof hostCapabilities.startExport === "function" ? hostCapabilities.startExport(job, request) : undefined;
      },
      completeExport: function (request, receipt) {
        return typeof hostCapabilities.completeExport === "function" ? hostCapabilities.completeExport(job, request, receipt) : undefined;
      }
    }, typeof hostCapabilities.prepareExport === "function" ? function (request) {
      return hostCapabilities.prepareExport(ppro, target, request, job, log);
    } : undefined);
    var resultOutput = {
      project: target.project,
      sequenceName: target.sequenceName || job.sequenceName,
      sequenceGuid: target.sequenceGuid || job.sequenceGuid,
      scenes: target.scenes || [],
      overlays: target.overlays || [],
      graphics: target.graphics || [],
      dynamicLinks: target.dynamicLinks || [],
      audio: target.audio || [],
      exports: receipts
    };
    return resultOutput;
  }

  root.AvaPremiereAssembly = {
    assemblePremiereJob: assemblePremiereJob,
    executePremiereJob: executePremiereJob,
    executeSequentialExports: executeSequentialExports,
    validateTimelineSpecDocument: validateTimelineSpecDocument,
    validateExportRequests: validateExportRequests,
    createOpenOptions: createOpenOptions,
    findImportedClip: findImportedClip,
    findImportedAEComp: findImportedAEComp,
    describeAECompCandidates: describeAECompCandidates,
    collectAECompCandidates: collectAECompCandidates,
    collectProjectItems: collectProjectItems
  };
}(globalThis));
