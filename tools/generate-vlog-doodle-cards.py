import os
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps

CACHE_DIR = os.path.abspath(".ava-cache/pro-cg-cards")
os.makedirs(CACHE_DIR, exist_ok=True)

# Fonts
font_chalk_bold = "/System/Library/Fonts/Supplemental/ChalkboardSE.ttc"
font_sukhumvit = "/System/Library/Fonts/Supplemental/SukhumvitSet.ttc"

f_title_chalk = ImageFont.truetype(font_chalk_bold, 54, index=0)
f_sub_chalk = ImageFont.truetype(font_chalk_bold, 30, index=0)
f_curved = ImageFont.truetype(font_chalk_bold, 26, index=0)
f_thai_name = ImageFont.truetype(font_sukhumvit, 42, index=3)
f_thai_sub = ImageFont.truetype(font_sukhumvit, 28, index=2)
f_thai_body = ImageFont.truetype(font_sukhumvit, 24, index=1)
f_tag = ImageFont.truetype(font_chalk_bold, 24, index=0)

WHITE = (255, 255, 255, 255)
BLUE_ACCENT = (2, 132, 199, 255)
GOLD_ACCENT = (250, 204, 21, 255)

def draw_handdrawn_star(draw, cx, cy, size=70, color=WHITE, width=4):
    """Draws a 5-pointed hand-drawn continuous line star."""
    angles = [i * (2 * math.pi / 5) - math.pi / 2 for i in range(5)]
    order = [0, 2, 4, 1, 3, 0]
    r = size / 2.0
    points = [(cx + r * math.cos(angles[idx]), cy + r * math.sin(angles[idx])) for idx in order]
    draw.line(points, fill=color, width=width, joint="curve")

def draw_handdrawn_flower(draw, cx, cy, size=60, color=WHITE, width=4):
    """Draws a 5-petal hand-drawn doodle flower."""
    r_center = size * 0.22
    r_petal = size * 0.38
    draw.ellipse([cx - r_center, cy - r_center, cx + r_center, cy + r_center], outline=color, width=width)
    for i in range(5):
        ang = i * (2 * math.pi / 5) - math.pi / 2
        px = cx + (r_center + r_petal * 0.75) * math.cos(ang)
        py = cy + (r_center + r_petal * 0.75) * math.sin(ang)
        draw.ellipse([px - r_petal*0.6, py - r_petal*0.6, px + r_petal*0.6, py + r_petal*0.6], outline=color, width=width)

def draw_handdrawn_hearts(draw, cx, cy, size=50, color=WHITE, width=4):
    """Draws double stacked hand-drawn floating hearts."""
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
    """Draws a curved Bézier arrow with pointer head."""
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
    """Draws a 4-point sparkle cluster (like top-left in reference)."""
    draw_handdrawn_star(draw, cx, cy, size=size, color=color, width=3)
    draw_handdrawn_star(draw, cx + size*0.8, cy + size*0.5, size=size*0.6, color=color, width=2)
    draw.ellipse([cx - size*0.4, cy + size*0.6, cx - size*0.4 + 6, cy + size*0.6 + 6], fill=color)

def draw_handdrawn_tooth_doodle(draw, x, y, size=80, color=WHITE, width=4):
    """Draws a cute white marker doodle tooth with smiling face."""
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
    """Renders text characters along an arc curve."""
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

# =========================================================================
# 2. GENERATE VLOG DOODLE COVER CARD
# =========================================================================
print("🎨 Generating Vlog Style Doodle Cover Card...")

bg_path = ".ava-cache/comfy-dental/comfy_dental_bg.png"
if os.path.exists(bg_path):
    canvas = Image.open(bg_path).convert("RGBA").resize((1920, 1080), Image.Resampling.LANCZOS)
else:
    canvas = Image.new("RGBA", (1920, 1080), (6, 16, 37, 255))

# Darken background slightly so white doodles & text pop!
darken = Image.new("RGBA", (1920, 1080), (10, 20, 45, 130))
canvas = Image.alpha_composite(canvas, darken)

# 1. Overlay Dr. Kewalin Cutout with White Doodle Outline
cutout_path = ".ava-cache/dr_kewalin_cutout_upright.png"
if os.path.exists(cutout_path):
    cutout = Image.open(cutout_path).convert("RGBA")
    target_h = 920
    target_w = int(cutout.width * (target_h / cutout.height))
    cutout_resized = cutout.resize((target_w, target_h), Image.Resampling.LANCZOS)
    
    # White chalk silhouette contour / sticker stroke
    alpha_mask = cutout_resized.split()[3]
    mask_dilated = alpha_mask.filter(ImageFilter.MaxFilter(9))
    
    stroke_img = Image.new("RGBA", (target_w, target_h), (255, 255, 255, 240))
    pos_x, pos_y = 60, 160
    
    canvas.paste(stroke_img, (pos_x, pos_y), mask=mask_dilated)
    canvas.paste(cutout_resized, (pos_x, pos_y), mask=cutout_resized)

