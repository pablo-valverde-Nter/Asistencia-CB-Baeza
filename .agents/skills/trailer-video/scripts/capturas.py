"""Capturas reales de la app, en alta resolucion, con los rectangulos de cada elemento. SOLO NAVEGA.

    python capturas.py --url <URL local o remota> --recorrido <trabajo>/recorrido.py --out <trabajo>/capturas \
        [--sesion <trabajo>/sesion.json]

Deja en --out:
  img/<nombre>.jpg   2880x1620 (se dibujan a 1920x1080 en la composicion: nitidas aunque la camara acerque)
  rects.json         {captura: {"r": {elemento: [x, y, w, h]}, "m": {campo: metricas de texto}}} en px CSS de 1920x1080

El recorrido va en un archivo aparte (parte de assets/recorrido.py) con una funcion
`async def recorrido(ctx, url, cap)`; este script no se copia ni se edita. Sin --recorrido se usa el ejemplo de
abajo (una captura de la portada), util para comprobar que la URL responde.
--sesion: sesion guardada con sesion.py para apps que piden iniciar sesion.
Un destino de `snap` puede ser:
  "selector"                  el primer elemento que casa
  "selector@@2"               el tercero
  "DIALOG:selector"           la ventana (dialog/modal) que contiene ese elemento
  "TEXT:contenedor|texto"     la hoja con ese texto dentro del contenedor (opciones de un desplegable)
  ["sel1", "sel2"]            el rectangulo que contiene a todos
Las metricas (`metrics={"campo": "selector del input"}`) permiten animar la escritura con `covers` de tipo "type".

Reglas: no enviar formularios, no guardar, no lanzar procesos, no mandar mensajes. Se escribe en los campos
para la captura y se cierra la pagina sin confirmar nada.
"""
from __future__ import annotations

import argparse
import asyncio
import importlib.util
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from navegador import lanzar_async  # noqa: E402
from PIL import Image  # noqa: E402
from playwright.async_api import async_playwright  # noqa: E402

W, H = 1920, 1080

RECTS_JS = """(targets) => {
  const area = (e) => { const b = e.getBoundingClientRect(); return b.width * b.height; };
  const dialogOf = (inner) => {
    const el = document.querySelector(inner);
    if (!el) return null;
    const cands = [];
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      if (/dialog|modal/i.test((e.className || '').toString()) || e.getAttribute('role') === 'dialog') cands.push(e);
    }
    return cands.filter((e) => area(e) < innerWidth * innerHeight * 0.8).sort((a, b) => area(b) - area(a))[0] || null;
  };
  const byText = (container, text) => {
    const hits = [...document.querySelectorAll(container + ' *')].filter((e) => e.children.length === 0 && e.textContent.includes(text));
    return hits.length ? (hits[0].closest('[class*="ption"], [role="option"]') || hits[0]) : null;
  };
  const pick = (spec) => {
    if (spec.startsWith('DIALOG:')) return dialogOf(spec.slice(7));
    if (spec.startsWith('TEXT:')) { const [c, txt] = spec.slice(5).split('|'); return byText(c, txt); }
    const [sel, idx] = spec.split('@@');
    return document.querySelectorAll(sel)[idx ? Number(idx) : 0] || null;
  };
  const out = {};
  for (const [name, specs] of Object.entries(targets)) {
    let top = 1e9, left = 1e9, right = -1e9, bottom = -1e9, found = false;
    for (const spec of specs) {
      const el = pick(spec);
      if (!el) continue;
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      found = true;
      top = Math.min(top, b.top); left = Math.min(left, b.left);
      right = Math.max(right, b.right); bottom = Math.max(bottom, b.bottom);
    }
    if (found) out[name] = [Math.round(left), Math.round(top), Math.round(right - left), Math.round(bottom - top)];
  }
  return out;
}"""

METRICS_JS = """(sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const b = el.getBoundingClientRect(), cs = getComputedStyle(el);
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  if (cs.letterSpacing && cs.letterSpacing !== 'normal') ctx.letterSpacing = cs.letterSpacing;
  const val = el.value || el.textContent || '';
  return { r: [b.left, b.top, b.width, b.height].map((v) => Math.round(v)),
           pl: parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth), pt: parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth),
           fs: parseFloat(cs.fontSize), w: Math.round(ctx.measureText(val).width * 10) / 10, n: val.length, bg: cs.backgroundColor, col: cs.color };
}"""


