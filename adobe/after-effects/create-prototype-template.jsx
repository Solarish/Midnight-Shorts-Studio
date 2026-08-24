(function () {
  function addText(comp, name, value, fontSize, position, color) {
    var layer = comp.layers.addText(value);
    layer.name = name;
    var sourceText = layer.property("Source Text");
    var documentValue = sourceText.value;
    documentValue.font = "Arial-BoldMT";
    documentValue.fontSize = fontSize;
    documentValue.fillColor = color;
    documentValue.applyFill = true;
    documentValue.applyStroke = false;
    sourceText.setValue(documentValue);
    layer.property("Transform").property("Position").setValue(position);
    return layer;
  }

  function addDoodle(comp) {
    var layer = comp.layers.addShape();
    layer.name = "DOODLE";
    var root = layer.property("Contents");

    function addStrokePath(name, vertices, color, width) {
      var group = root.addProperty("ADBE Vector Group");
      group.name = name;
      var contents = group.property("Contents");
      var pathGroup = contents.addProperty("ADBE Vector Shape - Group");
      var shape = new Shape();
      shape.vertices = vertices;
      shape.inTangents = [];
      shape.outTangents = [];
      for (var i = 0; i < vertices.length; i += 1) {
        shape.inTangents.push([0, 0]);
        shape.outTangents.push([0, 0]);
      }
      shape.closed = false;
      pathGroup.property("Path").setValue(shape);
      var stroke = contents.addProperty("ADBE Vector Graphic - Stroke");
      stroke.property("Color").setValue(color);
      stroke.property("Stroke Width").setValue(width);
      stroke.property("Line Cap").setValue(2);
    }

    addStrokePath("Amber Sweep", [[70, 310], [155, 250], [245, 275], [330, 205]], [1.0, 0.61, 0.20], 12);
    addStrokePath("Blue Accent", [[800, 390], [900, 315], [1000, 350]], [0.25, 0.72, 1.0], 10);
    addStrokePath("Corner Rays", [[835, 170], [970, 105], [900, 230], [1030, 205]], [1.0, 0.78, 0.35], 8);

    var transform = layer.property("Transform");
    transform.property("Opacity").setValueAtTime(0.0, 0);
    transform.property("Opacity").setValueAtTime(0.7, 100);
    return layer;
  }

  if (!$.global.AVA_TEMPLATE_OUTPUT) {
    throw new Error("AVA_TEMPLATE_OUTPUT was not provided");
  }
  if (app.project && app.project.numItems > 0) {
    throw new Error("After Effects already has a project open. Close it before creating the prototype template.");
  }

  var project = app.project || app.newProject();
  var comp = project.items.addComp("MASTER", 1080, 1920, 1, 5, 24);
  comp.bgColor = [0.015, 0.025, 0.07];

  var background = comp.layers.addSolid([0.02, 0.05, 0.15], "BACKGROUND", 768, 1344, 1, 5);
  background.property("Transform").property("Position").setValue([540, 960]);
  background.property("Transform").property("Scale").setValue([143, 143]);

  var portrait = comp.layers.addSolid([0.15, 0.22, 0.4], "PORTRAIT", 1024, 1536, 1, 5);
  portrait.property("Transform").property("Position").setValue([540, 1120]);
  portrait.property("Transform").property("Scale").setValue([102, 102]);
  portrait.property("Transform").property("Opacity").setValueAtTime(0.0, 0);
  portrait.property("Transform").property("Opacity").setValueAtTime(0.6, 100);

  var vignette = comp.layers.addSolid([0.01, 0.015, 0.04], "VIGNETTE", 1080, 620, 1, 5);
  vignette.property("Transform").property("Position").setValue([540, 1660]);
  vignette.property("Transform").property("Opacity").setValue(88);

  addDoodle(comp);

  var eyebrow = comp.layers.addSolid([1.0, 0.61, 0.20], "EYEBROW", 140, 12, 1, 5);
  eyebrow.property("Transform").property("Position").setValue([145, 1530]);

  var title = addText(comp, "TITLE", "MIDNIGHT SCHOLAR", 76, [80, 1640], [1, 1, 1]);
  title.property("Transform").property("Position").setValueAtTime(0.0, [80, 1705]);
  title.property("Transform").property("Position").setValueAtTime(0.65, [80, 1640]);
  title.property("Transform").property("Opacity").setValueAtTime(0.0, 0);
  title.property("Transform").property("Opacity").setValueAtTime(0.45, 100);

  var subtitle = addText(comp, "SUBTITLE", "AUTOMATED VIDEO ASSEMBLY • PROTOTYPE", 28, [83, 1715], [0.78, 0.86, 1.0]);
  subtitle.property("Transform").property("Opacity").setValueAtTime(0.25, 0);
  subtitle.property("Transform").property("Opacity").setValueAtTime(0.85, 100);

  var bug = addText(comp, "BUG", "PSU BROADCAST LAB", 22, [790, 1835], [1.0, 0.68, 0.28]);
  bug.property("Transform").property("Opacity").setValue(78);

  project.save(new File($.global.AVA_TEMPLATE_OUTPUT));
  project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
}());

