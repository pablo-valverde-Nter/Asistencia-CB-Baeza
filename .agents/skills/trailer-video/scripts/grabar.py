"""Graba la pagina en directo fotograma a fotograma y la monta con la musica en un MP4.

    python grabar.py --html <trabajo>/trailer-en-directo.html --musica <trabajo>/musica.wav --salida trailer.mp4 [--fps 60] [--dpr 1]

Cada fotograma se calcula con window.__proto.seek(t) y se captura por CDP: no depende de lo rapido que pinte el
navegador, asi que no hay tirones ni fotogramas perdidos (un video de 4 min a 60 fps tarda ~20 min).
--dpr 1 -> 1920x1080 (CRF 17)   --dpr 1.3333 -> 2560x1440 dibujado a esa resolucion (CRF 16, ~2,5x mas lento).
Tambien escribe <salida>.capitulos.json (id, titulo y segundo de cada parte).
"""
from __future__ import annotations

import argparse
import base64
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import imageio_ffmpeg  # noqa: E402
from navegador import lanzar  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", type=Path, required=True)
    ap.add_argument("--musica", type=Path)
    ap.add_argument("--salida", type=Path, required=True)
    ap.add_argument("--fps", type=int, default=60)
    ap.add_argument("--dpr", type=float, default=1.0)
    ap.add_argument("--desde", type=float, default=0.0, help="grabar solo un tramo (pruebas)")
    ap.add_argument("--hasta", type=float)
    a = ap.parse_args()
    hi = a.dpr != 1
    with sync_playwright() as p:
        browser = lanzar(p.chromium, headless=True, args=["--hide-scrollbars", "--force-color-profile=srgb"])
        page = browser.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=a.dpr)
        page.goto(a.html.resolve().as_uri(), wait_until="load")
        page.evaluate("() => window.__proto.render()")
        page.evaluate("() => window.__proto.ready")
        total = page.evaluate("() => window.__proto.duration()")
        chapters = page.evaluate("() => window.__proto.chapters()")
        a.salida.with_suffix(".capitulos.json").write_text(json.dumps(chapters, ensure_ascii=False, indent=1), encoding="utf-8")
        # Calentar: todas las imagenes decodificadas antes de grabar.
        for c in chapters:
            for dt in (0.5, 3.5, 8.0):
                page.evaluate("(t) => window.__proto.seek(t)", c["at"] + dt)
                page.wait_for_timeout(150)
        cdp = page.context.new_cdp_session(page)
        t_end = min(a.hasta or total, total)
        f0, f1 = int(round(a.desde * a.fps)), int(round(t_end * a.fps))
        cmd = [imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y",
               "-f", "image2pipe", "-framerate", str(a.fps), "-c:v", "mjpeg", "-i", "-"]
        if a.musica and a.musica.exists():
            cmd += ["-ss", f"{a.desde:.3f}", "-i", str(a.musica), "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "192k", "-shortest"]
        cmd += ["-vf", "scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p",
                "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
                "-c:v", "libx264", "-preset", "slow", "-crf", "16" if hi else "17", "-tune", "animation", "-profile:v", "high",
                "-level", "5.1" if hi else "4.2", "-movflags", "+faststart", str(a.salida)]
        ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        shot = {"format": "jpeg", "quality": 96 if hi else 93, "clip": {"x": 0, "y": 0, "width": 1920, "height": 1080, "scale": 1},
                "optimizeForSpeed": True}
        t0 = time.time()
        for i in range(f0, f1):
            page.evaluate("(t) => window.__proto.seek(t)", i / a.fps)
            ff.stdin.write(base64.b64decode(cdp.send("Page.captureScreenshot", shot)["data"]))
            k = i - f0
            if k and k % (a.fps * 10) == 0:
                el = time.time() - t0
                print(f"{k}/{f1 - f0} fotogramas ({i / a.fps:.0f} s) | {el:.0f} s | quedan ~{el / k * (f1 - f0 - k) / 60:.1f} min", flush=True)
        ff.stdin.close()
        ff.wait()
        browser.close()
    print(f"montado: {a.salida} ({a.salida.stat().st_size / 1e6:.1f} MB, {f1 - f0} fotogramas a {a.fps} fps, {time.time() - t0:.0f} s)")


if __name__ == "__main__":
    main()
