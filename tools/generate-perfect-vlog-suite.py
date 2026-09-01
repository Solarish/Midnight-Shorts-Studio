import os
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps
import subprocess

CACHE_DIR = os.path.abspath(".ava-cache/vlog-suite-perfect")
OUTPUTS_DIR = os.path.abspath("outputs")
RENDERED_DIR = os.path.abspath("outputs/rendered")

os.makedirs(CACHE_DIR, exist_ok=True)
os.makedirs(OUTPUTS_DIR, exist_ok=True)
os.makedirs(RENDERED_DIR, exist_ok=True)

# Fonts
font_chalk_bold = "/System/Library/Fonts/Supplemental/ChalkboardSE.ttc"
font_sukhumvit = "/System/Library/Fonts/Supplemental/SukhumvitSet.ttc"

f_title_chalk = ImageFont.truetype(font_chalk_bold, 58, index=0)
f_curved = ImageFont.truetype(font_chalk_bold, 24, index=0)
f_sub_thai = ImageFont.truetype(font_sukhumvit, 28, index=3)
f_thai_hero = ImageFont.truetype(font_sukhumvit, 40, index=3)
f_thai_sub = ImageFont.truetype(font_sukhumvit, 26, index=2)
f_thai_body = ImageFont.truetype(font_sukhumvit, 23, index=1)
f_quote_main = ImageFont.truetype(font_sukhumvit, 40, index=3)
f_quote_sub = ImageFont.truetype(font_sukhumvit, 30, index=2)
f_tag = ImageFont.truetype(font_chalk_bold, 24, index=0)

WHITE = (255, 255, 255, 255)
BLUE_ACCENT = (2, 132, 199, 255)
GOLD_ACCENT = (250, 204, 21, 255)

# 1. Doodles
def draw_handdrawn_star(draw, cx, cy, size=70, color=WHITE, width=4):
    angles = [i * (2 * math.pi / 5) - math.pi / 2 for i in range(5)]
    order = [0, 2, 4, 1, 3, 0]
    r = size / 2.0
    pts = [(cx + r * math.cos(angles[idx]), cy + r * math.sin(angles[idx])) for idx in order]
    draw.line(pts, fill=color, width=width, joint="curve")

def draw_handdrawn_flower(draw, cx, cy, size=60, color=WHITE, width=4):
    r_center = size * 0.22
    r_petal = size * 0.38
    draw.ellipse([cx - r_center, cy - r_center, cx + r_center, cy + r_center], outline=color, width=width)
    for i in range(5):
        ang = i * (2 * math.pi / 5) - math.pi / 2
        px = cx + (r_center + r_petal * 0.75) * math.cos(ang)
        py = cy + (r_center + r_petal * 0.75) * math.sin(ang)
        draw.ellipse([px - r_petal*0.6, py - r_petal*0.6, px + r_petal*0.6, py + r_petal*0.6], outline=color, width=width)

def draw_handdrawn_hearts(draw, cx, cy, size=50, color=WHITE, width=4):
    def draw_single_heart(hx, hy, s, rot=0):
        pts = []
        for t in np.linspace(0, 2 * math.pi, 40):
            x = 16 * (math.sin(t) ** 3)
            y = -(13 * math.cos(t) - 5 * math.cos(2*t) - 2 * math.cos(3*t) - math.cos(4*t))
            x_rot = (x * math.cos(rot) - y * math.sin(rot)) * (s / 32.0) + hx
            y_rot = (x * math.sin(rot) + y * math.cos(rot)) * (s / 32.0) + hy
            pts.append((x_rot, y_rot))
        draw.polygon(pts, outline=color, width=width)

    draw_single_heart(cx, cy, size, rot=math.radians(-10))
    draw_single_heart(cx + size*0.7, cy - size*0.6, size * 0.65, rot=math.radians(15))

