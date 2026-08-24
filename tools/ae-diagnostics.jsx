(function () {
  var file = new File("/tmp/ava-ae-diagnostics.txt");
  file.open("w");
  file.write("json=" + (typeof JSON) + "\n");
  file.write("projectItems=" + (app.project ? app.project.numItems : -1) + "\n");
  file.write("version=" + app.version + "\n");
  file.close();
}());
