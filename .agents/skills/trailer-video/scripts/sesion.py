"""Inicia sesion a mano en una app privada y guarda la sesion para que capturas.py pueda entrar.

    python sesion.py --url https://app.empresa.com/ --salida <trabajo>/sesion.json [--minutos 10]

Abre un navegador VISIBLE en la URL. La persona entra con su cuenta como siempre (SSO, doble factor...) y,
cuando ya ve la app, CIERRA ESA VENTANA. Mientras tanto se guarda la sesion (cookies y almacenamiento local)
en --salida cada pocos segundos.

La sesion es una credencial: se queda en la carpeta de trabajo, no se incrusta en el trailer, no se comparte
ni se sube a ningun sitio y se borra al terminar. Nunca se piden ni se escriben contrasenas.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from navegador import lanzar  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--salida", type=Path, required=True)
    ap.add_argument("--minutos", type=float, default=10.0, help="tiempo maximo de espera")
    a = ap.parse_args()
    a.salida.parent.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = lanzar(p.chromium, headless=False)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.goto(a.url)
        print("Inicia sesion en la ventana que se ha abierto. Cuando veas la app, cierra esa ventana.", flush=True)
        fin = time.time() + a.minutos * 60
        guardada = False
        while time.time() < fin and not page.is_closed():
            try:
                ctx.storage_state(path=str(a.salida))
                guardada = True
            except Exception:  # noqa: BLE001 - la pagina puede estar navegando
                pass
            time.sleep(2)
        try:
            ctx.storage_state(path=str(a.salida))
            guardada = True
        except Exception:  # noqa: BLE001 - ya cerrada: vale la ultima copia
            pass
        browser.close()
    if not guardada:
        raise SystemExit("no se pudo guardar la sesion")
    print(f"sesion guardada en {a.salida} (borrala al terminar: es una credencial)")


if __name__ == "__main__":
    main()
