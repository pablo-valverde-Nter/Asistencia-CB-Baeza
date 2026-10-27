"""Hoja de contactos de la composicion: fotogramas en los segundos pedidos, para revisarla sin grabar.

    python vistazo.py --html <trabajo>/trailer-en-directo.html --salida vistazo.jpg [--t 3 8.5 14] [--cada 4]

Sin --t, saca un fotograma cada --cada segundos. Cada vineta lleva su segundo. Tambien avisa de errores de la
pagina (p. ej. "sin rectangulo: captura.elemento" cuando un capitulo apunta a un elemento que no se capturo).
"""
from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from navegador import lanzar  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", type=Path, required=True)
    ap.add_argument("--salida", type=Path, required=True)
    ap.add_argument("--t", type=float, nargs="*")
    ap.add_argument("--cada", type=float, default=4.0)
    ap.add_argument("--columnas", type=int, default=4)
    a = ap.parse_args()
    errores = []
    with sync_playwright() as p:
        b = lanzar(p.chromium, headless=True, args=["--hide-scrollbars"])
        page = b.new_page(viewport={"width": 1920, "height": 1080})
        page.on("pageerror", lambda e: errores.append(str(e)))
        page.goto(a.html.resolve().as_uri(), wait_until="load")
        page.evaluate("() => window.__proto.render()")
        page.evaluate("() => window.__proto.ready")
        total = page.evaluate("() => window.__proto.duration()")
        times = a.t or [round(i * a.cada, 2) for i in range(int(total // a.cada) + 1)]
        tiles = []
        for t in times:
            page.evaluate("(t) => window.__proto.seek(t)", t)
            page.wait_for_timeout(120)
            im = Image.open(io.BytesIO(page.screenshot(type="jpeg", quality=85))).resize((640, 360), Image.LANCZOS)
            d = ImageDraw.Draw(im)
            d.rectangle([0, 0, 92, 30], fill=(0, 0, 0))
            d.text((8, 7), f"{t:6.2f} s", fill=(255, 255, 255))
            tiles.append(im)
        b.close()
    cols = a.columnas
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * 650, rows * 370), (20, 20, 20))
    for i, im in enumerate(tiles):
        sheet.paste(im, ((i % cols) * 650 + 5, (i // cols) * 370 + 5))
    sheet.save(a.salida, quality=88)
    print(f"{a.salida} | {len(tiles)} fotogramas | duracion {total:.1f} s")
    for e in errores:
        print("ERROR en la pagina:", e)


if __name__ == "__main__":
    main()
