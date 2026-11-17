from PIL import Image, ImageDraw
import os
import glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")

icon = Image.open(os.path.join(ROOT, "assets", "icon-only.png")).convert("RGBA")
foreground = Image.open(os.path.join(ROOT, "assets", "icon-foreground.png")).convert("RGBA")

sizes = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}
fg_sizes = {
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 324,
    "xxxhdpi": 432,
}

for density, size in sizes.items():
    folder = os.path.join(RES, f"mipmap-{density}")
    os.makedirs(folder, exist_ok=True)
    im = icon.resize((size, size), Image.LANCZOS)
    im.save(os.path.join(folder, "ic_launcher.png"))
    im.save(os.path.join(folder, "ic_launcher_round.png"))
    fg = foreground.resize((fg_sizes[density], fg_sizes[density]), Image.LANCZOS)
    fg.save(os.path.join(folder, "ic_launcher_foreground.png"))

# Splash screens: keep the existing dimensions, fill with dark background + centered icon.
for path in glob.glob(os.path.join(RES, "**", "splash.png"), recursive=True):
    old = Image.open(path)
    w, h = old.size
    canvas = Image.new("RGBA", (w, h), (18, 16, 15, 255))
    draw = ImageDraw.Draw(canvas)
    # soft warm glow behind the mark
    cx, cy = w // 2, int(h * 0.46)
    radius = int(min(w, h) * 0.30)
    for i in range(16, 0, -1):
        r = int(radius * i / 14)
        alpha = int(2 + (16 - i) * 0.8)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(52, 39, 29, alpha))
    logo_size = int(min(w, h) * 0.27)
    logo = icon.resize((logo_size, logo_size), Image.LANCZOS)
    canvas.alpha_composite(logo, (cx - logo_size // 2, cy - logo_size // 2))
    canvas.convert("RGB").save(path)
    print("splash", path, w, h)

# Android 12 splash icon (transparent mark).
icon12 = foreground.resize((512, 512), Image.LANCZOS)
os.makedirs(os.path.join(RES, "drawable"), exist_ok=True)
icon12.save(os.path.join(RES, "drawable", "splash_icon.png"))

print("android assets written")