doodle_layer = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
d_draw = ImageDraw.Draw(doodle_layer)

# 2. Main Title (Handwritten Chalk Style matching "HAPPY MOTHER'S DAY")
draw_sparkle_cluster(d_draw, 140, 100, size=44, color=WHITE)

# Big Chalk Title
d_draw.text((960, 85), "PSU MODEL TEACHER 2026", font=f_title_chalk, fill=WHITE, anchor="mm")
d_draw.text((960, 145), "FACULTY OF DENTISTRY", font=f_sub_chalk, fill=(56, 189, 248, 255), anchor="mm")

# Hand-drawn Doodles around canvas (Exact match to reference style)
draw_handdrawn_star(d_draw, 640, 340, size=75, color=WHITE, width=4)
draw_handdrawn_flower(d_draw, 740, 460, size=65, color=WHITE, width=4)
draw_handdrawn_tooth_doodle(d_draw, 880, 240, size=90, color=WHITE, width=4)
draw_handdrawn_hearts(d_draw, 1740, 880, size=55, color=WHITE, width=4)

# Curved Text Doodles ("BEST TEACHER DESERVES THE BEST")
draw_curved_text(doodle_layer, "BEST TEACHER DESERVES THE BEST", f_curved, (1200, 440), 380, -115, color=WHITE)

# Curved Arrow pointing to Teacher from "AJARN KEWALIN" label
draw_curved_arrow(d_draw, (620, 850), (540, 750), (480, 650), color=WHITE, width=4)
d_draw.text((640, 860), "อ.เกวลิน", font=f_thai_name, fill=WHITE)
d_draw.text((640, 920), "DR. KEWALIN", font=f_tag, fill=BLUE_ACCENT)

# 3. Translucent Frosted Glass Card (Matching "Mommy's Best Wishlist" sticker box)
box_x1, box_y1, box_x2, box_y2 = 1000, 220, 1860, 840
box_layer = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
b_draw = ImageDraw.Draw(box_layer)

b_draw.rounded_rectangle([box_x1, box_y1, box_x2, box_y2], radius=24, fill=(255, 255, 255, 225), outline=WHITE, width=3)
doodle_layer = Image.alpha_composite(doodle_layer, box_layer)

d_final = ImageDraw.Draw(doodle_layer)

# Card Header Title in Blue
d_final.text((box_x1 + 45, box_y1 + 35), "“รางวัลอาจารย์ตัวอย่างดีเด่น ประจำปี ๒๕๖๙”", font=ImageFont.truetype(font_sukhumvit, 32, index=3), fill=(2, 132, 199))
d_final.text((box_x1 + 45, box_y1 + 80), "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์", font=ImageFont.truetype(font_sukhumvit, 38, index=3), fill=(15, 23, 42))
d_final.text((box_x1 + 45, box_y1 + 130), "คณะทันตแพทยศาสตร์ มหาวิทยาลัยสงขลานครินทร์", font=ImageFont.truetype(font_sukhumvit, 24, index=2), fill=(100, 116, 139))

d_final.line([(box_x1 + 45, box_y1 + 175), (box_x2 - 45, box_y1 + 175)], fill=(203, 213, 225), width=2)

# Bullet Points
bullets = [
    ("• สาขาวิชา", "สาขาวิทยาศาสตร์และเทคโนโลยี และสาขาวิทยาศาสตร์สุขภาพ"),
    ("• ทุนการศึกษา", "ศิษย์เก่าทันตแพทย์ ม.อ. / ทุน ก.พ. ปริญญาเอก Harvard University"),
    ("• นวัตกรรม 3D", "ผลงานนวัตกรรม 'ฟันจำลอง 3 มิติ' (3D Printed Teeth Model)"),
    ("• ปรัชญาครู", "วัฒนธรรมความเป็นพี่น้อง & เทคนิคการให้ฟีดแบคแบบเสริมแรงบวก"),
    ("• การอุทิศตน", "อาจารย์ผู้ทรงคุณวุฒิผู้อุทิศตนเพื่อการเรียนการสอนกว่า 20 ปี")
]

cur_y = box_y1 + 205
for label, text in bullets:
    d_final.text((box_x1 + 50, cur_y), label + " :", font=f_thai_body, fill=(2, 132, 199))
    d_final.text((box_x1 + 220, cur_y), text, font=f_thai_body, fill=(30, 41, 59))
    cur_y += 65

# Curved Arrow on Box
draw_curved_arrow(d_final, (box_x2 - 80, box_y1 + 380), (box_x2 - 20, box_y1 + 360), (box_x2 - 50, box_y1 + 340), color=(2, 132, 199), width=3)

