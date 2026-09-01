import os
import urllib.parse

SRC_ROOT = "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ "
C7723 = os.path.join(SRC_ROOT, "C7723.MP4")
C7724 = os.path.join(SRC_ROOT, "C7724.MP4")
INS_DIR = os.path.join(SRC_ROOT, "Ins")

bumper_mp4 = os.path.abspath(".ava-cache/vlog-suite-perfect/01_perfect_vlog_title_bumper.mp4")
cover_mp4 = os.path.abspath(".ava-cache/vlog-suite-perfect/03_perfect_vlog_ar_cover.mp4")
quote_mp4 = os.path.abspath(".ava-cache/vlog-suite-perfect/17_perfect_vlog_climax_quote.mp4")

OUTPUTS_DIR = os.path.abspath("outputs")
os.makedirs(OUTPUTS_DIR, exist_ok=True)

def url_path(p):
    return f"file://localhost{urllib.parse.quote(p)}"

# 1. Direct Sequence XML (Auto-opens on import)
direct_sequence_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence id="sequence-1">
    <name>อาจารย์ดีเด่น_เกวลิน_2569_MASTER_TIMELINE</name>
    <duration>11834</duration>
    <rate>
      <timebase>25</timebase>
      <ntsc>FALSE</ntsc>
    </rate>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
            <width>1920</width>
            <height>1080</height>
            <anamorphic>FALSE</anamorphic>
            <pixelaspectratio>square</pixelaspectratio>
            <fielddominance>none</fielddominance>
          </samplecharacteristics>
        </format>
        <track>
          <enabled>TRUE</enabled>
          <locked>FALSE</locked>
          
          <clipitem id="clipitem-bumper">
            <name>01_Vlog_Title_Bumper</name>
            <duration>150</duration>
            <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
            <start>0</start><end>150</end><in>0</in><out>150</out>
            <file id="file-bumper">
              <name>01_perfect_vlog_title_bumper.mp4</name>
              <pathurl>{url_path(bumper_mp4)}</pathurl>
              <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
              <duration>150</duration>
              <media><video><samplecharacteristics><width>1920</width><height>1080</height></samplecharacteristics></video></media>
            </file>
          </clipitem>

          <clipitem id="clipitem-intro">
            <name>C7723_Intro</name>
            <duration>425</duration>
            <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
            <start>150</start><end>575</end><in>275</in><out>700</out>
            <file id="file-c7723">
              <name>C7723.MP4</name>
              <pathurl>{url_path(C7723)}</pathurl>
              <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
              <duration>12500</duration>
              <media><video><samplecharacteristics><width>1920</width><height>1080</height></samplecharacteristics></video></media>
            </file>
          </clipitem>

          <clipitem id="clipitem-cover">
            <name>03_Vlog_AR_Cover_Card</name>
            <duration>150</duration>
            <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
            <start>575</start><end>725</end><in>0</in><out>150</out>
            <file id="file-cover">
              <name>03_perfect_vlog_ar_cover.mp4</name>
              <pathurl>{url_path(cover_mp4)}</pathurl>
              <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
              <duration>150</duration>
              <media><video><samplecharacteristics><width>1920</width><height>1080</height></samplecharacteristics></video></media>
            </file>
          </clipitem>

          <clipitem id="clipitem-harvard">
            <name>C7723_Harvard</name>
            <duration>1900</duration>
            <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
            <start>725</start><end>2625</end><in>1075</in><out>2975</out>
            <file id="file-c7723"/>
          </clipitem>

          <clipitem id="clipitem-mentor">
            <name>C7724_Mentorship</name>
            <duration>625</duration>
            <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
            <start>2625</start><end>3250</end><in>625</in><out>1250</out>
            <file id="file-c7724">
              <name>C7724.MP4</name>
              <pathurl>{url_path(C7724)}</pathurl>
              <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
              <duration>12500</duration>
              <media><video><samplecharacteristics><width>1920</width><height>1080</height></samplecharacteristics></video></media>
            </file>
          </clipitem>

          <clipitem id="clipitem-lecture">
            <name>C7724_Lecture</name>
            <duration>1200</duration>
            <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
            <start>3250</start><end>4450</end><in>1350</in><out>2550</out>
            <file id="file-c7724"/>
          </clipitem>

          <clipitem id="clipitem-feedback">
            <name>C7724_Feedback</name>
            <duration>1350</duration>
            <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
            <start>4450</start><end>5800</end><in>2625</in><out>3975</out>
            <file id="file-c7724"/>
          </clipitem>

          <clipitem id="clipitem-teeth3d">
            <name>C7724_3DTeeth</name>
            <duration>1100</duration>
            <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
            <start>5800</start><end>6900</end><in>5775</in><out>6875</out>
            <file id="file-c7724"/>
          </clipitem>

          <clipitem id="clipitem-custom3d">
            <name>C7724_Custom3D</name>
            <duration>900</duration>
            <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
            <start>6900</start><end>7800</end><in>7200</in><out>8100</out>
            <file id="file-c7724"/>
          </clipitem>

          <clipitem id="clipitem-pride">
            <name>C7724_Pride</name>
            <duration>1275</duration>
            <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
            <start>7800</start><end>9075</end><in>4475</in><out>5750</out>
            <file id="file-c7724"/>
          </clipitem>

          <clipitem id="clipitem-award">
            <name>C7724_Award</name>
            <duration>1475</duration>
            <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
            <start>9075</start><end>10550</end><in>8525</in><out>10000</out>
            <file id="file-c7724"/>
          </clipitem>

          <clipitem id="clipitem-dedication">
            <name>C7724_Dedication</name>
            <duration>450</duration>
            <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
            <start>10550</start><end>11000</end><in>10250</in><out>10700</out>
            <file id="file-c7724"/>
          </clipitem>

          <clipitem id="clipitem-quote">
            <name>17_Vlog_Climax_Quote</name>
            <duration>150</duration>
            <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
            <start>11000</start><end>11150</end><in>0</in><out>150</out>
            <file id="file-quote">
              <name>17_perfect_vlog_climax_quote.mp4</name>
              <pathurl>{url_path(quote_mp4)}</pathurl>
              <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
              <duration>150</duration>
              <media><video><samplecharacteristics><width>1920</width><height>1080</height></samplecharacteristics></video></media>
            </file>
          </clipitem>
        </track>

        <!-- Track V2: B-Roll Video Overlays from /Ins -->
        <track>
          <enabled>TRUE</enabled>
          <locked>FALSE</locked>
          <clipitem id="broll-1">
            <name>B-Roll_DentalLab_C7736</name>
            <duration>300</duration>
            <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
            <start>1150</start><end>1450</end><in>50</in><out>350</out>
            <file id="file-c7736">
              <name>C7736.MP4</name>
              <pathurl>{url_path(os.path.join(INS_DIR, 'C7736.MP4'))}</pathurl>
              <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
              <duration>300</duration>
              <media><video><samplecharacteristics><width>1920</width><height>1080</height></samplecharacteristics></video></media>
            </file>
          </clipitem>
          <clipitem id="broll-2">
            <name>B-Roll_Mentoring_C7742</name>
            <duration>350</duration>
            <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
            <start>2800</start><end>3150</end><in>50</in><out>400</out>
            <file id="file-c7742">
              <name>C7742.MP4</name>
              <pathurl>{url_path(os.path.join(INS_DIR, 'C7742.MP4'))}</pathurl>
              <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
              <duration>350</duration>
              <media><video><samplecharacteristics><width>1920</width><height>1080</height></samplecharacteristics></video></media>
            </file>
          </clipitem>
          <clipitem id="broll-3">
            <name>B-Roll_3DPrint_C7740</name>
            <duration>400</duration>
            <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
            <start>6050</start><end>6450</end><in>50</in><out>450</out>
            <file id="file-c7740">
              <name>C7740.MP4</name>
              <pathurl>{url_path(os.path.join(INS_DIR, 'C7740.MP4'))}</pathurl>
              <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
              <duration>400</duration>
              <media><video><samplecharacteristics><width>1920</width><height>1080</height></samplecharacteristics></video></media>
            </file>
          </clipitem>
          <clipitem id="broll-4">
            <name>B-Roll_Clinic_C7748</name>
            <duration>300</duration>
            <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
            <start>8150</start><end>8450</end><in>50</in><out>350</out>
            <file id="file-c7748">
              <name>C7748.MP4</name>
              <pathurl>{url_path(os.path.join(INS_DIR, 'C7748.MP4'))}</pathurl>
              <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
              <duration>300</duration>
              <media><video><samplecharacteristics><width>1920</width><height>1080</height></samplecharacteristics></video></media>
            </file>
          </clipitem>
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
          <clipitem id="audio-intro">
            <name>C7723_Audio_Intro</name>
            <duration>425</duration>
            <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
            <start>150</start><end>575</end><in>275</in><out>700</out>
            <file id="file-c7723"/>
          </clipitem>
          <clipitem id="audio-harvard">
            <name>C7723_Audio_Harvard</name>
            <duration>1900</duration>
            <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
            <start>725</start><end>2625</end><in>1075</in><out>2975</out>
            <file id="file-c7723"/>
          </clipitem>
          <clipitem id="audio-body">
            <name>C7724_Audio_Body</name>
            <duration>8375</duration>
            <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
            <start>2625</start><end>11000</end><in>625</in><out>9000</out>
            <file id="file-c7724"/>
          </clipitem>
        </track>
      </audio>
    </media>
  </sequence>
</xmeml>
"""

# Save as direct sequence and full project
direct_xml_path = os.path.join(OUTPUTS_DIR, "kewalin_2569_master_sequence.xml")
with open(direct_xml_path, "w", encoding="utf-8") as f:
    f.write(direct_sequence_xml)

full_xml_path = os.path.join(OUTPUTS_DIR, "kewalin_2569_ultimate_master.xml")
with open(full_xml_path, "w", encoding="utf-8") as f:
    # Wrap in project container as well
    f.write(direct_sequence_xml.replace("<xmeml version=\"4\">\n  <sequence", "<xmeml version=\"4\">\n  <project>\n    <name>KEWALIN_2569_BROADCAST_MASTER</name>\n    <children>\n      <sequence").replace("</sequence>\n</xmeml>", "</sequence>\n    </children>\n  </project>\n</xmeml>"))

print("✅ Saved Direct Sequence XML:", direct_xml_path)
print("✅ Saved Full Project XML:", full_xml_path)
