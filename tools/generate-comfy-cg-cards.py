import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps

CACHE_DIR = os.path.abspath(".ava-cache/pro-cg-cards")
os.makedirs(CACHE_DIR, exist_ok=True)

# 1. Load Font
font_path = "/System/Library/Fonts/Supplemental/SukhumvitSet.ttc"
if not os.path.exists(font_path):
    font_path = "/System/Library/Fonts/Supplemental/Thonburi.ttc"

f_badge = ImageFont.truetype(font_path, 22, index=3 if "Sukhumvit" in font_path else 0)
f_name = ImageFont.truetype(font_path, 44, index=3 if "Sukhumvit" in font_path else 0)
f_sub = ImageFont.truetype(font_path, 26, index=2 if "Sukhumvit" in font_path else 0)
f_body = ImageFont.truetype(font_path, 24, index=1 if "Sukhumvit" in font_path else 0)
f_quote = ImageFont.truetype(font_path, 38, index=3 if "Sukhumvit" in font_path else 0)
f_quote_sub = ImageFont.truetype(font_path, 30, index=2 if "Sukhumvit" in font_path else 0)
f_author = ImageFont.truetype(font_path, 26, index=1 if "Sukhumvit" in font_path else 0)

def draw_sparkle(draw, x, y, r=18, color=(212, 175, 55, 220)):
    """Draws a 4-point sparkle star."""
    points = [
        (x, y - r), (x + r*0.3, y - r*0.3),
        (x + r, y), (x + r*0.3, y + r*0.3),
        (x, y + r), (x - r*0.3, y + r*0.3),
        (x - r, y), (x - r*0.3, y - r*0.3)
    ]
    draw.polygon(points, fill=color)

def draw_cute_tooth(draw, x, y, size=90, color=(255, 255, 255, 220), outline=(56, 189, 248, 240), with_face=True):
    """Draws a cute smiling tooth doodle with sparkle."""
    s = size / 100.0
    pts = [
        (x - 35*s, y - 30*s), (x - 12*s, y - 40*s), (x + 12*s, y - 40*s),
        (x + 35*s, y - 30*s), (x + 45*s, y - 10*s), (x + 38*s, y + 25*s),
        (x + 24*s, y + 48*s), (x + 10*s, y + 18*s), (x - 10*s, y + 18*s),
        (x - 24*s, y + 48*s), (x - 38*s, y + 25*s), (x - 45*s, y - 10*s)
    ]
    draw.polygon(pts, fill=color, outline=outline, width=3)
    if with_face:
        # Cute eyes
        draw.ellipse([x - 18*s, y - 12*s, x - 10*s, y - 4*s], fill=(30, 58, 138, 255))
        draw.ellipse([x + 10*s, y - 12*s, x + 18*s, y - 4*s], fill=(30, 58, 138, 255))
        # Happy smile arc
        draw.arc([x - 12*s, y - 6*s, x + 12*s, y + 14*s], start=10, end=170, fill=(30, 58, 138, 255), width=2)
        # Blush cheeks
        draw.ellipse([x - 28*s, y - 2*s, x - 20*s, y + 4*s], fill=(244, 114, 182, 200))
        draw.ellipse([x + 20*s, y - 2*s, x + 28*s, y + 4*s], fill=(244, 114, 182, 200))

def draw_toothbrush(draw, x, y, size=100, color=(56, 189, 248, 220), angle=35):
    """Draws a cute stylized toothbrush with paste foam."""
    s = size / 100.0
    # Handle line
    rad = math.radians(angle)
    dx = math.cos(rad) * 60 * s
    dy = math.sin(rad) * 60 * s
    draw.line([(x - dx, y - dy), (x + dx*0.4, y + dy*0.4)], fill=color, width=int(8*s))
    # Head & Bristles
    hx, hy = x + dx*0.4, y + dy*0.4
    draw.rectangle([hx - 10*s, hy - 14*s, hx + 18*s, hy - 4*s], fill=(241, 245, 249, 240), outline=color, width=2)
    # Toothpaste swirl
    draw.arc([hx - 8*s, hy - 24*s, hx + 16*s, hy - 8*s], start=180, end=360, fill=(6, 182, 212, 255), width=3)

def draw_dental_mirror(draw, x, y, size=80, color=(212, 175, 55, 220)):
    """Draws a dental mouth mirror tool."""
    s = size / 100.0
    # Angled head
    draw.ellipse([x - 18*s, y - 35*s, x + 18*s, y - 5*s], outline=color, width=3)
    draw.ellipse([x - 14*s, y - 31*s, x + 14*s, y - 9*s], fill=(56, 189, 248, 120))
    # Handle stem
    draw.line([(x, y - 5*s), (x - 25*s, y + 40*s)], fill=color, width=3)

