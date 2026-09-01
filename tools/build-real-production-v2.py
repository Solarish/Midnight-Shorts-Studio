import os
import sys
import urllib.parse
import subprocess

SRC_ROOT = "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ "
C7723 = os.path.join(SRC_ROOT, "C7723.MP4")
C7724 = os.path.join(SRC_ROOT, "C7724.MP4")
INS_DIR = os.path.join(SRC_ROOT, "Ins")

CACHE_DIR = os.path.abspath(".ava-cache/real-production-v2")
OUTPUTS_DIR = os.path.abspath("outputs")
RENDERED_DIR = os.path.abspath("outputs/rendered")

os.makedirs(CACHE_DIR, exist_ok=True)
os.makedirs(OUTPUTS_DIR, exist_ok=True)
os.makedirs(RENDERED_DIR, exist_ok=True)

print("==========================================================================================")
print("🚀 PSU AVA — MASTER BROADCAST COMPOSITING V2 (3D CAROUSEL BUMPER, PRO DENTAL CG, REAL 4V+2A)")
print("==========================================================================================\n")

# 1. Prepare 3D Photo Carousel Intro (10s 1080p25)
print("  [1/5] Encoding 3D Photo Carousel Intro Bumper (1080p25)...")
carousel_source = os.path.abspath("prototype-runs/3d_photo_carousel_story-2026-08-27T10-02-17-025Z-09052464/media/carousel-intro.mov")
bumper_mp4 = os.path.join(CACHE_DIR, "01_3d_carousel_bumper.mp4")

