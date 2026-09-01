(function() {
  try {
    app.open(new File("/Users/louislee/Desktop/Adobe_Plugin/templates/after-effects/3d-photo-carousel.aep"));
    var report = [];
    report.push("=== ITEMS IN PROJECT ===");
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      var type = (it instanceof CompItem) ? "CompItem" : (it instanceof FolderItem) ? "FolderItem" : (it instanceof FootageItem) ? "FootageItem" : "Other";
      report.push(i + ": [" + type + "] " + it.name);
      if (it instanceof CompItem) {
        for (var j = 1; j <= it.numLayers; j++) {
          report.push("   L" + j + ": " + it.layer(j).name);
        }
      }
    }
    var out = new File("/tmp/ae_template_inspection.txt");
    out.open("w");
    out.write(report.join("\n"));
    out.close();
  } catch (e) {
    var errFile = new File("/tmp/ae_template_inspection.txt");
    errFile.open("w");
    errFile.write("ERROR: " + e.toString());
    errFile.close();
  }
})();