def draw_curved_arrow(draw, start, ctrl, end, color=WHITE, width=4):
    pts = []
    for t in np.linspace(0, 1.0, 30):
        x = (1-t)**2 * start[0] + 2*(1-t)*t * ctrl[0] + t**2 * end[0]
        y = (1-t)**2 * start[1] + 2*(1-t)*t * ctrl[1] + t**2 * end[1]
        pts.append((x, y))
    draw.line(pts, fill=color, width=width, joint="curve")
    dx = end[0] - pts[-4][0]
    dy = end[1] - pts[-4][1]
    ang = math.atan2(dy, dx)
    head_len = 18
    p1 = (end[0] - head_len * math.cos(ang - math.pi/6), end[1] - head_len * math.sin(ang - math.pi/6))
    p2 = (end[0] - head_len * math.cos(ang + math.pi/6), end[1] - head_len * math.sin(ang + math.pi/6))
    draw.line([p1, end, p2], fill=color, width=width, joint="curve")

def draw_sparkle_cluster(draw, cx, cy, size=40, color=WHITE):
    draw_handdrawn_star(draw, cx, cy, size=size, color=color, width=3)
    draw_handdrawn_star(draw, cx + size*0.8, cy + size*0.5, size=size*0.6, color=color, width=2)
    draw.ellipse([cx - size*0.4, cy + size*0.6, cx - size*0.4 + 6, cy + size*0.6 + 6], fill=color)

def draw_handdrawn_tooth_doodle(draw, x, y, size=80, color=WHITE, width=4):
    s = size / 100.0
    pts = [
        (x - 35*s, y - 30*s), (x - 12*s, y - 40*s), (x + 12*s, y - 40*s),
        (x + 35*s, y - 30*s), (x + 45*s, y - 10*s), (x + 38*s, y + 25*s),
        (x + 24*s, y + 48*s), (x + 10*s, y + 18*s), (x - 10*s, y + 18*s),
        (x - 24*s, y + 48*s), (x - 38*s, y + 25*s), (x - 45*s, y - 10*s)
    ]
    draw.polygon(pts, outline=color, width=width)
    draw.ellipse([x - 15*s, y - 10*s, x - 7*s, y - 2*s], fill=color)
    draw.ellipse([x + 7*s, y - 10*s, x + 15*s, y - 2*s], fill=color)
    draw.arc([x - 10*s, y - 4*s, x + 10*s, y + 14*s], start=10, end=170, fill=color, width=3)
    draw.line([(x - 22*s, y - 28*s), (x - 22*s, y - 16*s)], fill=color, width=3)
    draw.line([(x - 28*s, y - 22*s), (x - 16*s, y - 22*s)], fill=color, width=3)

def draw_curved_text(img, text, font, center, radius, start_angle_deg, color=WHITE):
    draw = ImageDraw.Draw(img)
    cur_angle = math.radians(start_angle_deg)
    for char in text:
        w = draw.textlength(char, font=font)
        ang_step = (w + 4) / radius
        ang = cur_angle + ang_step / 2.0
        x = center[0] + radius * math.cos(ang)
        y = center[1] + radius * math.sin(ang)
        char_img = Image.new("RGBA", (int(w * 2 + 30), int(font.size * 2 + 30)), (0, 0, 0, 0))
        c_draw = ImageDraw.Draw(char_img)
        c_draw.text((15, 15), char, font=font, fill=color)
        rot_deg = -math.degrees(ang + math.pi/2)
        rotated = char_img.rotate(rot_deg, resample=Image.Resampling.BICUBIC, expand=True)
        img.paste(rotated, (int(x - rotated.width/2), int(y - rotated.height/2)), mask=rotated)
        cur_angle += ang_step

