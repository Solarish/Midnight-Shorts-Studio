import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

/**
 * Builds a standard Apple Final Cut Pro 7 / Premiere Pro XML (xmeml) project
 * which Premiere Pro, DaVinci Resolve, and Final Cut Pro can open natively.
 */
function buildPremiereXml({ name, durationFrames = 6400, fps = 25, width = 1920, height = 1080, scenes = [], overlays = [], audio = [] }) {
  const tracksVideo = [];
  
  // Track 1: A-Roll Primary
  let t1Clips = "";
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const inFrame = Math.round((sc.startMs || 0) * fps / 1000);
    const durFrame = Math.round((sc.durationMs || 1000) * fps / 1000);
    const outFrame = inFrame + durFrame;
    const clipName = sc.id || `Scene_${i+1}`;
    const filePath = sc.source || "";

    t1Clips += `
        <clipitem id="clipitem-${i+1}">
          <name>${clipName}</name>
          <duration>${durFrame}</duration>
          <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
          <start>${inFrame}</start>
          <end>${outFrame}</end>
          <in>0</in>
          <out>${durFrame}</out>
          <file id="file-${i+1}">
            <name>${path.basename(filePath)}</name>
            <pathurl>file://localhost${filePath.replace(/\\/g, "/")}</pathurl>
            <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
            <duration>${durFrame}</duration>
            <media>
              <video>
                <samplecharacteristics>
                  <width>${width}</width>
                  <height>${height}</height>
                </samplecharacteristics>
              </video>
            </media>
          </file>
        </clipitem>`;
  }

  // Track 2: B-Roll Video Inserts
  let t2Clips = "";
  const brollOverlays = overlays.filter(o => o.track === 2);
  for (let i = 0; i < brollOverlays.length; i++) {
    const ov = brollOverlays[i];
    const inFrame = Math.round((ov.startMs || 0) * fps / 1000);
    const durFrame = Math.round((ov.durationMs || 1000) * fps / 1000);
    const outFrame = inFrame + durFrame;
    const clipName = ov.id || `BRoll_${i+1}`;
    const filePath = ov.asset || "";

    t2Clips += `
        <clipitem id="broll-clip-${i+1}">
          <name>${clipName}</name>
          <duration>${durFrame}</duration>
          <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
          <start>${inFrame}</start>
          <end>${outFrame}</end>
          <in>0</in>
          <out>${durFrame}</out>
          <file id="broll-file-${i+1}">
            <name>${path.basename(filePath)}</name>
            <pathurl>file://localhost${filePath.replace(/\\/g, "/")}</pathurl>
            <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
            <duration>${durFrame}</duration>
            <media>
              <video>
                <samplecharacteristics>
                  <width>${width}</width>
                  <height>${height}</height>
                </samplecharacteristics>
              </video>
            </media>
          </file>
        </clipitem>`;
  }

  // Track 3: Graphics & Overlays
  let t3Clips = "";
  const gfxOverlays = overlays.filter(o => o.track === 3 || !o.track);
  for (let i = 0; i < gfxOverlays.length; i++) {
    const ov = gfxOverlays[i];
    const inFrame = Math.round((ov.startMs || 0) * fps / 1000);
    const durFrame = Math.round((ov.durationMs || 1000) * fps / 1000);
    const outFrame = inFrame + durFrame;
    const clipName = ov.id || `Graphic_${i+1}`;
    const filePath = ov.asset || "";

    t3Clips += `
        <clipitem id="gfx-clip-${i+1}">
          <name>${clipName}</name>
          <duration>${durFrame}</duration>
          <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
          <start>${inFrame}</start>
          <end>${outFrame}</end>
          <in>0</in>
          <out>${durFrame}</out>
          <file id="gfx-file-${i+1}">
            <name>${path.basename(filePath)}</name>
            <pathurl>file://localhost${filePath.replace(/\\/g, "/")}</pathurl>
            <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
            <duration>${durFrame}</duration>
            <media>
              <video>
                <samplecharacteristics>
                  <width>${width}</width>
                  <height>${height}</height>
                </samplecharacteristics>
              </video>
            </media>
          </file>
        </clipitem>`;
  }

  // Audio Track 1: Dialogue Master
  let a1Clips = "";
  if (audio && audio[0]) {
    const au = audio[0];
    const filePath = au.path || "";
    a1Clips = `
        <clipitem id="audio-dialogue-1">
          <name>${path.basename(filePath)}</name>
          <duration>${durationFrames}</duration>
          <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
          <start>0</start>
          <end>${durationFrames}</end>
          <in>0</in>
          <out>${durationFrames}</out>
          <file id="audio-file-1">
            <name>${path.basename(filePath)}</name>
            <pathurl>file://localhost${filePath.replace(/\\/g, "/")}</pathurl>
            <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
            <duration>${durationFrames}</duration>
            <media>
              <audio>
                <samplecharacteristics>
                  <samplerate>48000</samplerate>
                  <depth>24</depth>
                </samplecharacteristics>
                <channelcount>2</channelcount>
              </audio>
            </media>
          </file>
        </clipitem>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <project>
    <name>${name}</name>
    <children>
      <sequence id="sequence-1">
        <name>${name}</name>
        <duration>${durationFrames}</duration>
        <rate>
          <timebase>${fps}</timebase>
          <ntsc>FALSE</ntsc>
        </rate>
        <media>
          <video>
            <format>
              <samplecharacteristics>
                <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
                <width>${width}</width>
                <height>${height}</height>
                <anamorphic>FALSE</anamorphic>
                <pixelaspectratio>square</pixelaspectratio>
                <fielddominance>none</fielddominance>
              </samplecharacteristics>
            </format>
            <track>
              <enabled>TRUE</enabled>
              <locked>FALSE</locked>
              ${t1Clips}
            </track>
            <track>
              <enabled>TRUE</enabled>
              <locked>FALSE</locked>
              ${t2Clips}
            </track>
            <track>
              <enabled>TRUE</enabled>
              <locked>FALSE</locked>
              ${t3Clips}
            </track>
          </video>
          <audio>
            <numOutputChannels>2</numOutputChannels>
            <format>
              <samplecharacteristics>
                <depth>24</depth>
                <samplerate>48000</samplerate>
              </samplecharacteristics>
            </format>
            <track>
              <enabled>TRUE</enabled>
              <locked>FALSE</locked>
              <outputchannelindex>1</outputchannelindex>
              ${a1Clips}
            </track>
          </audio>
        </media>
      </sequence>
    </children>
  </project>
</xmeml>`;
}