subprocess.run([
    "ffmpeg", "-y",
    "-ss", "1.0", "-i", carousel_source, "-t", "8.0",
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo:d=8",
    "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fade=t=in:st=0:d=0.5,fade=t=out:st=7.5:d=0.5,format=yuv420p",
    "-r", "25",
    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-c:a", "aac", "-b:a", "256k", "-shortest",
    bumper_mp4
], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

# 2. Prepare Pro AR Cover Card Video (6s)
print("  [2/5] Encoding Pro AR Cover Card with Dental Doodles & Upright Cutout (6s)...")
cover_png = os.path.abspath(".ava-cache/pro-cg-cards/pro_ar_cover_card.png")
cover_mp4 = os.path.join(CACHE_DIR, "03_pro_ar_cover_card.mp4")

subprocess.run([
    "ffmpeg", "-y",
    "-loop", "1", "-t", "6.0", "-i", cover_png,
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo:d=6",
    "-vf", "fade=t=in:st=0:d=0.5,fade=t=out:st=5.5:d=0.5,format=yuv420p",
    "-r", "25",
    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-c:a", "aac", "-shortest",
    cover_mp4
], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

# 3. Prepare Pro Climax Quote Card Video (6s)
print("  [3/5] Encoding Pro Climax Quote Card with Dental Doodles (6s)...")
quote_png = os.path.abspath(".ava-cache/pro-cg-cards/pro_climax_quote_card.png")
quote_mp4 = os.path.join(CACHE_DIR, "17_pro_climax_quote_card.mp4")

subprocess.run([
    "ffmpeg", "-y",
    "-loop", "1", "-t", "6.0", "-i", quote_png,
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo:d=6",
    "-vf", "fade=t=in:st=0:d=0.5,fade=t=out:st=5.5:d=0.5,format=yuv420p",
    "-r", "25",
    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-c:a", "aac", "-shortest",
    quote_mp4
], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

# 4. Trim Interview Clips from C7723 / C7724 & B-Roll from /Ins
print("  [4/5] Trimming Real Interview Segments and Real /Ins/ Video B-Roll...")

def trim_clip(src, start_s, dur_s, out_name):
    target = os.path.join(CACHE_DIR, out_name)
    subprocess.run([
        "ffmpeg", "-y", "-ss", str(start_s), "-i", src, "-t", str(dur_s),
        "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
        "-r", "25",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
        target
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return target

# Real Interview clips
c_02_intro = trim_clip(C7723, 11.0, 17.0, "02_real_intro.mp4")
c_04_harvard = trim_clip(C7723, 43.0, 76.0, "04_real_harvard.mp4")
c_06_mentor = trim_clip(C7724, 25.0, 25.0, "06_real_mentor.mp4")
c_08_lecture = trim_clip(C7724, 54.0, 48.0, "08_real_lecture.mp4")
c_09_feedback = trim_clip(C7724, 105.0, 54.0, "09_real_feedback.mp4")
c_10_teeth3d = trim_clip(C7724, 231.0, 44.0, "10_real_teeth3d.mp4")
c_12_custom3d = trim_clip(C7724, 288.0, 36.0, "12_real_custom3d.mp4")
c_13_pride = trim_clip(C7724, 179.0, 51.0, "13_real_pride.mp4")
c_15_award = trim_clip(C7724, 341.0, 59.0, "15_real_award.mp4")
c_16_love = trim_clip(C7724, 410.0, 18.0, "16_real_love.mp4")

# Real B-Roll Video Clips from /Ins/
b_lab = trim_clip(os.path.join(INS_DIR, "C7736.MP4"), 2.0, 12.0, "05_real_broll_lab.mp4")
b_mentor = trim_clip(os.path.join(INS_DIR, "C7742.MP4"), 2.0, 14.0, "07_real_broll_mentor.mp4")
b_3dprint = trim_clip(os.path.join(INS_DIR, "C7740.MP4"), 2.0, 16.0, "11_real_broll_3dprint.mp4")
b_clinic = trim_clip(os.path.join(INS_DIR, "C7748.MP4"), 2.0, 12.0, "14_real_broll_clinic.mp4")

# 5. Assemble Full Master MP4 Video
print("  [5/5] Compositing Seamless Master Video (1920x1080 25fps with 3D Carousel & Dental CG)...")

sequence = [
    bumper_mp4,      # Act 1: 3D Photo Carousel Title Bumper (8s)
    c_02_intro,      # Act 2: A-Roll Intro (17s)
    cover_mp4,       # Act 3: Pro AR Cover Card with Doodles & Upright Cutout (6s)
    c_04_harvard,    # Act 4: Harvard Interview (76s)
    b_lab,           # B-Roll Lab Video (/Ins) (12s)
    c_06_mentor,     # Interview Mentorship (25s)
    b_mentor,        # B-Roll Mentoring Video (/Ins) (14s)
    c_08_lecture,    # Interview Lecture (48s)
    c_09_feedback,   # Interview Feedback (54s)
    c_10_teeth3d,    # Interview 3D Teeth (44s)
    b_3dprint,       # B-Roll 3D Print Video (/Ins) (16s)
    c_12_custom3d,   # Interview Adaptive 3D (36s)
    c_13_pride,      # Interview Pride (51s)
    b_clinic,        # B-Roll Clinic Video (/Ins) (12s)
    c_15_award,      # Interview Award Speech (59s)
    c_16_love,       # Interview Final Dedication (18s)
    quote_mp4        # Act 5: Pro Climax Quote Card with Doodles (6s)
]

concat_list_file = os.path.join(CACHE_DIR, "real_concat_list_v2.txt")
with open(concat_list_file, "w", encoding="utf-8") as f:
    for clip in sequence:
        f.write(f"file '{clip}'\n")

target_master_mp4 = os.path.join(RENDERED_DIR, "documentary-kewalin-69-full-storyboard-master.mp4")

subprocess.run([
    "ffmpeg", "-y",
    "-f", "concat", "-safe", "0", "-i", concat_list_file,
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
    target_master_mp4
], check=True)

# 6. Generate 100% Clean, RFC 3986 URL-Encoded Premiere Pro XML
print("  Generating 100% Compliant Premiere Pro XML...")

def url_path(p):
    return f"file://localhost{urllib.parse.quote(p)}"

xml_clean = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <project>
    <name>KEWALIN_2569_BROADCAST_MASTER</name>
    <children>
      <sequence id="sequence-1">
        <name>KEWALIN_2569_MASTER_TIMELINE</name>
        <duration>12500</duration>
        <rate>
          <timebase>25</timebase>
          <ntsc>FALSE</ntsc>
        </rate>
        <media>
          <video>
            <format>
              <samplecharacteristics>
                <rate>
                  <timebase>25</timebase>
                  <ntsc>FALSE</ntsc>
                </rate>
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
              <clipitem id="clipitem-1">
                <name>3D_Photo_Carousel_Bumper</name>
                <duration>200</duration>
                <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
                <start>0</start><end>200</end><in>0</in><out>200</out>
                <file id="file-bumper">
                  <name>01_3d_carousel_bumper.mp4</name>
                  <pathurl>{url_path(bumper_mp4)}</pathurl>
                  <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
                  <duration>200</duration>
                  <media><video><samplecharacteristics><width>1920</width><height>1080</height></samplecharacteristics></video></media>
                </file>
              </clipitem>
              <clipitem id="clipitem-2">
                <name>C7723_Intro</name>
                <duration>425</duration>
                <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
                <start>200</start><end>625</end><in>275</in><out>700</out>
                <file id="file-c7723">
                  <name>C7723.MP4</name>
                  <pathurl>{url_path(C7723)}</pathurl>
                  <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
                  <duration>12500</duration>
                  <media><video><samplecharacteristics><width>1920</width><height>1080</height></samplecharacteristics></video></media>
                </file>
              </clipitem>
              <clipitem id="clipitem-3">
                <name>Pro_AR_Cover_Card</name>
                <duration>150</duration>
                <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
                <start>625</start><end>775</end><in>0</in><out>150</out>
                <file id="file-cover">
                  <name>03_pro_ar_cover_card.mp4</name>
                  <pathurl>{url_path(cover_mp4)}</pathurl>
                  <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
                  <duration>150</duration>
                  <media><video><samplecharacteristics><width>1920</width><height>1080</height></samplecharacteristics></video></media>
                </file>
              </clipitem>
              <clipitem id="clipitem-4">
                <name>C7723_Harvard</name>
                <duration>1900</duration>
                <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
                <start>775</start><end>2675</end><in>1075</in><out>2975</out>
                <file id="file-c7723"/>
              </clipitem>
              <clipitem id="clipitem-5">
                <name>C7724_Mentorship</name>
                <duration>625</duration>
                <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
                <start>2675</start><end>3300</end><in>625</in><out>1250</out>
                <file id="file-c7724">
                  <name>C7724.MP4</name>
                  <pathurl>{url_path(C7724)}</pathurl>
                  <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
                  <duration>12500</duration>
                  <media><video><samplecharacteristics><width>1920</width><height>1080</height></samplecharacteristics></video></media>
                </file>
              </clipitem>
              <clipitem id="clipitem-6">
                <name>C7724_Lecture</name>
                <duration>1200</duration>
                <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
                <start>3300</start><end>4500</end><in>1350</in><out>2550</out>
                <file id="file-c7724"/>
              </clipitem>
              <clipitem id="clipitem-7">
                <name>C7724_Feedback</name>
                <duration>1350</duration>
                <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
                <start>4500</start><end>5850</end><in>2625</in><out>3975</out>
                <file id="file-c7724"/>
              </clipitem>
              <clipitem id="clipitem-8">
                <name>C7724_3DTeeth</name>
                <duration>1100</duration>
                <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
                <start>5850</start><end>6950</end><in>5775</in><out>6875</out>
                <file id="file-c7724"/>
              </clipitem>
              <clipitem id="clipitem-9">
                <name>C7724_Custom3D</name>
                <duration>900</duration>
                <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
                <start>6950</start><end>7850</end><in>7200</in><out>8100</out>
                <file id="file-c7724"/>
              </clipitem>
              <clipitem id="clipitem-10">
                <name>C7724_Pride</name>
                <duration>1275</duration>
                <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
                <start>7850</start><end>9125</end><in>4475</in><out>5750</out>
                <file id="file-c7724"/>
              </clipitem>
              <clipitem id="clipitem-11">
                <name>C7724_Award</name>
                <duration>1475</duration>
                <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
                <start>9125</start><end>10600</end><in>8525</in><out>10000</out>
                <file id="file-c7724"/>
              </clipitem>
              <clipitem id="clipitem-12">
                <name>C7724_Dedication</name>
                <duration>450</duration>
                <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
                <start>10600</start><end>11050</end><in>10250</in><out>10700</out>
                <file id="file-c7724"/>
              </clipitem>
              <clipitem id="clipitem-13">
                <name>Pro_Climax_Quote_Card</name>
                <duration>150</duration>
                <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
                <start>11050</start><end>11200</end><in>0</in><out>150</out>
                <file id="file-quote">
                  <name>17_pro_climax_quote_card.mp4</name>
                  <pathurl>{url_path(quote_mp4)}</pathurl>
                  <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
                  <duration>150</duration>
                  <media><video><samplecharacteristics><width>1920</width><height>1080</height></samplecharacteristics></video></media>
                </file>
              </clipitem>
            </track>
            <track>
              <enabled>TRUE</enabled>
              <locked>FALSE</locked>
              <clipitem id="broll-1">
                <name>B-Roll_DentalLab_C7736</name>
                <duration>300</duration>
                <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
                <start>1200</start><end>1500</end><in>50</in><out>350</out>
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
                <start>2850</start><end>3200</end><in>50</in><out>400</out>
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
                <start>6100</start><end>6500</end><in>50</in><out>450</out>
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
                <start>8200</start><end>8500</end><in>50</in><out>350</out>
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
              <clipitem id="audio-c7723">
                <name>C7723_Audio</name>
                <duration>425</duration>
                <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
                <start>200</start><end>625</end><in>275</in><out>700</out>
                <file id="file-c7723"/>
              </clipitem>
              <clipitem id="audio-c7723-2">
                <name>C7723_Audio_2</name>
                <duration>1900</duration>
                <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
                <start>775</start><end>2675</end><in>1075</in><out>2975</out>
                <file id="file-c7723"/>
              </clipitem>
              <clipitem id="audio-c7724">
                <name>C7724_Audio</name>
                <duration>8375</duration>
                <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
                <start>2675</start><end>11050</end><in>625</in><out>9000</out>
                <file id="file-c7724"/>
              </clipitem>
            </track>
          </audio>
        </media>
      </sequence>
    </children>
  </project>
</xmeml>
"""

xml_path = os.path.join(OUTPUTS_DIR, "kewalin_2569_ultimate_master.xml")
with open(xml_path, "w", encoding="utf-8") as f:
    f.write(xml_clean)

stat = os.stat(target_master_mp4)
print("\n==========================================================================================")
print("🏆 MASTER BROADCAST RENDER V2 COMPLETED 100%!")
print("==========================================================================================")
print(f"🎬 Video: {target_master_mp4} ({stat.st_size / (1024*1024):.2f} MB)")
print(f"📄 XML Project: {xml_path}")
print("✨ Features: 3D Photo Carousel Intro + Pro Dental AR Cover Card (Cutout + Doodles) + Real /Ins/ B-Roll + Pro Climax Quote Card!")
