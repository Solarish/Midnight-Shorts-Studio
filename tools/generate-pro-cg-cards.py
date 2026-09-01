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

def draw_doodle_tooth(draw, x, y, size=100, color=(56, 189, 248, 180), width=3):
    """Draws a stylized dental tooth icon doodle."""
    s = size / 100.0
    # Tooth crown curves and roots
    points = [
        (x - 35*s, y - 30*s), # Top left cusp
        (x - 10*s, y - 40*s), # Top groove
        (x + 10*s, y - 40*s),
        (x + 35*s, y - 30*s), # Top right cusp
        (x + 45*s, y - 10*s), # Right bulge
        (x + 35*s, y + 25*s),
        (x + 25*s, y + 50*s), # Right root tip
        (x + 10*s, y + 20*s), # Root bifurcation
        (x - 10*s, y + 20*s),
        (x - 25*s, y + 50*s), # Left root tip
        (x - 35*s, y + 25*s),
        (x - 45*s, y - 10*s)  # Left bulge
    ]
    # Draw smooth closed polygon outline
    draw.polygon(points, outline=color, width=width)
    # Add sparkle highlight
    draw.line([(x - 20*s, y - 25*s), (x - 20*s, y - 10*s)], fill=(255, 255, 255, 220), width=width)
    draw.line([(x - 25*s, y - 18*s), (x - 15*s, y - 18*s)], fill=(255, 255, 255, 220), width=width)

def draw_sparkle(draw, x, y, r=18, color=(212, 175, 55, 220)):
    """Draws a 4-point sparkle star."""
    points = [
        (x, y - r),
        (x + r*0.3, y - r*0.3),
        (x + r, y),
        (x + r*0.3, y + r*0.3),
        (x, y + r),
        (x - r*0.3, y + r*0.3),
        (x - r, y),
        (x - r*0.3, y - r*0.3)
    ]
    draw.polygon(points, fill=color)

def draw_cross(draw, x, y, size=24, color=(56, 189, 248, 200)):
    """Draws a medical cross icon."""
    w = size / 3
    draw.rectangle([x - size/2, y - w/2, x + size/2, y + w/2], fill=color)
    draw.rectangle([x - w/2, y - size/2, x + w/2, y + size/2], fill=color)

def make_dental_background():
    """Generates a rich medical dental clinic background with bokeh & grid."""
    bg = Image.new("RGBA", (1920, 1080), (6, 16, 37, 255))
    draw = ImageDraw.Draw(bg)
    
    # 1. Gradient radial glow (Teal / Cyan in top-right and center-left)
    for r in range(500, 0, -20):
        alpha = int((1.0 - r/500) * 45)
        draw.ellipse([1400 - r, 300 - r, 1400 + r, 300 + r], fill=(6, 182, 212, alpha))
        draw.ellipse([450 - r, 600 - r, 450 + r, 600 + r], fill=(30, 58, 138, alpha))
        draw.ellipse([960 - r, 540 - r, 960 + r, 540 + r], fill=(15, 23, 42, alpha))

    # 2. Subtle medical technical grid
    for x in range(0, 1920, 80):
        draw.line([(x, 0), (x, 1080)], fill=(30, 41, 59, 60), width=1)
    for y in range(0, 1080, 80):
        draw.line([(0, y), (1920, y)], fill=(30, 41, 59, 60), width=1)

    # 3. Dental doodles scattered in background with low opacity
    draw_doodle_tooth(draw, 1750, 180, size=120, color=(56, 189, 248, 70), width=2)
    draw_doodle_tooth(draw, 150, 920, size=140, color=(6, 182, 212, 60), width=2)
    draw_doodle_tooth(draw, 1050, 950, size=90, color=(212, 175, 55, 60), width=2)
    draw_doodle_tooth(draw, 1820, 880, size=110, color=(56, 189, 248, 60), width=2)

    # Sparkles & medical crosses
    draw_sparkle(draw, 1680, 280, r=22, color=(212, 175, 55, 120))
    draw_sparkle(draw, 1100, 150, r=16, color=(56, 189, 248, 140))
    draw_sparkle(draw, 220, 200, r=18, color=(212, 175, 55, 100))
    draw_sparkle(draw, 950, 880, r=14, color=(56, 189, 248, 120))
    draw_sparkle(draw, 1720, 750, r=20, color=(212, 175, 55, 130))

    draw_cross(draw, 1800, 480, size=28, color=(6, 182, 212, 90))
    draw_cross(draw, 120, 450, size=24, color=(56, 189, 248, 80))
    draw_cross(draw, 1020, 100, size=20, color=(212, 175, 55, 90))

    # Border vignette
    draw.rectangle([20, 20, 1900, 1060], outline=(56, 189, 248, 40), width=1)
    draw.rectangle([30, 30, 1890, 1050], outline=(212, 175, 55, 30), width=1)

    return bg

