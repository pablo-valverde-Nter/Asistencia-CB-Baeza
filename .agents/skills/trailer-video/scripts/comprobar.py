"""Comprueba que el equipo puede hacer tráileres y dice cómo arreglar lo que falte. No cambia nada.

    python comprobar.py [--url http://localhost:8050/]

Revisa: version de Python, paquetes, navegador (Chrome, Edge o Chromium de Playwright), ffmpeg, acceso a
Google Fonts (fuentes de marca) y, si se pasa --url, que la app responda.
"""
from __future__ import annotations

import argparse
import importlib
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

PAQUETES = {"playwright": "playwright", "numpy": "numpy", "PIL": "pillow", "imageio_ffmpeg": "imageio-ffmpeg"}
REQ = Path(__file__).resolve().parent.parent / "requirements.txt"


def linea(ok: bool, que: str, detalle: str = "") -> bool:
    print(f"[{'OK' if ok else 'FALTA'}] {que}" + (f" - {detalle}" if detalle else ""), flush=True)
    return ok


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", help="URL de la app que se va a grabar (local o remota)")
    a = ap.parse_args()
    bien = True

    bien &= linea(sys.version_info >= (3, 9), f"Python {sys.version.split()[0]}", "" if sys.version_info >= (3, 9) else "hace falta 3.9 o superior")

    faltan = []
    for mod, pip in PAQUETES.items():
        try:
            importlib.import_module(mod)
        except ImportError:
            faltan.append(pip)
    bien &= linea(not faltan, "Paquetes de Python", f"instala con: {sys.executable} -m pip install -r \"{REQ}\"" if faltan else "")

    if "imageio-ffmpeg" not in faltan:
        import imageio_ffmpeg
        try:
            exe = imageio_ffmpeg.get_ffmpeg_exe()
            subprocess.run([exe, "-version"], capture_output=True, check=True)
            linea(True, "ffmpeg")
        except Exception as e:  # noqa: BLE001
            bien &= linea(False, "ffmpeg", str(e))

    if "playwright" not in faltan:
        from playwright.sync_api import sync_playwright
        from navegador import CANALES, _opciones
        usable = None
        with sync_playwright() as p:
            for canal in CANALES:
                try:
                    p.chromium.launch(headless=True, **_opciones(canal)).close()
                    usable = canal
                    break
                except Exception:  # noqa: BLE001
                    continue
        bien &= linea(bool(usable), "Navegador", f"se usara {usable}" if usable else
                      f"instala Chrome o Edge, o ejecuta: {sys.executable} -m playwright install chromium")

    try:
        urllib.request.urlopen("https://fonts.googleapis.com/css2?family=Sora", timeout=8)
        linea(True, "Google Fonts (Sora, Instrument Sans)")
    except Exception as e:  # noqa: BLE001
        linea(False, "Google Fonts", f"sin acceso ({e}); las paginas usaran la fuente del sistema y no cumpliran la marca")

    if a.url:
        if a.url.startswith(("http://", "https://")):
            try:
                with urllib.request.urlopen(urllib.request.Request(a.url, headers={"User-Agent": "trailer-video"}), timeout=15) as r:
                    linea(True, f"La app responde ({r.status})", a.url)
            except Exception as e:  # noqa: BLE001
                bien &= linea(False, "La app no responde", f"{a.url}: {e}. Si es local, arrancala; si pide login, usa sesion.py")
        else:
            ruta = urllib.request.url2pathname(urllib.parse.urlparse(a.url).path) if a.url.startswith("file:") else a.url
            bien &= linea(Path(ruta).exists(), "Archivo local", ruta)

    print("\nTodo listo." if bien else "\nArregla lo marcado como FALTA y vuelve a ejecutar este script.")
    sys.exit(0 if bien else 1)


if __name__ == "__main__":
    main()