def create_base_canvas():
    # Warm lifestyle background (ComfyUI dental background with warm grade)
    bg_file = ".ava-cache/comfy-dental/comfy_dental_bg.png"
    if os.path.exists(bg_file):
        bg = Image.open(bg_file).convert("RGBA").resize((1920, 1080), Image.Resampling.LANCZOS)
    else:
        bg = Image.new("RGBA", (1920, 1080), (15, 23, 42, 255))
    
    # Warm subtle vignette
    tint = Image.new("RGBA", (1920, 1080), (10, 20, 45, 90))
    canvas = Image.alpha_composite(bg, tint)

    # Place AI Cutout of Dr. Kewalin seamlessly on left (no white rectangle box)
    cutout_path = ".ava-cache/dr_kewalin_cutout_upright.png"
    if os.path.exists(cutout_path):
        cutout = Image.open(cutout_path).convert("RGBA")
        target_h = 1020
        target_w = int(cutout.width * (target_h / cutout.height))
        cutout_scaled = cutout.resize((target_w, target_h), Image.Resampling.LANCZOS)
        
        # Soft shadow behind cutout
        shadow = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
        shadow_box = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 180))
        shadow.paste(shadow_box, (70, 70), mask=cutout_scaled.split()[3])
        shadow = shadow.filter(ImageFilter.GaussianBlur(30))
        canvas = Image.alpha_composite(canvas, shadow)

        # White chalk contour stroke around person
        mask_dilated = cutout_scaled.split()[3].filter(ImageFilter.MaxFilter(7))
        stroke_img = Image.new("RGBA", (target_w, target_h), (255, 255, 255, 230))
        canvas.paste(stroke_img, (60, 65), mask=mask_dilated)
        
        # Paste Dr. Kewalin
        canvas.paste(cutout_scaled, (60, 65), mask=cutout_scaled)

    return canvas

# =========================================================================
# 2. BUILD TITLE BUMPER (PERFECT VLOG FRAMING)
# =========================================================================
print("🎨 Building Perfect Title Bumper...")
canvas_bumper = create_base_canvas()
b_doodle = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
bd_draw = ImageDraw.Draw(b_doodle)

draw_sparkle_cluster(bd_draw, 140, 100, size=44, color=WHITE)
draw_handdrawn_star(bd_draw, 740, 220, size=75, color=WHITE, width=4)
draw_handdrawn_flower(bd_draw, 1740, 140, size=65, color=WHITE, width=4)
draw_handdrawn_hearts(bd_draw, 1720, 880, size=60, color=WHITE, width=4)
draw_handdrawn_tooth_doodle(bd_draw, 840, 440, size=95, color=WHITE, width=4)

# Headline on Right (Sukhumvit Set for Thai text)
bd_draw.text((1340, 180), "PSU MODEL TEACHER 2026", font=f_title_chalk, fill=WHITE, anchor="mm")
bd_draw.text((1340, 245), "คณะทันตแพทยศาสตร์ มหาวิทยาลัยสงขลานครินทร์", font=f_sub_thai, fill=GOLD_ACCENT, anchor="mm")

draw_curved_text(b_doodle, "BEST TEACHER DESERVES THE BEST", f_curved, (1340, 460), 380, -115, color=WHITE)

# Teacher Hero Name Capsule on Right
bd_draw.rounded_rectangle([960, 660, 1720, 820], radius=24, fill=(255, 255, 255, 235), outline=WHITE, width=3)
bd_draw.text((1340, 715), "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์", font=f_thai_hero, fill=(15, 23, 42), anchor="mm")
bd_draw.text((1340, 770), "อาจารย์ตัวอย่างดีเด่น ประจำปี ๒๕๖๙", font=f_thai_sub, fill=BLUE_ACCENT, anchor="mm")

draw_curved_arrow(bd_draw, (950, 730), (820, 700), (740, 600), color=WHITE, width=4)

canvas_bumper = Image.alpha_composite(canvas_bumper, b_doodle)
bumper_png = os.path.join(CACHE_DIR, "vlog_title_bumper.png")
canvas_bumper.convert("RGB").save(bumper_png, quality=95)
print(f"✅ Saved Perfect Title Bumper: {bumper_png}")