# =========================================================================
# 1. BUILD PRO AR COVER CARD
# =========================================================================
print("🎨 Building Pro AR Cover Card with Dental Doodles & Upright Cutout...")
bg_cover = make_dental_background()

# Glassmorphic Info Card on Right
card_x1, card_y1, card_x2, card_y2 = 780, 160, 1820, 920
# Semi-transparent dark frosted card
card_layer = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
card_draw = ImageDraw.Draw(card_layer)
card_draw.rounded_rectangle([card_x1, card_y1, card_x2, card_y2], radius=24, fill=(10, 25, 55, 220), outline=(56, 189, 248, 180), width=3)
# Gold accent header strip
card_draw.rounded_rectangle([card_x1, card_y1, card_x1 + 12, card_y2], radius=6, fill=(212, 175, 55, 255))
bg_cover = Image.alpha_composite(bg_cover, card_layer)

draw_final = ImageDraw.Draw(bg_cover)

# Top Gold Pill Badge
badge_text = "✦  อาจารย์ตัวอย่างดีเด่น มหาวิทยาลัยสงขลานครินทร์ ประจำปี ๒๕๖๙  ✦"
draw_final.rounded_rectangle([card_x1 + 45, card_y1 + 40, card_x1 + 750, card_y1 + 85], radius=12, fill=(212, 175, 55, 35), outline=(212, 175, 55, 220), width=2)
draw_final.text((card_x1 + 65, card_y1 + 48), badge_text, font=f_badge, fill=(250, 204, 21))

# Hero Name
draw_final.text((card_x1 + 45, card_y1 + 115), "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์", font=f_name, fill=(255, 255, 255))
draw_final.text((card_x1 + 45, card_y1 + 185), "คณะทันตแพทยศาสตร์ มหาวิทยาลัยสงขลานครินทร์", font=f_sub, fill=(56, 189, 248))

# Divider Line with glow
draw_final.line([(card_x1 + 45, card_y1 + 245), (card_x2 - 50, card_y1 + 245)], fill=(56, 189, 248, 120), width=2)
draw_final.line([(card_x1 + 45, card_y1 + 245), (card_x1 + 220, card_y1 + 245)], fill=(212, 175, 55, 255), width=3)

# Highlight Bullets
bullets = [
    ("สาขาวิชา", "สาขาวิทยาศาสตร์และเทคโนโลยี และสาขาวิทยาศาสตร์สุขภาพ"),
    ("การศึกษา", "ศิษย์เก่าทันตแพทย์ ม.อ. / ทุน ก.พ. ปริญญาเอก Harvard University"),
    ("นวัตกรรม", "ผลงานนวัตกรรม 'ฟันจำลอง 3 มิติ' (3D Printed Teeth Model)"),
    ("ปรัชญาครู", "วัฒนธรรมความเป็นพี่น้อง & เทคนิคการให้ฟีดแบคแบบเสริมแรงบวก"),
    ("ประสบการณ์", "อาจารย์ผู้ทรงคุณวุฒิผู้อุทิศตนเพื่อการเรียนการสอนกว่า 20 ปี")
]

