"""Abre el navegador para los scripts de la skill: Chrome si esta instalado; si no, Edge; si no, el Chromium de Playwright.

Asi funciona en cualquier equipo sin configurar nada. Para forzar uno: variable de entorno
TRAILER_NAVEGADOR=chrome | msedge | chromium. El Chromium de Playwright se instala con:
    python -m playwright install chromium
"""
from __future__ import annotations

import os

CANALES = ("chrome", "msedge", "chromium")
AYUDA = ("Instala Google Chrome o Microsoft Edge, o el Chromium de Playwright con:\n"
         "    python -m playwright install chromium\n"
         "Despues comprueba el entorno con: python <skill>/scripts/comprobar.py")


def _orden() -> list[str]:
    forzado = os.environ.get("TRAILER_NAVEGADOR", "").strip().lower()
    return [forzado] if forzado else list(CANALES)


def _opciones(canal: str) -> dict:
    return {} if canal == "chromium" else {"channel": canal}


def _fallo(errores: list[str]) -> SystemExit:
    return SystemExit("No se pudo abrir ningun navegador:\n  " + "\n  ".join(errores) + "\n" + AYUDA)


def lanzar(chromium, **kw):
    """Version sincrona: lanzar(p.chromium, headless=True, args=[...])."""
    errores = []
    for canal in _orden():
        try:
            return chromium.launch(**_opciones(canal), **kw)
        except Exception as e:  # noqa: BLE001 - se prueba el siguiente
            errores.append(f"{canal}: {str(e).strip().splitlines()[0]}")
    raise _fallo(errores)


async def lanzar_async(chromium, **kw):
    """Version asincrona: await lanzar_async(p.chromium, headless=True)."""
    errores = []
    for canal in _orden():
        try:
            return await chromium.launch(**_opciones(canal), **kw)
        except Exception as e:  # noqa: BLE001 - se prueba el siguiente
            errores.append(f"{canal}: {str(e).strip().splitlines()[0]}")
    raise _fallo(errores)