class Capturador:
    def __init__(self, out: Path):
        self.img = out / "img"
        self.img.mkdir(parents=True, exist_ok=True)
        self.out = out
        self.data: dict = {}

    async def snap(self, page, name: str, targets: dict, metrics: dict | None = None) -> None:
        """Captura la pagina tal como esta y guarda los rectangulos de `targets` (y las metricas de texto)."""
        await page.mouse.move(3, 3)          # que ningun hover salga en la captura
        await page.wait_for_timeout(450)
        png = self.img / f"{name}.png"
        await page.screenshot(path=str(png))
        Image.open(png).convert("RGB").resize((W * 3 // 2, H * 3 // 2), Image.LANCZOS).save(
            self.img / f"{name}.jpg", quality=80, optimize=True, progressive=True)
        png.unlink()
        rects = await page.evaluate(RECTS_JS, {k: v if isinstance(v, list) else [v] for k, v in targets.items()})
        faltan = sorted(set(targets) - set(rects))
        entry = {"r": rects}
        for key, sel in (metrics or {}).items():
            m = await page.evaluate(METRICS_JS, sel)
            if m:
                entry.setdefault("m", {})[key] = m
            else:
                faltan.append(f"metrica {key}")
        self.data[name] = entry
        print(f"captura {name}: {len(rects)} rectangulos" + (f" | FALTAN: {faltan}" if faltan else ""), flush=True)

    def save(self) -> None:
        (self.out / "rects.json").write_text(json.dumps(self.data, ensure_ascii=False, indent=1), encoding="utf-8")
        print("listo:", self.out / "rects.json")


async def recorrido(ctx, url: str, cap: Capturador) -> None:
    """Ejemplo minimo (sin --recorrido). El de verdad va en su propio archivo: ver assets/recorrido.py."""
    page = await ctx.new_page()
    await page.goto(url, wait_until="networkidle")
    await page.wait_for_timeout(2500)
    await cap.snap(page, "inicio", {"boton": "button", "cabecera": "header"})
    # Ejemplo de dialogo y escritura:
    # await page.click("#nuevo")
    # await page.wait_for_timeout(1000)
    # await page.click("#nombre")
    # await page.keyboard.type("ejemplo", delay=30)
    # await cap.snap(page, "nuevo-escrito", {"dialog": "DIALOG:#nombre", "input": "#nombre"}, {"input": "#nombre"})
    await page.close()


def cargar_recorrido(path: Path | None):
    """La funcion `recorrido` del archivo indicado (o el ejemplo de este script)."""
    if not path:
        return recorrido
    spec = importlib.util.spec_from_file_location("recorrido_trailer", path)
    mod = importlib.util.module_from_spec(spec)
    mod.Capturador = Capturador   # por si el recorrido lo usa en anotaciones
    spec.loader.exec_module(mod)
    if not hasattr(mod, "recorrido"):
        raise SystemExit(f"{path} no define `async def recorrido(ctx, url, cap)`")
    return mod.recorrido


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True, help="URL local (http://localhost:...) o remota (https://...)")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--recorrido", type=Path, help="archivo .py con `async def recorrido(ctx, url, cap)`")
    ap.add_argument("--sesion", type=Path, help="sesion guardada con sesion.py (apps con inicio de sesion)")
    ap.add_argument("--locale", default="es-ES")
    a = ap.parse_args()
    fn = cargar_recorrido(a.recorrido)
    cap = Capturador(a.out)
    async with async_playwright() as p:
        # Chrome, Edge o el Chromium de Playwright, el primero que haya (ver navegador.py).
        browser = await lanzar_async(p.chromium, headless=True, args=["--hide-scrollbars"])
        opts = {"viewport": {"width": W, "height": H}, "locale": a.locale, "device_scale_factor": 2}
        if a.sesion:
            opts["storage_state"] = str(a.sesion)
        ctx = await browser.new_context(**opts)
        await fn(ctx, a.url, cap)
        await browser.close()
    cap.save()


if __name__ == "__main__":
    asyncio.run(main())
