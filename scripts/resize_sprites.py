"""Resize every PNG sprite under a folder to 256x256 in place.

Usage: python scripts/resize_sprites.py [folder]
Defaults to this project's assets/sprites, so it never depends on a machine path.
"""
import sys
from pathlib import Path

from PIL import Image

DEFAULT_BASE = Path(__file__).resolve().parent.parent / "assets" / "sprites"


def main(argv: list[str]) -> int:
    base = Path(argv[1]).resolve() if len(argv) > 1 else DEFAULT_BASE
    if not base.is_dir():
        print(f"Error: {base} is not a directory.")
        print(f"Why: this tool resizes the PNG sprites inside one folder.")
        print(f"Fix: pass an existing folder, e.g. the default {DEFAULT_BASE}.")
        return 2
    for path in sorted(base.rglob("*.png")):
        with Image.open(path) as image:  # hygiene: allow PIL image binary open
            rgba = image.convert("RGBA")
            if rgba.size != (256, 256):
                rgba.resize((256, 256), Image.LANCZOS).save(path)
    print("done")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