cur_y = card_y1 + 280
for label, text in bullets:
    # Bullet icon
    draw_sparkle(draw_final, card_x1 + 60, cur_y + 12, r=8, color=(212, 175, 55, 240))
    draw_final.text((card_x1 + 85, cur_y), label + " :", font=f_body, fill=(56, 189, 248))
    draw_final.text((card_x1 + 215, cur_y), text, font=f_body, fill=(241, 245, 249))
    cur_y += 58

# Foreground Decorative Tooth Doodle on Card
draw_doodle_tooth(draw_final, card_x2 - 100, card_y1 + 150, size=80, color=(56, 189, 248, 200), width=2)
draw_sparkle(draw_final, card_x2 - 60, card_y1 + 110, r=16, color=(212, 175, 55, 255))

# 2. Place Upright Cutout of Dr. Kewalin on Left
cutout_path = ".ava-cache/dr_kewalin_cutout_upright.png"
if os.path.exists(cutout_path):
    cutout = Image.open(cutout_path).convert("RGBA")
    
    # Target height 880px
    target_h = 880
    target_w = int(cutout.width * (target_h / cutout.height))
    cutout_resized = cutout.resize((target_w, target_h), Image.Resampling.LANCZOS)
    
    # Create soft drop shadow behind cutout
    shadow = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
    # Paste silhouette with black
    shadow_mask = cutout_resized.split()[3]
    shadow_img = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 180))
    shadow.paste(shadow_img, (80, 200), mask=shadow_mask)
    shadow = shadow.filter(ImageFilter.GaussianBlur(25))
    
    bg_cover = Image.alpha_composite(bg_cover, shadow)
    
    # Paste Dr. Kewalin upright
    bg_cover.paste(cutout_resized, (70, 200), mask=cutout_resized)

cover_output_path = os.path.join(CACHE_DIR, "pro_ar_cover_card.png")
bg_cover.convert("RGB").save(cover_output_path, quality=95)
print(f"✅ Saved Pro AR Cover Card: {cover_output_path}")

# =========================================================================
# 2. BUILD PRO CLIMAX QUOTE CARD
# =========================================================================
print("🎨 Building Pro Climax Quote Card with Dental Doodles...")
bg_quote = make_dental_background()

# Central Glassmorphic Quote Box
q_x1, q_y1, q_x2, q_y2 = 200, 200, 1720, 880
q_layer = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
q_draw = ImageDraw.Draw(q_layer)
q_draw.rounded_rectangle([q_x1, q_y1, q_x2, q_y2], radius=28, fill=(10, 22, 48, 230), outline=(212, 175, 55, 200), width=4)
# Inner Cyan rim
q_draw.rounded_rectangle([q_x1 + 14, q_y1 + 14, q_x2 - 14, q_y2 - 14], radius=20, outline=(56, 189, 248, 100), width=2)
bg_quote = Image.alpha_composite(bg_quote, q_layer)

draw_q = ImageDraw.Draw(bg_quote)

# Header Badge
q_badge = "✦  บทสรุปปรัชญาความเป็นครูและการอุทิศตน  ✦"
draw_q.rounded_rectangle([960 - 240, q_y1 + 45, 960 + 240, q_y1 + 90], radius=10, fill=(212, 175, 55, 40), outline=(212, 175, 55, 220), width=2)
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

# Dental Doodles in Quote Box corners
draw_doodle_tooth(draw_q, q_x1 + 110, q_y2 - 110, size=90, color=(56, 189, 248, 160), width=2)
draw_doodle_tooth(draw_q, q_x2 - 110, q_y1 + 110, size=90, color=(212, 175, 55, 160), width=2)

quote_output_path = os.path.join(CACHE_DIR, "pro_climax_quote_card.png")
bg_quote.convert("RGB").save(quote_output_path, quality=95)
print(f"✅ Saved Pro Climax Quote Card: {quote_output_path}")

print("✨ All Pro CG Cards generated successfully!")
