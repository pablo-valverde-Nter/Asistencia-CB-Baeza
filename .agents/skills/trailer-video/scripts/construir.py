"""Mete en la composicion las capturas, sus rectangulos, la marca, el icono, el logo, la musica y el video: un HTML autonomo.

    python construir.py --composicion <trabajo>/trailer.html --capturas <trabajo>/capturas \
        [--marca nfq|n|...] [--icono icono.png] [--logo logo-cliente.svg] [--musica <trabajo>/musica.wav] \
        [--video <trabajo>/App_trailer_web.mp4 [--video-modo auto|incrustado|enlazado]] --salida <trabajo>/trailer.html

La composicion tiene huecos /*IMGS*/{}/*END*/, /*RECTS*/{}/*END*/, /*MARCA*/{...}/*END*/, /*ICONO*/""/*END*/,
/*LOGO*/""/*END*/, /*MUSIC*/""/*END*/ y /*VIDEO*/{...}/*END*/.
Marca (references/marca.md): la N de assets/marca/n.svg va siempre. La firma del cierre es Nfq por defecto
(assets/marca/nfq-claim-negro.svg en tema claro y -blanco.svg en oscuro); --marca n firma solo con la N y
--marca <submarca> usa sus logos con claim.
Video: con --video la pagina muestra el boton "Descargar video". Por defecto (auto) el MP4 va dentro del HTML si
pesa hasta 20 MB (un solo archivo que descarga siempre, ~1,35x el tamano del MP4); si pesa mas, se copia junto a la
pagina y se enlaza (descarga cuando la pagina se sirve por web).
La musica va en AAC a 112 kbps: una pagina de ~4 min con 20-30 capturas queda en 10-12 MB.
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import re
import shutil
import subprocess
import urllib.parse
from pathlib import Path

import imageio_ffmpeg
from PIL import Image

MARCAS = Path(__file__).resolve().parent.parent / "assets" / "marca"


def img_uri(path: Path | None, crop: tuple | None = None) -> str:
    """Imagen como data URI: un SVG tal cual; el resto, en PNG (con recorte opcional)."""
    if not path:
        return ""
    if path.suffix.lower() == ".svg":
        return "data:image/svg+xml;base64," + base64.b64encode(path.read_bytes()).decode()
    img = Image.open(path)
    if crop:
        img = img.crop(crop)
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def simbolo(path: Path) -> str:
    """El SVG del simbolo listo para ir en linea en la pagina: sin cabecera XML ni comentarios y con los ids
    empezando por "n-" (la plantilla los renombra en cada copia para que no choquen)."""
    svg = path.read_text(encoding="utf-8")
    if re.search(r"<script|<foreignObject|\son\w+\s*=|javascript:|href\s*=\s*\"(?!#)", svg, re.I):
        raise SystemExit(f"{path}: el simbolo no puede llevar scripts, manejadores ni enlaces externos")
    svg = re.sub(r"<\?xml.*?\?>|<!--.*?-->", "", svg, flags=re.S).strip()
    for ident in re.findall(r'\bid="([^"]+)"', svg):
        if not ident.startswith("n-"):
            svg = (svg.replace(f'id="{ident}"', f'id="n-{ident}"').replace(f"url(#{ident})", f"url(#n-{ident})")
                   .replace(f'href="#{ident}"', f'href="#n-{ident}"'))
    return svg


def marca(nombre: str) -> dict:
    """La N siempre y, salvo --marca n, los logos con claim de la submarca para el tema claro y el oscuro."""
    n_svg = MARCAS / "n.svg"
    if not n_svg.exists():
        raise SystemExit(f"falta el simbolo de marca {n_svg}")
    datos = {"simbolo": simbolo(n_svg), "firma": {}, "nombre": nombre.lower()}
    sub = nombre.lower()
    if sub != "n":
        rutas = {"claro": MARCAS / f"{sub}-claim-negro.svg", "oscuro": MARCAS / f"{sub}-claim-blanco.svg"}
        faltan = [p.name for p in rutas.values() if not p.exists()]
        if faltan:
            raise SystemExit(f"--marca {sub}: faltan {', '.join(faltan)} en {MARCAS} "
                             "(descargalos del Drive de marca; ver assets/marca/LEEME.md)")
        datos["firma"] = {tema: img_uri(p) for tema, p in rutas.items()}
    return datos


def video(path: Path | None, salida: Path, modo: str) -> dict:
    """El MP4 para el boton de descarga. incrustado: dentro del HTML (descarga siempre, tambien abriendo la pagina
    desde el disco). enlazado: copia junto a la pagina (descarga si la pagina se sirve por web; abierta desde el
    disco, el navegador lo reproduce en vez de descargarlo). auto: incrustado hasta 20 MB."""
    if not path:
        return {"src": "", "nombre": ""}
    if not path.exists():
        raise SystemExit(f"--video: no existe {path}")
    nombre, mb = path.name, path.stat().st_size / 1e6
    if modo == "incrustado" or (modo == "auto" and mb <= 20):
        if mb > 20:
            print(f"aviso: el video pesa {mb:.1f} MB; incrustado, la pagina pasara de {mb * 1.35:.0f} MB")
        return {"src": "data:video/mp4;base64," + base64.b64encode(path.read_bytes()).decode(), "nombre": nombre}
    destino = salida.parent / nombre
    if destino.resolve() != path.resolve():
        shutil.copy2(path, destino)
    print(f"video enlazado ({mb:.1f} MB): comparte {nombre} junto a la pagina; el boton descarga si la pagina se sirve por web")
    return {"src": urllib.parse.quote(nombre), "nombre": nombre}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--composicion", type=Path, required=True)
    ap.add_argument("--capturas", type=Path, required=True)
    ap.add_argument("--marca", default="nfq", help="firma del cierre: nfq (por defecto), n (solo la N) u otra submarca de assets/marca")
    ap.add_argument("--icono", "--mascota", dest="icono", type=Path,
                    help="icono o mascota de la app (PNG o SVG); sustituye a la N en la etiqueta de cada capitulo")
    ap.add_argument("--icono-recorte", "--mascota-recorte", dest="icono_recorte",
                    help="x0,y0,x1,y1 para quedarse con una parte del icono (cuadrado)")
    ap.add_argument("--logo", type=Path, help="logo del cliente o de la app para el cierre (PNG o SVG); se muestra tal cual")
    ap.add_argument("--musica", type=Path)
    ap.add_argument("--video", type=Path, help="MP4 para el boton 'Descargar video' (solo si el usuario lo pidio)")
    ap.add_argument("--video-modo", choices=["auto", "incrustado", "enlazado"], default="auto",
                    help="auto (por defecto): incrustado si el MP4 pesa <= 20 MB, si no enlazado junto a la pagina")
    ap.add_argument("--salida", type=Path, required=True)
    a = ap.parse_args()

    rects = json.loads((a.capturas / "rects.json").read_text(encoding="utf-8"))
    imgs = {n: "data:image/jpeg;base64," + base64.b64encode((a.capturas / "img" / f"{n}.jpg").read_bytes()).decode() for n in rects}
    crop = tuple(int(v) for v in a.icono_recorte.split(",")) if a.icono_recorte else None
    music = ""
    if a.musica and a.musica.exists():
        m4a = a.musica.with_suffix(".m4a")
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(a.musica),
                        "-c:a", "aac", "-b:a", "112k", "-movflags", "+faststart", str(m4a)], check=True)
        music = "data:audio/mp4;base64," + base64.b64encode(m4a.read_bytes()).decode()

    html = a.composicion.read_text(encoding="utf-8")
    a.salida.parent.mkdir(parents=True, exist_ok=True)
    # "<" escapado: el SVG del simbolo va dentro de un <script>.
    marca_js = json.dumps(marca(a.marca), ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    vid = video(a.video, a.salida, a.video_modo)
    modo_video = "no" if not vid["src"] else ("incrustado" if vid["src"].startswith("data:") else "enlazado")
    subs = {"IMGS": json.dumps(imgs, separators=(",", ":")), "RECTS": json.dumps(rects, separators=(",", ":")), "MARCA": marca_js,
            "ICONO": json.dumps(img_uri(a.icono, crop)), "LOGO": json.dumps(img_uri(a.logo)), "MUSIC": json.dumps(music),
            "VIDEO": json.dumps(vid, ensure_ascii=False)}
    for key, value in subs.items():
        html, n = re.subn(rf"/\*{key}\*/.*?/\*END\*/", lambda m: f"/*{key}*/" + value + "/*END*/", html, count=1, flags=re.S)
        if n != 1:
            raise SystemExit(f"la composicion no tiene el hueco /*{key}*/.../*END*/ "
                             "(si es de una version anterior de la plantilla, parte de assets/plantilla.html)")
    a.salida.write_text(html, encoding="utf-8")
    print(f"{a.salida.name}: {a.salida.stat().st_size / 1e6:.2f} MB | {len(imgs)} capturas | marca {a.marca} | "
          f"icono {'si' if a.icono else 'no'} | logo {'si' if a.logo else 'no'} | musica {'si' if music else 'no'} | "
          f"video {modo_video}")


if __name__ == "__main__":
    main()
