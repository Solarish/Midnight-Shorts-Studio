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
    ensure(job.id, "Premiere job id is required");
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

  root.AvaPremiereAssembly = {
    assemblePremiereJob: assemblePremiereJob,
    createOpenOptions: createOpenOptions,
    findImportedClip: findImportedClip,
    collectProjectItems: collectProjectItems
  };
}(globalThis));