def prepare_comfy_background():
    comfy_file = ".ava-cache/comfy-dental/comfy_dental_bg.png"
    if os.path.exists(comfy_file):
        bg = Image.open(comfy_file).convert("RGBA").resize((1920, 1080), Image.Resampling.LANCZOS)
    else:
        bg = Image.new("RGBA", (1920, 1080), (6, 16, 37, 255))
    
    # Overlay dark gradient tint for ultra-legibility
    tint = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
    t_draw = ImageDraw.Draw(tint)
    # Dark vignette + teal wash
    t_draw.rectangle([0, 0, 1920, 1080], fill=(6, 16, 37, 140))
    bg = Image.alpha_composite(bg, tint)
    
    # Add beautiful dental doodles
    d_draw = ImageDraw.Draw(bg)
    draw_cute_tooth(d_draw, 1740, 160, size=110, with_face=True)
    draw_cute_tooth(d_draw, 180, 920, size=120, with_face=True)
    draw_toothbrush(d_draw, 1800, 860, size=110, angle=-40)
    draw_dental_mirror(d_draw, 140, 180, size=90)
    draw_toothbrush(d_draw, 1050, 960, size=90, angle=25)

    # Sparkle stars
    draw_sparkle(d_draw, 1660, 260, r=22, color=(212, 175, 55, 230))
    draw_sparkle(d_draw, 1120, 120, r=18, color=(56, 189, 248, 230))
    draw_sparkle(d_draw, 240, 130, r=16, color=(212, 175, 55, 200))
    draw_sparkle(d_draw, 960, 880, r=16, color=(56, 189, 248, 220))
    draw_sparkle(d_draw, 1720, 760, r=20, color=(212, 175, 55, 240))

    return bg

# =========================================================================
# 1. BUILD UPGRADED PRO AR COVER CARD WITH COMFYUI BG & CUTE DOODLES
# =========================================================================
print("🎨 Building Upgraded Pro AR Cover Card with ComfyUI Background & Cute Doodles...")
bg_cover = prepare_comfy_background()

# Glassmorphic Info Card on Right
card_x1, card_y1, card_x2, card_y2 = 780, 150, 1840, 930
card_layer = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
card_draw = ImageDraw.Draw(card_layer)
card_draw.rounded_rectangle([card_x1, card_y1, card_x2, card_y2], radius=24, fill=(8, 20, 48, 225), outline=(56, 189, 248, 190), width=3)
card_draw.rounded_rectangle([card_x1, card_y1, card_x1 + 12, card_y2], radius=6, fill=(212, 175, 55, 255))
bg_cover = Image.alpha_composite(bg_cover, card_layer)

draw_final = ImageDraw.Draw(bg_cover)

# Top Gold Pill Badge
badge_text = "✦  อาจารย์ตัวอย่างดีเด่น มหาวิทยาลัยสงขลานครินทร์ ประจำปี ๒๕๖๙  ✦"
draw_final.rounded_rectangle([card_x1 + 45, card_y1 + 35, card_x1 + 760, card_y1 + 80], radius=12, fill=(212, 175, 55, 45), outline=(212, 175, 55, 230), width=2)
draw_final.text((card_x1 + 65, card_y1 + 43), badge_text, font=f_badge, fill=(250, 204, 21))

# Hero Name
draw_final.text((card_x1 + 45, card_y1 + 110), "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์", font=f_name, fill=(255, 255, 255))
draw_final.text((card_x1 + 45, card_y1 + 180), "คณะทันตแพทยศาสตร์ มหาวิทยาลัยสงขลานครินทร์", font=f_sub, fill=(56, 189, 248))

# Divider Line with glow
draw_final.line([(card_x1 + 45, card_y1 + 240), (card_x2 - 50, card_y1 + 240)], fill=(56, 189, 248, 120), width=2)
draw_final.line([(card_x1 + 45, card_y1 + 240), (card_x1 + 220, card_y1 + 240)], fill=(212, 175, 55, 255), width=3)

# Highlight Bullets
bullets = [
    ("สาขาวิชา", "สาขาวิทยาศาสตร์และเทคโนโลยี และสาขาวิทยาศาสตร์สุขภาพ"),
    ("การศึกษา", "ศิษย์เก่าทันตแพทย์ ม.อ. / ทุน ก.พ. ปริญญาเอก Harvard University"),
    ("นวัตกรรม", "ผลงานนวัตกรรม 'ฟันจำลอง 3 มิติ' (3D Printed Teeth Model)"),
    ("ปรัชญาครู", "วัฒนธรรมความเป็นพี่น้อง & เทคนิคการให้ฟีดแบคแบบเสริมแรงบวก"),
    ("ประสบการณ์", "อาจารย์ผู้ทรงคุณวุฒิผู้อุทิศตนเพื่อการเรียนการสอนกว่า 20 ปี")
]

cur_y = card_y1 + 275
for label, text in bullets:
    draw_sparkle(draw_final, card_x1 + 60, cur_y + 12, r=8, color=(212, 175, 55, 240))
    draw_final.text((card_x1 + 85, cur_y), label + " :", font=f_body, fill=(56, 189, 248))
    draw_final.text((card_x1 + 215, cur_y), text, font=f_body, fill=(241, 245, 249))
    cur_y += 58

