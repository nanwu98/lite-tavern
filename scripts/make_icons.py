from PIL import Image, ImageDraw, ImageFont
import os

BASE = 1024
SS = 4
S = BASE * SS


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size, top, bottom):
    img = Image.new("RGB", (1, size), top)
    px = img.load()
    for y in range(size):
        px[0, y] = lerp(top, bottom, y / max(1, size - 1))
    return img.resize((size, size))


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def draw_emblem(draw, cx, cy, scale, gold=(232, 180, 113), dark=(26, 21, 18)):
    # Chat bubble: rounded rectangle with a tail, centered on (cx, cy).
    w = int(470 * scale)
    h = int(340 * scale)
    x0, y0 = cx - w // 2, cy - h // 2 - int(20 * scale)
    x1, y1 = cx + w // 2, cy + h // 2 - int(20 * scale)
    r = int(90 * scale)
    draw.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=dark)
    # tail
    tail = [
        (cx - int(90 * scale), y1 - int(6 * scale)),
        (cx - int(150 * scale), y1 + int(100 * scale)),
        (cx + int(20 * scale), y1 - int(6 * scale)),
    ]
    draw.polygon(tail, fill=dark)
    # three gold strokes
    lw = max(2, int(30 * scale))
    lx0 = cx - int(150 * scale)
    lx1 = cx + int(150 * scale)
    for i, factor in enumerate([0.0, 0.42, 0.75]):
        y = cy - int(105 * scale) + i * int(75 * scale)
        draw.rounded_rectangle([lx0, y, lx0 + int((lx1 - lx0) * (1 - factor * 0.45)), y + lw],
                               radius=lw // 2, fill=gold)
    # spark
    sx, sy = cx + int(215 * scale), cy - int(235 * scale)
    sr = int(46 * scale)
    draw.ellipse([sx - sr, sy - sr, sx + sr, sy + sr], fill=gold)
    draw.ellipse([sx - sr // 2, sy - sr // 2, sx + sr // 2, sy + sr // 2], fill=(255, 239, 209))


def make_icon(size=BASE, transparent=True):
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    # Background rounded square with gradient.
    grad = gradient(S, (46, 35, 27), (18, 15, 13)).convert("RGBA")
    mask = rounded_mask(S, int(S * 0.235))
    canvas.paste(grad, (0, 0), mask)
    draw = ImageDraw.Draw(canvas)
    # Inner warm halo.
    halo = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    hd.ellipse([int(S * 0.12), int(S * 0.05), int(S * 0.98), int(S * 0.9)], fill=(232, 180, 113, 26))
    canvas.alpha_composite(Image.composite(halo, Image.new("RGBA", (S, S), (0, 0, 0, 0)), mask))
    # Border highlight.
    draw.rounded_rectangle([int(S * 0.012), int(S * 0.012), S - int(S * 0.012), S - int(S * 0.012)],
                           radius=int(S * 0.228), outline=(255, 220, 170, 46), width=max(2, int(S * 0.004)))
    draw_emblem(draw, S // 2, S // 2 + int(S * 0.015), S / 1024 * 0.98)
    return canvas.resize((size, size), Image.LANCZOS)


def make_foreground(size=BASE):
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    # Emblem small enough for Android adaptive-icon safe zone.
    draw_emblem(draw, S // 2, S // 2, S / 1024 * 0.68)
    return canvas.resize((size, size), Image.LANCZOS)


def make_splash(size=2732):
    img = Image.new("RGBA", (size, size), (18, 16, 15, 255))
    # subtle radial glow
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for i in range(60, 0, -1):
        r = int(size * 0.06 * i)
        alpha = int(1.4 * (60 - i))
        gd.ellipse([size // 2 - r, int(size * 0.40) - r, size // 2 + r, int(size * 0.40) + r],
                   fill=(232, 180, 113, min(alpha, 14)))
    img.alpha_composite(glow)
    emblem = make_icon(560, transparent=False)
    img.alpha_composite(emblem, (size // 2 - 280, int(size * 0.31) - 280))
    return img


os.makedirs("build", exist_ok=True)
os.makedirs("assets", exist_ok=True)

icon = make_icon(1024)
icon.save("build/icon.png")
icon.save("assets/icon-only.png")
icon.save("assets/icon.png")
icon.save(
    "build/icon.ico",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)

fg = make_foreground(1024)
fg.save("assets/icon-foreground.png")
bg = gradient(1024, (46, 35, 27), (18, 15, 13)).convert("RGBA")
bg.save("assets/icon-background.png")
splash = make_splash(2732)
splash.convert("RGB").save("assets/splash.png", quality=95)
splash.convert("RGB").save("build/splash.png", quality=95)

# Preview contact sheet for quick visual check.
preview = Image.new("RGBA", (560, 200), (30, 26, 23, 255))
for i, s in enumerate([128, 64, 48, 32, 16]):
    im = icon.resize((s, s), Image.LANCZOS)
    x = 20 + sum([128, 64, 48, 32, 16][:i]) + i * 16
    preview.alpha_composite(im, (x, 36))
preview.convert("RGB").save("build/icon-preview.png")
print("icons written")
