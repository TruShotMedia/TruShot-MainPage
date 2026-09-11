from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "brand" / "logo-white.png"
GREEN = (31, 94, 65)


def render_icon(destination: Path, size: int, logo_width_ratio: float) -> None:
    source = Image.open(SOURCE).convert("RGBA")
    alpha_bounds = source.getchannel("A").getbbox()
    if alpha_bounds is None:
        raise RuntimeError("The white TruShot logo has no visible pixels.")

    logo = source.crop(alpha_bounds)
    target_width = round(size * logo_width_ratio)
    target_height = round(target_width * logo.height / logo.width)
    logo = logo.resize((target_width, target_height), Image.Resampling.LANCZOS)

    icon = Image.new("RGB", (size, size), GREEN)
    position = ((size - target_width) // 2, (size - target_height) // 2)
    icon.paste(logo, position, logo.getchannel("A"))
    destination.parent.mkdir(parents=True, exist_ok=True)
    icon.save(destination, format="PNG", optimize=True)


render_icon(ROOT / "src" / "app" / "apple-icon.png", 180, 0.82)
render_icon(ROOT / "public" / "icons" / "trushot-app-192.png", 192, 0.82)
render_icon(ROOT / "public" / "icons" / "trushot-app-512.png", 512, 0.82)
render_icon(ROOT / "public" / "icons" / "trushot-app-512-maskable.png", 512, 0.68)