# Cute Tooth on Card Header
draw_cute_tooth(draw_final, card_x2 - 90, card_y1 + 140, size=75, with_face=True)

# 2. Place Upright Cutout of Dr. Kewalin on Left
cutout_path = ".ava-cache/dr_kewalin_cutout_upright.png"
if os.path.exists(cutout_path):
    cutout = Image.open(cutout_path).convert("RGBA")
    target_h = 890
    target_w = int(cutout.width * (target_h / cutout.height))
    cutout_resized = cutout.resize((target_w, target_h), Image.Resampling.LANCZOS)
    
    shadow = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
    shadow_mask = cutout_resized.split()[3]
    shadow_img = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 190))
    shadow.paste(shadow_img, (75, 190), mask=shadow_mask)
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    
    bg_cover = Image.alpha_composite(bg_cover, shadow)
    bg_cover.paste(cutout_resized, (65, 190), mask=cutout_resized)

cover_output_path = os.path.join(CACHE_DIR, "pro_ar_cover_card.png")
bg_cover.convert("RGB").save(cover_output_path, quality=95)
print(f"✅ Saved Pro AR Cover Card: {cover_output_path}")

# =========================================================================
# 2. BUILD UPGRADED PRO CLIMAX QUOTE CARD
# =========================================================================
print("🎨 Building Upgraded Pro Climax Quote Card with ComfyUI Background...")
bg_quote = prepare_comfy_background()

q_x1, q_y1, q_x2, q_y2 = 200, 190, 1720, 890
q_layer = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
q_draw = ImageDraw.Draw(q_layer)
q_draw.rounded_rectangle([q_x1, q_y1, q_x2, q_y2], radius=28, fill=(8, 20, 48, 235), outline=(212, 175, 55, 210), width=4)
q_draw.rounded_rectangle([q_x1 + 14, q_y1 + 14, q_x2 - 14, q_y2 - 14], radius=20, outline=(56, 189, 248, 110), width=2)
bg_quote = Image.alpha_composite(bg_quote, q_layer)

draw_q = ImageDraw.Draw(bg_quote)

# Header Badge
q_badge = "✦  บทสรุปปรัชญาความเป็นครูและการอุทิศตน  ✦"
draw_q.rounded_rectangle([960 - 240, q_y1 + 45, 960 + 240, q_y1 + 90], radius=10, fill=(212, 175, 55, 45), outline=(212, 175, 55, 230), width=2)
draw_q.text((960, q_y1 + 67), q_badge, font=f_badge, fill=(250, 204, 21), anchor="mm")

# Large Quotation Marks
draw_q.text((q_x1 + 90, q_y1 + 120), "“", font=ImageFont.truetype(font_path, 130, index=3 if "Sukhumvit" in font_path else 0), fill=(212, 175, 55, 140))
draw_q.text((q_x2 - 140, q_y2 - 220), "”", font=ImageFont.truetype(font_path, 130, index=3 if "Sukhumvit" in font_path else 0), fill=(212, 175, 55, 140))

# Quote Hero Texts
draw_q.text((960, q_y1 + 250), "ความภูมิใจที่สุดคือการได้เห็นลูกศิษย์เติบโต", font=f_quote, fill=(255, 255, 255), anchor="mm")
draw_q.text((960, q_y1 + 330), "และนำหลักคิดไปใช้เพื่อประโยชน์ของเพื่อนมนุษย์", font=f_quote, fill=(250, 204, 21), anchor="mm")
draw_q.text((960, q_y1 + 410), "ทำหน้าที่ของตัวเองให้ดีที่สุด ทำด้วยความรักและสนุก", font=f_quote_sub, fill=(226, 232, 240), anchor="mm")

# Divider
draw_q.line([(960 - 300, q_y1 + 480), (960 + 300, q_y1 + 480)], fill=(56, 189, 248, 150), width=2)
draw_sparkle(draw_q, 960, q_y1 + 480, r=16, color=(212, 175, 55, 255))

# Author Citation
draw_q.text((960, q_y1 + 540), "รองศาสตราจารย์ ดร.ทันตแพทย์หญิง เกวลิน ธรรมสิทธิ์บูรณ์", font=f_name, fill=(255, 255, 255), anchor="mm")
draw_q.text((960, q_y1 + 600), "อาจารย์ตัวอย่างดีเด่น คณะทันตแพทยศาสตร์ มหาวิทยาลัยสงขลานครินทร์", font=f_author, fill=(56, 189, 248), anchor="mm")

# Cute Doodles in Quote Box corners
draw_cute_tooth(draw_q, q_x1 + 110, q_y2 - 110, size=85, with_face=True)
draw_toothbrush(draw_q, q_x2 - 110, q_y1 + 110, size=85, angle=-30)

quote_output_path = os.path.join(CACHE_DIR, "pro_climax_quote_card.png")
bg_quote.convert("RGB").save(quote_output_path, quality=95)
print(f"✅ Saved Pro Climax Quote Card: {quote_output_path}")

print("✨ All Pro CG Cards with ComfyUI Background generated successfully!")