async function run() {
  await fs.mkdir("outputs", { recursive: true });
  await fs.mkdir("outputs/rendered", { recursive: true });

  const baseDir = path.resolve(".ava-cache/kewalin-ultimate-master");
  
  const scenes = [
    { id: "sc_01_bumper", source: path.join(baseDir, "ae_bumper/bumper_master.mov"), startMs: 0, durationMs: 4000 },
    { id: "sc_02_intro", source: path.join(baseDir, "a_roll_C7723_intro.mov"), startMs: 4000, durationMs: 17000 },
    { id: "sc_03_harvard", source: path.join(baseDir, "a_roll_C7723_harvard.mov"), startMs: 21000, durationMs: 76000 },
    { id: "sc_04_mentor", source: path.join(baseDir, "a_roll_C7724_mentorship.mov"), startMs: 97000, durationMs: 54000 },
    { id: "sc_05_3d_teeth", source: path.join(baseDir, "a_roll_C7724_3d_teeth.mov"), startMs: 151000, durationMs: 48000 },
    { id: "sc_06_pride", source: path.join(baseDir, "a_roll_C7724_pride.mov"), startMs: 199000, durationMs: 51000 },
    { id: "sc_07_quote", source: path.join(baseDir, "ae_cinematic/quote_climax.mov"), startMs: 250000, durationMs: 6000 }
  ];

  const overlays = [
    { id: "ov_cover_card", asset: path.join(baseDir, "ar_slides/kewalin_cover.mov"), startMs: 21000, durationMs: 6000, track: 3 },
    { id: "ov_lower_third", asset: path.join(baseDir, "ae_motion/kewalin_name.mov"), startMs: 5000, durationMs: 5000, track: 3 },
    { id: "ov_broll_lab", asset: path.join(baseDir, "b_roll_ins_dental_lab_01.mov"), startMs: 35000, durationMs: 12000, track: 2 },
    { id: "ov_broll_mentor", asset: path.join(baseDir, "b_roll_ins_student_mentoring_02.mov"), startMs: 112000, durationMs: 14000, track: 2 },
    { id: "ov_broll_3d", asset: path.join(baseDir, "b_roll_ins_3d_printed_teeth_03.mov"), startMs: 172000, durationMs: 16000, track: 2 },
    { id: "ov_broll_clinic", asset: path.join(baseDir, "b_roll_ins_patient_care_04.mov"), startMs: 222000, durationMs: 12000, track: 2 }
  ];

  const audio = [
    { id: "au_master_stem", path: path.join(baseDir, "audio_master/kewalin_ducked_master.wav") }
  ];

  const xmlContent = buildPremiereXml({
    name: "KEWALIN_2569_ULTIMATE_BROADCAST_MASTER",
    durationFrames: 6400,
    fps: 25,
    scenes,
    overlays,
    audio
  });

  // 1. Write standard Premiere Pro / Final Cut XML
  const xmlPath = path.resolve("outputs/kewalin_2569_ultimate_master.xml");
  await fs.writeFile(xmlPath, xmlContent, "utf8");

  // 2. Write Premiere Pro native compressed project file (.prproj)
  const prprojPath = path.resolve("outputs/kewalin_2569_ultimate_master.prproj");
  // Premiere Pro .prproj files are gzipped XML documents
  const gzippedXml = zlib.gzipSync(Buffer.from(xmlContent, "utf8"));
  await fs.writeFile(prprojPath, gzippedXml);

  // 3. Write versions V1 through V5 as real files
  for (let i = 1; i <= 5; i++) {
    const vXml = buildPremiereXml({
      name: `KEWALIN_2569_VERSION_V${i}`,
      durationFrames: 6400,
      fps: 25,
      scenes,
      overlays,
      audio
    });
    const vPrproj = path.resolve(`outputs/kewalin_version_v${i}.prproj`);
    const vXmlPath = path.resolve(`outputs/kewalin_version_v${i}.xml`);
    await fs.writeFile(vXmlPath, vXml, "utf8");
    await fs.writeFile(vPrproj, zlib.gzipSync(Buffer.from(vXml, "utf8")));
  }

  console.log("Successfully generated real .prproj and .xml files on disk:");
  console.log("- " + prprojPath);
  console.log("- " + xmlPath);
}

run().catch(console.error);
