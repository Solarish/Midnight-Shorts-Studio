#target aftereffects

(function() {
    var templatePath = "/Users/louislee/Desktop/Adobe_Plugin/templates/after-effects/3d-photo-carousel.aep";
    var outputPath = "/Users/louislee/Desktop/Adobe_Plugin/.ava-cache/real-3d-carousel-render/carousel-kewalin.aep";
    var photoDir = "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ /ภาพนิ่ง/";

    var photoFiles = [];
    var fFolder = new Folder(photoDir);
    if (fFolder.exists) {
        var files = fFolder.getFiles(/\.(jpg|jpeg|png)$/i);
        for (var i = 0; i < files.length; i++) {
            photoFiles.push(files[i].fsName);
        }
    }

    if (photoFiles.length === 0) {
        photoFiles = ["/Users/louislee/Desktop/Adobe_Plugin/.ava-cache/dr_kewalin_upright.png"];
    }

    app.open(new File(templatePath));

    // Function to find Comp by name
    function findComp(name) {
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof CompItem && it.name === name) return it;
        }
        return null;
    }

    // 1. Clear Text 1 so no weird text appears at start
    var compText1 = findComp("Text 1");
    if (compText1 && compText1.numLayers > 0) {
        for (var l = 1; l <= compText1.numLayers; l++) {
            var layer = compText1.layer(l);
            if (layer.property("Source Text")) {
                var doc = layer.property("Source Text").value;
                doc.text = " "; // Blank
                layer.property("Source Text").setValue(doc);
                break;
            }
        }
    }

    // 2. Bind Media 1 to Media 21 with Dr. Kewalin real photos
    for (var m = 1; m <= 21; m++) {
        var compMedia = findComp("Media " + m);
        if (compMedia) {
            var photoPath = photoFiles[(m - 1) % photoFiles.length];
            var fObj = new File(photoPath);
            if (fObj.exists) {
                var imported = app.project.importFile(new ImportOptions(fObj));
                if (compMedia.numLayers > 0) {
                    compMedia.layer(1).replaceSource(imported, false);
                }
            }
        }
    }

    // Save project
    app.project.save(new File(outputPath));
    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
})();
