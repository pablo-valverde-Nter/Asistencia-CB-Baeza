"""Version ligera del MP4 para web/correo (tamano objetivo) y su portada.

    python version_web.py --origen trailer.mp4 --salida trailer_web.mp4 [--mb 19.5] [--portada 6.0]

Dos pasadas de x264 con el bitrate justo para el tamano; la imagen sigue en 1080p.
Para publicarla como recurso de una pagina de claude.ai hay que quedarse por debajo de 20 MiB.
"""
import argparse
import os
import re
import subprocess
from pathlib import Path

import imageio_ffmpeg
from PIL import Image

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def duration(path: Path) -> float:
    err = subprocess.run([FFMPEG, "-hide_banner", "-i", str(path)], capture_output=True, text=True).stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", err).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--origen", type=Path, required=True)
    ap.add_argument("--salida", type=Path, required=True)
    ap.add_argument("--mb", type=float, default=19.5)
    ap.add_argument("--audio", type=int, default=128_000)
    ap.add_argument("--fps", type=int, default=60)
    ap.add_argument("--portada", type=float, default=6.0)
    a = ap.parse_args()
    dur = duration(a.origen)
    vbit = int((a.mb * 1e6 * 8 / dur - a.audio) * 0.97)
    common = ["-vf", f"fps={a.fps}", "-c:v", "libx264", "-preset", "slow", "-tune", "animation", "-b:v", str(vbit),
              "-maxrate", str(int(vbit * 2.2)), "-bufsize", str(int(vbit * 4)), "-profile:v", "high", "-level", "4.2",
              "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"]
    log = str(a.salida.with_suffix(""))+ "-x264"
    null = os.devnull
    base = [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", str(a.origen), *common]
    subprocess.run([*base, "-pass", "1", "-passlogfile", log, "-an", "-f", "mp4", null], check=True)
    subprocess.run([*base, "-pass", "2", "-passlogfile", log, "-c:a", "aac", "-b:a", str(a.audio), "-movflags", "+faststart",
                    str(a.salida)], check=True)
    for p in a.salida.parent.glob(Path(log).name + "*"):
        p.unlink()
    poster = a.salida.with_suffix(".jpg")
    subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{a.portada:.2f}", "-i", str(a.salida),
                    "-frames:v", "1", "-q:v", "3", str(poster)], check=True)
    Image.open(poster).resize((1280, 720), Image.LANCZOS).save(poster, quality=84, optimize=True, progressive=True)
    print(f"{a.salida.name}: {a.salida.stat().st_size / 1e6:.2f} MB | {dur:.1f} s | video {vbit // 1000} kbps | portada {poster.name}")


if __name__ == "__main__":
    main()