# Composite
canvas = Image.alpha_composite(canvas, doodle_layer)
cover_output_path = os.path.join(CACHE_DIR, "pro_ar_cover_card.png")
canvas.convert("RGB").save(cover_output_path, quality=95)
print(f"✅ Saved Vlog Style Doodle Cover Card: {cover_output_path}")

# =========================================================================
# 3. GENERATE VLOG DOODLE CLIMAX QUOTE CARD
# =========================================================================
print("🎨 Generating Vlog Style Doodle Climax Quote Card...")

if os.path.exists(bg_path):
    q_canvas = Image.open(bg_path).convert("RGBA").resize((1920, 1080), Image.Resampling.LANCZOS)
else:
    q_canvas = Image.new("RGBA", (1920, 1080), (6, 16, 37, 255))

q_canvas = Image.alpha_composite(q_canvas, darken)

q_doodle = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
qd_draw = ImageDraw.Draw(q_doodle)

draw_sparkle_cluster(qd_draw, 180, 130, size=40, color=WHITE)
draw_handdrawn_star(qd_draw, 1740, 150, size=75, color=WHITE, width=4)
draw_handdrawn_flower(qd_draw, 200, 880, size=65, color=WHITE, width=4)
draw_handdrawn_hearts(qd_draw, 1720, 860, size=55, color=WHITE, width=4)
draw_handdrawn_tooth_doodle(qd_draw, 960, 130, size=85, color=WHITE, width=4)

qx1, qy1, qx2, qy2 = 180, 230, 1740, 850
qbox_layer = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
qb_draw = ImageDraw.Draw(qbox_layer)
qb_draw.rounded_rectangle([qx1, qy1, qx2, qy2], radius=28, fill=(255, 255, 255, 230), outline=WHITE, width=4)
q_doodle = Image.alpha_composite(q_doodle, qbox_layer)

qd_final = ImageDraw.Draw(q_doodle)

qd_final.text((960, qy1 + 50), "“บทสรุปปรัชญาความเป็นครูและการอุทิศตน”", font=ImageFont.truetype(font_sukhumvit, 32, index=3), fill=(2, 132, 199), anchor="mm")
qd_final.text((qx1 + 60, qy1 + 90), "“", font=ImageFont.truetype(font_chalk_bold, 110, index=0), fill=(2, 132, 199))
qd_final.text((qx2 - 120, qy2 - 190), "”", font=ImageFont.truetype(font_chalk_bold, 110, index=0), fill=(2, 132, 199))

qd_final.text((960, qy1 + 190), "ความภูมิใจที่สุดคือการได้เห็นลูกศิษย์เติบโต", font=ImageFont.truetype(font_sukhumvit, 46, index=3), fill=(15, 23, 42), anchor="mm")
qd_final.text((960, qy1 + 270), "และนำหลักคิดไปใช้เพื่อประโยชน์ของเพื่อนมนุษย์", font=ImageFont.truetype(font_sukhumvit, 46, index=3), fill=(2, 132, 199), anchor="mm")
qd_final.text((960, qy1 + 350), "ทำหน้าที่ของตัวเองให้ดีที่สุด ทำด้วยความรักและสนุก", font=ImageFont.truetype(font_sukhumvit, 34, index=2), fill=(71, 85, 105), anchor="mm")

qd_final.line([(960 - 350, qy1 + 420), (960 + 350, qy1 + 420)], fill=(203, 213, 225), width=2)

qd_final.text((960, qy1 + 480), "รองศาสตราจารย์ ดร.ทันตแพทย์หญิง เกวลิน ธรรมสิทธิ์บูรณ์", font=ImageFont.truetype(font_sukhumvit, 38, index=3), fill=(15, 23, 42), anchor="mm")
qd_final.text((960, qy1 + 535), "อาจารย์ตัวอย่างดีเด่น คณะทันตแพทยศาสตร์ มหาวิทยาลัยสงขลานครินทร์", font=ImageFont.truetype(font_sukhumvit, 26, index=1), fill=(100, 116, 139), anchor="mm")

draw_curved_arrow(qd_final, (qx1 + 100, qy2 - 60), (qx1 + 60, qy2 - 110), (qx1 + 120, qy2 - 130), color=(2, 132, 199), width=3)
draw_curved_text(q_doodle, "TEACH WITH LOVE & PASSION", f_curved, (960, 710), 550, -118, color=WHITE)

q_canvas = Image.alpha_composite(q_canvas, q_doodle)
quote_output_path = os.path.join(CACHE_DIR, "pro_climax_quote_card.png")
q_canvas.convert("RGB").save(quote_output_path, quality=95)
print(f"✅ Saved Vlog Style Doodle Climax Quote Card: {quote_output_path}")

print("✨ All Vlog Style Doodle Cards generated successfully!")
