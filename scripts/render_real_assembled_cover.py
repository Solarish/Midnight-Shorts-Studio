import os
from PIL import Image, ImageDraw, ImageFont

bg_path = "/Users/louislee/Desktop/Midnight-Shorts-Studio/.ava-control/media/storyboard-covers/cover_3/background/image.png"
cutout_path = "/Users/louislee/Desktop/Midnight-Shorts-Studio/.ava-control/media/storyboard-covers/cover_3/cutout.png"
font_bold = "/Library/Fonts/PSU-Stidti-Bold.otf"
font_reg = "/Library/Fonts/PSU-Stidti-Regular.otf"
output_path = "/Users/louislee/Desktop/Midnight-Shorts-Studio/eval_vision_pathawee/cover_card_autonomous.jpg"

canvas = Image.new("RGBA", (1920, 1080), (10, 18, 30, 255))

# 1. Load Background & resize to 1920x1080
if os.path.exists(bg_path):
    bg = Image.open(bg_path).convert("RGBA")
    bg = bg.resize((1920, 1080), Image.Resampling.LANCZOS)
    canvas.paste(bg, (0, 0))

# 2. Add subtle vignette / gradient for text legibility
gradient = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
g_draw = ImageDraw.Draw(gradient)
for x in range(1200):
    alpha = int(180 * (1.0 - (x / 1200.0)))
    g_draw.line([(x, 0), (x, 1080)], fill=(8, 14, 24, alpha))
canvas = Image.alpha_composite(canvas, gradient)

# 3. Paste Person Cutout on Right Third
if os.path.exists(cutout_path):
    cutout = Image.open(cutout_path).convert("RGBA")
    # Scale person cutout to fit height ~1000px
    ratio = 1000.0 / cutout.height
    new_w = int(cutout.width * ratio)
    new_h = 1000
    cutout_scaled = cutout.resize((new_w, new_h), Image.Resampling.LANCZOS)
    # Position: right-aligned with bottom padding
    paste_x = int(1920 * 0.72 - new_w * 0.5)
    paste_y = 1080 - new_h
    canvas.paste(cutout_scaled, (paste_x, paste_y), cutout_scaled)

# 4. Draw Academic Doodle Vector Accents (books, stars, pencils)
d_draw = ImageDraw.Draw(canvas)
star_color = (255, 255, 255, 160)
gold_color = (229, 169, 60, 200)

# Academic doodle accents
def draw_star(draw, cx, cy, r, color):
    points = []
    import math
    for i in range(10):
        angle = i * math.pi / 5.0 - math.pi / 2.0
        rad = r if i % 2 == 0 else r * 0.45
        points.append((cx + rad * math.cos(angle), cy + rad * math.sin(angle)))
    draw.polygon(points, fill=color)

draw_star(d_draw, int(1920 * 0.08), int(1080 * 0.15), 18, gold_color)
draw_star(d_draw, int(1920 * 0.18), int(1080 * 0.08), 12, star_color)
draw_star(d_draw, int(1920 * 0.52), int(1080 * 0.07), 10, star_color)
draw_star(d_draw, int(1920 * 0.94), int(1080 * 0.18), 14, gold_color)

# 5. Draw Typography (PSU Stidti)
f_eyebrow = ImageFont.truetype(font_bold, 36)
f_title = ImageFont.truetype(font_bold, 64)
f_subtitle = ImageFont.truetype(font_bold, 36)

# Eyebrow
d_draw.text((154, 712), "รางวัลอาจารย์ตัวอย่าง มหาวิทยาลัยสงขลานครินทร์ ประจำปี 2569", font=f_eyebrow, fill=(229, 169, 60))
# Title
d_draw.text((154, 820), "ดร.ปฐวี อินทร์สุวรรณโณ", font=f_title, fill=(255, 255, 255))
# Subtitle
d_draw.text((154, 940), "คณะการบริการและการท่องเที่ยว", font=f_subtitle, fill=(0, 229, 255))

final_rgb = canvas.convert("RGB")
final_rgb.save(output_path, quality=95)
print("Saved autonomous Cover Card to:", output_path)
