import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../adobe/premiere-uxp/assembly.js", import.meta.url), "utf8");
const sandbox = {};
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: "assembly.js" });
const { assemblePremiereJob } = sandbox.AvaPremiereAssembly;

test("Premiere UXP assembly copies a template before importing and builds a sequence from exact project media", async () => {
  const events = [];
  const outputProject = "/tmp/ava-output.prproj";
  const mediaPath = "/tmp/prototype-master.mov";
  const project = {
    guid: "output-project-guid",
    async saveAs(value) { events.push(`saveAs:${value}`); return true; },
    async getRootItem() { events.push("getRootItem"); return { kind: "folder" }; },
    async importAEComps(value, compositions) {
      events.push(`importAEComps:${value}:${compositions.join(",")}`);
      return true;
    },
    async importFiles(values) { events.push(`importFiles:${values.join(",")}`); return true; },
    async createSequenceFromMedia(name, clips) {
      events.push(`createSequence:${name}:${clips.length}`);
      return { guid: "sequence-guid" };
    },
    async setActiveSequence(sequence) { events.push(`activate:${sequence.guid}`); return true; },
    async save() { events.push("save"); return true; }
  };
  const foreignClip = { async getProject() { return { guid: "another-project" }; } };
  const importedClip = {
    async getProject() { return project; },
    async getMediaFilePath() { return mediaPath; }
  };
  const openOptions = {
    setShowLocateFileDialog(value) { events.push(`locateDialog:${value}`); return this; },
    setShowConvertProjectDialog(value) { events.push(`convertDialog:${value}`); return this; },
    setShowWarningDialog(value) { events.push(`warningDialog:${value}`); return this; },
    setAddToMRUList(value) { events.push(`mru:${value}`); return this; }
  };
  const ppro = {
    OpenProjectOptions() { return openOptions; },
    Project: {
      async open(value, options) {
        events.push(`open:${value}`);
        assert.equal(options, openOptions);
        return project;
      }
    },
    ProjectItem: { cast(value) { return value; } },
    ClipProjectItem: {
      async findItemsMatchingMediaPath(value) {
        assert.equal(value, mediaPath);
        return [foreignClip, importedClip];
      },
      cast(value) { return value; }
    }
  };
  const job = {
    id: "uxp-job",
    type: "premiere.assemble",
    templateProject: "/tmp/template.prproj",
    outputProject,
    sequenceName: "AVA_PROTOTYPE",
    media: [mediaPath],
    aeComps: [{ project: "/tmp/design.aep", compositions: ["MASTER"] }],
    createSequence: true,
    save: true
  };

  const outputs = await assemblePremiereJob(ppro, job, (message) => events.push(`log:${message}`));

  assert.deepEqual(JSON.parse(JSON.stringify(outputs)), {
    project: outputProject,
    sequenceName: "AVA_PROTOTYPE",
    sequenceGuid: "sequence-guid",
    importedMedia: [mediaPath]
  });
  assert.ok(events.indexOf(`saveAs:${outputProject}`) < events.indexOf(`importFiles:${mediaPath}`));
  assert.ok(events.includes("locateDialog:false"));
  assert.ok(events.includes("convertDialog:false"));
  assert.ok(events.includes("warningDialog:false"));
  assert.ok(events.includes("mru:false"));
  assert.ok(events.includes("createSequence:AVA_PROTOTYPE:1"));
  assert.ok(events.includes("save"));
});

test("Premiere UXP assembly refuses unsafe active-project automation", async () => {
  await assert.rejects(
    assemblePremiereJob({}, { id: "unsafe", type: "premiere.assemble" }),
    /outputProject is required/
  );
});

test("Premiere UXP assembly surfaces a failed host import", async () => {
  const project = {
    guid: "project-guid",
    async getRootItem() { return {}; },
    async importFiles() { return false; }
  };
  const ppro = {
    Project: { async createProject() { return project; } },
    ProjectItem: { cast(value) { return value; } }
  };
  await assert.rejects(
    assemblePremiereJob(ppro, {
      id: "failed-import",
      type: "premiere.assemble",
      outputProject: "/tmp/output.prproj",
      media: ["/tmp/missing.mov"],
      save: false
    }),
    /failed to import media files/
  );
});