# =========================================================================
# 3. BUILD AR COVER CARD (PERFECT VLOG FRAMING)
# =========================================================================
print("🎨 Building Perfect AR Cover Card...")
canvas_cover = create_base_canvas()
c_doodle = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
cd_draw = ImageDraw.Draw(c_doodle)

draw_sparkle_cluster(cd_draw, 140, 100, size=44, color=WHITE)
draw_handdrawn_star(cd_draw, 740, 220, size=75, color=WHITE, width=4)
draw_handdrawn_flower(cd_draw, 1740, 140, size=65, color=WHITE, width=4)
draw_handdrawn_hearts(cd_draw, 1740, 900, size=55, color=WHITE, width=4)
draw_handdrawn_tooth_doodle(cd_draw, 820, 440, size=90, color=WHITE, width=4)

# Top Right Title
cd_draw.text((1340, 140), "PSU MODEL TEACHER 2026", font=f_title_chalk, fill=WHITE, anchor="mm")
cd_draw.text((1340, 200), "อาจารย์ตัวอย่างดีเด่น ประจำปี ๒๕๖๙", font=f_sub_thai, fill=GOLD_ACCENT, anchor="mm")

draw_curved_text(c_doodle, "BEST TEACHER DESERVES THE BEST", f_curved, (1340, 400), 380, -115, color=WHITE)

# Mini Capsule Box on Right
cap_x1, cap_y1, cap_x2, cap_y2 = 940, 360, 1800, 850
cap_layer = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
cap_draw = ImageDraw.Draw(cap_layer)
cap_draw.rounded_rectangle([cap_x1, cap_y1, cap_x2, cap_y2], radius=24, fill=(255, 255, 255, 235), outline=WHITE, width=3)
c_doodle = Image.alpha_composite(c_doodle, cap_layer)

cd_final = ImageDraw.Draw(c_doodle)
cd_final.text((cap_x1 + 40, cap_y1 + 30), "“Profile Highlight”", font=ImageFont.truetype(font_sukhumvit, 28, index=3), fill=BLUE_ACCENT)
cd_final.text((cap_x1 + 40, cap_y1 + 70), "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์", font=ImageFont.truetype(font_sukhumvit, 34, index=3), fill=(15, 23, 42))
cd_final.line([(cap_x1 + 40, cap_y1 + 120), (cap_x2 - 40, cap_y1 + 120)], fill=(203, 213, 225), width=2)

bullets = [
    ("• สาขาวิชา", "สาขาวิทยาศาสตร์และเทคโนโลยี และสาขาวิทยาศาสตร์สุขภาพ"),
    ("• การศึกษา", "ศิษย์เก่าทันตแพทย์ ม.อ. / ป.เอก Harvard University"),
    ("• นวัตกรรม 3D", "ผลงานนวัตกรรม 'ฟันจำลอง 3 มิติ' (3D Teeth Model)"),
    ("• ปรัชญาครู", "วัฒนธรรมพี่น้อง & เทคนิคการให้ฟีดแบคเสริมแรงบวก"),
    ("• ประสบการณ์", "อาจารย์ผู้อุทิศตนเพื่อการเรียนการสอนกว่า 20 ปี")
]

cur_y = cap_y1 + 140
for label, text in bullets:
    cd_final.text((cap_x1 + 40, cur_y), label + " :", font=f_thai_body, fill=BLUE_ACCENT)
    cd_final.text((cap_x1 + 205, cur_y), text, font=f_thai_body, fill=(30, 41, 59))
    cur_y += 62

draw_curved_arrow(cd_final, (cap_x1 - 10, cap_y1 + 200), (840, cap_y1 + 180), (740, cap_y1 + 120), color=WHITE, width=4)

canvas_cover = Image.alpha_composite(canvas_cover, c_doodle)
cover_png = os.path.join(CACHE_DIR, "vlog_ar_cover_card.png")
canvas_cover.convert("RGB").save(cover_png, quality=95)
print(f"✅ Saved Perfect AR Cover Card: {cover_png}")

