(function () {
  var stage = "guard";
  var receiptFile = File($.global.AVA_MOGRT_RECEIPT);

  function writeReceipt(value) {
    receiptFile.parent.create();
    if (!receiptFile.open("w")) throw new Error("Cannot write MOGRT receipt: " + receiptFile.fsName);
    receiptFile.encoding = "UTF-8";
    receiptFile.write(JSON.stringify(value, null, 2));
    receiptFile.close();
  }

  function fail(message) {
    writeReceipt({
      protocolVersion: 1,
      jobId: $.global.AVA_MOGRT_JOB_ID,
      ok: false,
      stage: stage,
      error: String(message),
      at: new Date().toUTCString()
    });
    if ($.global.AVA_MOGRT_RESET_AFTER_EXPORT === true) {
      app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
      if ($.global.AVA_MOGRT_QUIT_AFTER_PROJECT === true) app.quit();
      else app.newProject();
    }
  }

  function ensure(value, message) {
    if (!value) throw new Error(message);
    return value;
  }

  function chooseThaiFont(document) {
    var candidates = ["NotoSansThai-Regular", "Thonburi", "SukhumvitSet-Text", "Tahoma"];
    var original = document.font;
    for (var index = 0; index < candidates.length; index += 1) {
      try {
        document.font = candidates[index];
        if (document.font === candidates[index]) return candidates[index];
      } catch (_) {}
    }
    document.font = original;
    return original;
  }

  function configureTextLayer(comp, name, sample, fontSize, position, color, leading) {
    var layer = comp.layers.addText(sample);
    layer.name = name;
    var sourceText = layer.property("ADBE Text Properties").property("ADBE Text Document");
    var document = sourceText.value;
    document.fontSize = fontSize;
    document.fillColor = color;
    document.applyFill = true;
    document.applyStroke = false;
    document.justification = ParagraphJustification.LEFT_JUSTIFY;
    document.leading = leading;
    document.autoLeading = false;
    var font = chooseThaiFont(document);
    sourceText.setValue(document);
    layer.property("ADBE Transform Group").property("ADBE Position").setValue(position);
    ensure(sourceText.addToMotionGraphicsTemplateAs(comp, name), "After Effects refused Essential Graphics parameter " + name);
    return font;
  }

  try {
    ensure($.global.AVA_MOGRT_OUTPUT_FOLDER, "AVA_MOGRT_OUTPUT_FOLDER is required");
    ensure($.global.AVA_MOGRT_PROJECT, "AVA_MOGRT_PROJECT is required");
    ensure($.global.AVA_MOGRT_JOB_ID, "AVA_MOGRT_JOB_ID is required");
    ensure($.global.AVA_MOGRT_TEMPLATE_NAME, "AVA_MOGRT_TEMPLATE_NAME is required");
    if (($.global.AVA_MOGRT_PROJECT_ONLY === true || $.global.AVA_MOGRT_DEDICATED === true) && app.project) {
      try { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (_) {}
      app.newProject();
    } else if (!app.project) app.newProject();
    ensure(app.project, "After Effects did not provide a project");

    // This guard must run before the first mutation. The launcher opens a
    // dedicated stable AE instance, but the host still refuses any attached,
    // saved, populated, or dirty project to protect the operator's work.
    if (app.project.file || app.project.numItems > 0 || app.project.dirty) {
      throw new Error("REFUSED: After Effects project is saved, populated, or dirty; use a fresh dedicated stable instance");
    }

    stage = "build";
    app.beginUndoGroup("PSU Cover Text MOGRT");
    var comp = app.project.items.addComp("PSU_COVER_TEXT", 1920, 1080, 1, 6, 25);
    comp.motionGraphicsTemplateName = String($.global.AVA_MOGRT_TEMPLATE_NAME);
    comp.bgColor = [0, 0, 0];

    var fonts = [];
    fonts.push(configureTextLayer(comp, "PERSON_NAME", String($.global.AVA_MOGRT_PERSON_NAME), 78, [140, 410], [1.0, 1.0, 1.0], 92));
    fonts.push(configureTextLayer(comp, "POSITION_TITLE", String($.global.AVA_MOGRT_POSITION_TITLE), 38, [144, 510], [0.86, 0.9, 0.95], 48));
    fonts.push(configureTextLayer(comp, "AWARD", String($.global.AVA_MOGRT_AWARD), 34, [144, 585], [0.94, 0.72, 0.25], 44));

    stage = "save-project";
    var projectFile = File($.global.AVA_MOGRT_PROJECT);
    projectFile.parent.create();
    app.project.save(projectFile);
    ensure(projectFile.exists && projectFile.length > 0, "Saved MOGRT generator project is missing or empty");

    // exportAsMotionGraphicsTemplate can invalidate the CompItem wrapper even
    // though the export itself succeeds. Capture receipt fields while the
    // wrapper is still valid so a successful MOGRT never receives a false
    // "Object is invalid" failure receipt.
    var compMetadata = {
      name: comp.name,
      frameRate: comp.frameRate,
      width: comp.width,
      height: comp.height
    };

    if ($.global.AVA_MOGRT_PROJECT_ONLY === true) {
      app.endUndoGroup();
      try {
        writeReceipt({
          protocolVersion: 1,
          jobId: $.global.AVA_MOGRT_JOB_ID,
          ok: true,
          projectOnly: true,
          project: projectFile.fsName,
          bytes: projectFile.length,
          comp: compMetadata.name,
          frameRate: compMetadata.frameRate,
          width: compMetadata.width,
          height: compMetadata.height,
          parameters: ["PERSON_NAME", "POSITION_TITLE", "AWARD"],
          at: new Date().toUTCString()
        });
      } catch (_) {}
      app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
      if ($.global.AVA_MOGRT_QUIT_AFTER_PROJECT === true) app.quit();
      else app.newProject();
      return;
    }

    stage = "export";
    var outputFolder = Folder($.global.AVA_MOGRT_OUTPUT_FOLDER);
    outputFolder.create();
    ensure(comp.exportAsMotionGraphicsTemplate(true, outputFolder.fsName), "After Effects refused Motion Graphics Template export");
    var outputFile = File(outputFolder.fsName + "/" + String($.global.AVA_MOGRT_TEMPLATE_NAME) + ".mogrt");
    ensure(outputFile.exists && outputFile.length > 0, "Expected MOGRT output is missing or empty: " + outputFile.fsName);
    var outputPath = outputFile.fsName;
    var outputBytes = outputFile.length;
    app.endUndoGroup();

    stage = "receipt";
    writeReceipt({
      protocolVersion: 1,
      jobId: $.global.AVA_MOGRT_JOB_ID,
      ok: true,
      output: outputPath,
      bytes: outputBytes,
      project: projectFile.fsName,
      comp: compMetadata.name,
      frameRate: compMetadata.frameRate,
      width: compMetadata.width,
      height: compMetadata.height,
      parameters: ["PERSON_NAME", "POSITION_TITLE", "AWARD"],
      text: {
        personName: String($.global.AVA_MOGRT_PERSON_NAME),
        positionTitle: String($.global.AVA_MOGRT_POSITION_TITLE),
        award: String($.global.AVA_MOGRT_AWARD)
      },
      fonts: fonts,
      at: new Date().toUTCString()
    });
    if ($.global.AVA_MOGRT_RESET_AFTER_EXPORT === true) {
      app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
      if ($.global.AVA_MOGRT_QUIT_AFTER_PROJECT === true) app.quit();
      else app.newProject();
    }
  } catch (error) {
    try { app.endUndoGroup(); } catch (_) {}
    try { fail(error && error.message ? error.message : error); }
    catch (_) {}
  }
}());
