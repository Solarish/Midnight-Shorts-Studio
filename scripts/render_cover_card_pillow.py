import sys
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def render_cover_card(output_path, photo_path, name, position, award):
    w, h = 1920, 1080
    # 1. Background: Deep Midnight Navy
    base = Image.new("RGB", (w, h), (11, 18, 32))
    draw = ImageDraw.Draw(base)

    # Ambient radial gradient
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse([400, 200, 1600, 1000], fill=(20, 45, 85, 90))
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    base = Image.alpha_composite(base.convert("RGBA"), glow)

    # 2. Right Portrait Card
    if os.path.exists(photo_path):
        photo = Image.open(photo_path).convert("RGB")
        target_w, target_h = 560, 800
        # Aspect crop
        scale = max(target_w / photo.width, target_h / photo.height)
        new_size = (int(photo.width * scale), int(photo.height * scale))
        photo_scaled = photo.resize(new_size, Image.Resampling.LANCZOS)
        left = (photo_scaled.width - target_w) // 2
        top = (photo_scaled.height - target_h) // 2
        photo_cropped = photo_scaled.crop((left, top, left + target_w, top + target_h))

        # Rounded mask
        mask = Image.new("L", (target_w, target_h), 0)
        mask_draw = ImageDraw.Draw(mask)
        mask_draw.rounded_rectangle([0, 0, target_w, target_h], radius=24, fill=255)

        # Card shadow
        card_x, card_y = 1220, 140
        shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        shadow_draw = ImageDraw.Draw(shadow)
        shadow_draw.rounded_rectangle([card_x-10, card_y+10, card_x+target_w+10, card_y+target_h+30], radius=28, fill=(0, 0, 0, 180))
        shadow = shadow.filter(ImageFilter.GaussianBlur(30))
        base = Image.alpha_composite(base, shadow)

        # Paste photo
        base.paste(photo_cropped, (card_x, card_y), mask)

        # Gold frame border
        border_overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        border_draw = ImageDraw.Draw(border_overlay)
        border_draw.rounded_rectangle([card_x, card_y, card_x+target_w, card_y+target_h], radius=24, outline=(229, 169, 60, 220), width=3)
        base = Image.alpha_composite(base, border_overlay)

    # 3. Typography with PSU Stidti
    draw_final = ImageDraw.Draw(base)
    font_bold = "/Library/Fonts/PSU-Stidti-Bold.otf"
    font_reg = "/Library/Fonts/PSU-Stidti-Regular.otf"

    f_eyebrow = ImageFont.truetype(font_reg, 24)
    f_title = ImageFont.truetype(font_bold, 58)
    f_sub = ImageFont.truetype(font_bold, 30)

    # Decorative accent bar
    draw_final.rounded_rectangle([120, 680, 200, 686], radius=3, fill=(229, 169, 60))

    # Text rendering
    # Eyebrow
    draw_final.text((120, 706), award, font=f_eyebrow, fill=(229, 169, 60))
    # Title (Professor name)
    draw_final.text((120, 755), name, font=f_title, fill=(255, 255, 255))
    # Subtitle (Faculty / Department)
    draw_final.text((120, 840), position, font=f_sub, fill=(0, 229, 255))

    base = base.convert("RGB")
    base.save(output_path, "JPEG", quality=95)
    print(f"Rendered Cover Card to: {output_path}")

if __name__ == "__main__":
    out = sys.argv[1]
    photo = sys.argv[2]
    name = sys.argv[3]
    pos = sys.argv[4]
    award = sys.argv[5]
    render_cover_card(out, photo, name, pos, award)