# =========================================================================
# 4. BUILD CLIMAX QUOTE CARD (PERFECT VLOG FRAMING)
# =========================================================================
print("🎨 Building Perfect Climax Quote Card...")
raw_quote_bg = Image.open(".ava-cache/upright_photos/DSC02135.JPG").convert("RGBA")
qw, qh = raw_quote_bg.size
q_crop = raw_quote_bg.crop(((qw - int(qh*16/9))//2, 0, (qw + int(qh*16/9))//2, qh)).resize((1920, 1080), Image.Resampling.LANCZOS)
q_crop_blur = q_crop.filter(ImageFilter.GaussianBlur(18))
quote_canvas = Image.alpha_composite(q_crop_blur, Image.new("RGBA", (1920, 1080), (15, 23, 42, 110)))

q_doodle = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
qd_draw = ImageDraw.Draw(q_doodle)

draw_sparkle_cluster(qd_draw, 180, 120, size=40, color=WHITE)
draw_handdrawn_star(qd_draw, 1740, 140, size=75, color=WHITE, width=4)
draw_handdrawn_flower(qd_draw, 180, 880, size=65, color=WHITE, width=4)
draw_handdrawn_hearts(qd_draw, 1720, 860, size=55, color=WHITE, width=4)
draw_handdrawn_tooth_doodle(qd_draw, 960, 130, size=85, color=WHITE, width=4)

qx1, qy1, qx2, qy2 = 180, 220, 1740, 860
qb_layer = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
qb_draw = ImageDraw.Draw(qb_layer)
qb_draw.rounded_rectangle([qx1, qy1, qx2, qy2], radius=28, fill=(255, 255, 255, 235), outline=WHITE, width=4)
q_doodle = Image.alpha_composite(q_doodle, qb_layer)

qd_final = ImageDraw.Draw(q_doodle)
qd_final.text((960, qy1 + 45), "“บทสรุปปรัชญาความเป็นครูและการอุทิศตน”", font=ImageFont.truetype(font_sukhumvit, 30, index=3), fill=BLUE_ACCENT, anchor="mm")
qd_final.text((qx1 + 60, qy1 + 80), "“", font=ImageFont.truetype(font_chalk_bold, 110, index=0), fill=BLUE_ACCENT)
qd_final.text((qx2 - 120, qy2 - 190), "”", font=ImageFont.truetype(font_chalk_bold, 110, index=0), fill=BLUE_ACCENT)

qd_final.text((960, qy1 + 180), "ความภูมิใจที่สุดคือการได้เห็นลูกศิษย์เติบโต", font=f_quote_main, fill=(15, 23, 42), anchor="mm")
qd_final.text((960, qy1 + 260), "และนำหลักคิดไปใช้เพื่อประโยชน์ของเพื่อนมนุษย์", font=f_quote_main, fill=BLUE_ACCENT, anchor="mm")
qd_final.text((960, qy1 + 340), "ทำหน้าที่ของตัวเองให้ดีที่สุด ทำด้วยความรักและสนุก", font=f_quote_sub, fill=(71, 85, 105), anchor="mm")

qd_final.line([(960 - 350, qy1 + 410), (960 + 350, qy1 + 410)], fill=(203, 213, 225), width=2)
qd_final.text((960, qy1 + 470), "รองศาสตราจารย์ ดร.ทันตแพทย์หญิง เกวลิน ธรรมสิทธิ์บูรณ์", font=f_thai_hero, fill=(15, 23, 42), anchor="mm")
qd_final.text((960, qy1 + 525), "อาจารย์ตัวอย่างดีเด่น คณะทันตแพทยศาสตร์ มหาวิทยาลัยสงขลานครินทร์", font=ImageFont.truetype(font_sukhumvit, 26, index=1), fill=(100, 116, 139), anchor="mm")

draw_curved_arrow(qd_final, (qx1 + 100, qy2 - 60), (qx1 + 60, qy2 - 110), (qx1 + 120, qy2 - 130), color=BLUE_ACCENT, width=3)
draw_curved_text(q_doodle, "TEACH WITH LOVE & PASSION", f_curved, (960, 710), 550, -118, color=WHITE)

quote_canvas = Image.alpha_composite(quote_canvas, q_doodle)
quote_png = os.path.join(CACHE_DIR, "vlog_climax_quote_card.png")
quote_canvas.convert("RGB").save(quote_png, quality=95)
print(f"✅ Saved Perfect Climax Quote Card: {quote_png}")

# =========================================================================
# 5. ENCODE VIDEO CLIPS & MASTER ASSEMBLY
# =========================================================================
print("\n🎬 Encoding Videos and Assembling Master...")
bumper_mp4 = os.path.join(CACHE_DIR, "01_perfect_vlog_title_bumper.mp4")
cover_mp4 = os.path.join(CACHE_DIR, "03_perfect_vlog_ar_cover.mp4")
quote_mp4 = os.path.join(CACHE_DIR, "17_perfect_vlog_climax_quote.mp4")

subprocess.run([
    "ffmpeg", "-y", "-loop", "1", "-t", "6.0", "-i", bumper_png,
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo:d=6",
    "-vf", "fade=t=in:st=0:d=0.5,fade=t=out:st=5.5:d=0.5,format=yuv420p",
    "-r", "25", "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-c:a", "aac", "-shortest", bumper_mp4
], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

subprocess.run([
    "ffmpeg", "-y", "-loop", "1", "-t", "6.0", "-i", cover_png,
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo:d=6",
    "-vf", "fade=t=in:st=0:d=0.5,fade=t=out:st=5.5:d=0.5,format=yuv420p",
    "-r", "25", "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-c:a", "aac", "-shortest", cover_mp4
], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

subprocess.run([
    "ffmpeg", "-y", "-loop", "1", "-t", "6.0", "-i", quote_png,
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo:d=6",
    "-vf", "fade=t=in:st=0:d=0.5,fade=t=out:st=5.5:d=0.5,format=yuv420p",
    "-r", "25", "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-c:a", "aac", "-shortest", quote_mp4
], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

seq_cache = os.path.abspath(".ava-cache/real-production-v2")
c_02_intro = os.path.join(seq_cache, "02_real_intro.mp4")
c_04_harvard = os.path.join(seq_cache, "04_real_harvard.mp4")
c_06_mentor = os.path.join(seq_cache, "06_real_mentor.mp4")
c_08_lecture = os.path.join(seq_cache, "08_real_lecture.mp4")
c_09_feedback = os.path.join(seq_cache, "09_real_feedback.mp4")
c_10_teeth3d = os.path.join(seq_cache, "10_real_teeth3d.mp4")
c_12_custom3d = os.path.join(seq_cache, "12_real_custom3d.mp4")
c_13_pride = os.path.join(seq_cache, "13_real_pride.mp4")
c_15_award = os.path.join(seq_cache, "15_real_award.mp4")
c_16_love = os.path.join(seq_cache, "16_real_love.mp4")

b_lab = os.path.join(seq_cache, "05_real_broll_lab.mp4")
b_mentor = os.path.join(seq_cache, "07_real_broll_mentor.mp4")
b_3dprint = os.path.join(seq_cache, "11_real_broll_3dprint.mp4")
b_clinic = os.path.join(seq_cache, "14_real_broll_clinic.mp4")

sequence = [
    bumper_mp4,      # Act 1: Perfect Vlog Title Bumper (6s)
    c_02_intro,      # Act 2: A-Roll Intro (17s)
    cover_mp4,       # Act 3: Perfect Vlog AR Cover Card (6s)
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
    quote_mp4        # Act 5: Perfect Vlog Climax Quote Card (6s)
]

concat_list_file = os.path.join(CACHE_DIR, "perfect_vlog_concat.txt")
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
print(f"🎉 MASTER VIDEO FULLY RENDERED: {target_master_mp4} ({stat.st_size / (1024*1024):.2f} MB)")
