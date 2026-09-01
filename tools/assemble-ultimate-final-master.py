import os
import urllib.parse
import subprocess

SRC_ROOT = "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ "
C7723 = os.path.join(SRC_ROOT, "C7723.MP4")
C7724 = os.path.join(SRC_ROOT, "C7724.MP4")
INS_DIR = os.path.join(SRC_ROOT, "Ins")

CACHE_DIR = os.path.abspath(".ava-cache/real-production-v2")
OUTPUTS_DIR = os.path.abspath("outputs")
RENDERED_DIR = os.path.abspath("outputs/rendered")

# 1. 3D Photo Carousel Intro (Real photos, clean start)
carousel_mp4 = os.path.abspath(".ava-cache/real-3d-carousel-render/kewalin_real_carousel_intro.mp4")
bumper_std = os.path.join(CACHE_DIR, "01_final_3d_carousel.mp4")

subprocess.run([
    "ffmpeg", "-y",
    "-i", carousel_mp4,
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo:d=8.33",
    "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fade=t=in:st=0:d=0.5,fade=t=out:st=7.8:d=0.5,format=yuv420p",
    "-r", "25",
    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-c:a", "aac", "-b:a", "256k", "-shortest",
    bumper_std
], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

cover_mp4 = os.path.join(CACHE_DIR, "03_pro_ar_cover_card.mp4")
quote_mp4 = os.path.join(CACHE_DIR, "17_pro_climax_quote_card.mp4")

# Real Interview clips
c_02_intro = os.path.join(CACHE_DIR, "02_real_intro.mp4")
c_04_harvard = os.path.join(CACHE_DIR, "04_real_harvard.mp4")
c_06_mentor = os.path.join(CACHE_DIR, "06_real_mentor.mp4")
c_08_lecture = os.path.join(CACHE_DIR, "08_real_lecture.mp4")
c_09_feedback = os.path.join(CACHE_DIR, "09_real_feedback.mp4")
c_10_teeth3d = os.path.join(CACHE_DIR, "10_real_teeth3d.mp4")
c_12_custom3d = os.path.join(CACHE_DIR, "12_real_custom3d.mp4")
c_13_pride = os.path.join(CACHE_DIR, "13_real_pride.mp4")
c_15_award = os.path.join(CACHE_DIR, "15_real_award.mp4")
c_16_love = os.path.join(CACHE_DIR, "16_real_love.mp4")

# Real B-Roll Video Clips from /Ins/
b_lab = os.path.join(CACHE_DIR, "05_real_broll_lab.mp4")
b_mentor = os.path.join(CACHE_DIR, "07_real_broll_mentor.mp4")
b_3dprint = os.path.join(CACHE_DIR, "11_real_broll_3dprint.mp4")
b_clinic = os.path.join(CACHE_DIR, "14_real_broll_clinic.mp4")

sequence = [
    bumper_std,      # Act 1: Real 3D Carousel Title Bumper (8s)
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

concat_list_file = os.path.join(CACHE_DIR, "final_real_concat.txt")
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

stat = os.stat(target_master_mp4)
print(f"✅ Master Video Rendered: {target_master_mp4} ({stat.st_size / (1024*1024):.2f} MB)")
