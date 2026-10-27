"""Musica original para el trailer, sintetizada aqui (sin muestras ni licencias) y cuadrada con sus capitulos.

    python musica.py --html <trabajo>/trailer.html --salida <trabajo>/musica.wav [--estilo corporativo] [--tono 0] [--semilla 7]

Lee de la pagina (window.__proto) la duracion, la velocidad (SPEED), el inicio de cada parte, los golpes de la
apertura y los momentos destacados (rotulos). Asi la musica siempre casa con la composicion: barrido + golpe en
el primer tiempo de cada parte, una campana en cada golpe de la apertura y un destello en cada rotulo.
El tempo real es bpm x SPEED (100 ppm al 90 % -> 90 ppm). Cada parte debe durar un numero entero de compases
(a 100 ppm: multiplos de 2,4 s).

Estilos (la IA lo elige segun el tono del video; ver references/direccion.md):
  corporativo  calido y optimista: pad, bajo en blancas, arpegio en corcheas, bateria ligera (por defecto)
  tech         oscuro y preciso: menor, arpegio pulsado en semicorcheas, bombo a negras, pad con bombeo
  calma        sereno: acordes de septima, arpegio lento tipo piano, bombo suave y poco mas
  energico     brillante y con empuje: pop mayor, bajo en corcheas, bateria sincopada y bombeo ligero
--tono sube o baja la tonalidad (-5..5 semitonos) y --semilla cambia detalles (fase, arpegio elegido).
Nivel suave: RMS -17 dBFS, pico < -1 dBFS.
"""
from __future__ import annotations

import argparse
import sys
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np  # noqa: E402
from navegador import lanzar  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

SR = 48000

# acordes: nombre -> (nota del bajo, 4 notas del pad) en MIDI. arp: indices 0-3 a las notas del pad, 4 = la 1a una octava arriba.
ESTILOS = {
    "corporativo": {
        "acordes": {"Am7": (45, [57, 60, 64, 67]), "Fmaj7": (41, [53, 57, 60, 64]), "C": (48, [55, 60, 64, 67]), "G": (43, [55, 59, 62, 67])},
        "prog": ["Am7", "Fmaj7", "C", "G"], "intro": ["Fmaj7", "C", "G"], "final": ["Am7", "Fmaj7", "G", "C", "C"],
        "pad": 0.022, "brillo": 3.6, "shimmer": 0.0075, "bajo": "blancas", "bajo_g": 0.085,
        "arp": [[0, 1, 2, 3, 2, 1, 2, 3], [0, 2, 1, 3, 2, 1, 3, 2], [0, 1, 2, 3, 4, 3, 2, 1]], "arp_g": 0.07, "arp_dec": 0.26,
        "bateria": "ligera", "bombeo": 0.0, "campanas": [69, 72, 76, 79, 81, 84],
    },
    "tech": {
        "acordes": {"Dm": (38, [57, 62, 65, 69]), "Bb": (46, [58, 62, 65, 70]), "F": (41, [57, 60, 65, 69]), "C": (48, [55, 60, 64, 67])},
        "prog": ["Dm", "Bb", "F", "C"], "intro": ["Dm", "Bb", "C"], "final": ["Dm", "Bb", "C", "Dm", "Dm"],
        "pad": 0.017, "brillo": 2.4, "shimmer": 0.005, "bajo": "corcheas", "bajo_g": 0.075,
        "arp": [[0, 2, 1, 3, 0, 2, 1, 4, 0, 2, 1, 3, 1, 2, 3, 4], [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1]], "arp_g": 0.05, "arp_dec": 0.11,
        "bateria": "cuatro", "bombeo": 0.45, "campanas": [62, 65, 69, 72, 74, 77],
    },
    "calma": {
        "acordes": {"Fmaj7": (41, [53, 57, 60, 64]), "Em7": (40, [52, 55, 59, 62]), "Dm7": (38, [53, 57, 60, 62]), "Cmaj7": (48, [55, 59, 64, 67])},
        "prog": ["Fmaj7", "Em7", "Dm7", "Cmaj7"], "intro": ["Fmaj7", "Em7", "Dm7"], "final": ["Fmaj7", "Em7", "Dm7", "Cmaj7", "Cmaj7"],
        "pad": 0.024, "brillo": 4.4, "shimmer": 0.006, "bajo": "redondas", "bajo_g": 0.07,
        "arp": [[0, 2, 3, 4, 3, 2, 1, 2], [0, 1, 2, 3, 4, 3, 2, 1]], "arp_g": 0.055, "arp_dec": 0.65,
        "bateria": "suave", "bombeo": 0.0, "campanas": [72, 76, 79, 83, 84, 88],
    },
    "energico": {
        "acordes": {"C": (48, [55, 60, 64, 67]), "G": (43, [55, 59, 62, 67]), "Am": (45, [57, 60, 64, 69]), "F": (41, [53, 57, 60, 65])},
        "prog": ["C", "G", "Am", "F"], "intro": ["F", "G", "C"], "final": ["Am", "F", "G", "C", "C"],
        "pad": 0.02, "brillo": 3.0, "shimmer": 0.008, "bajo": "corcheas", "bajo_g": 0.08,
        "arp": [[0, 2, 1, 2, 0, 2, 3, 2], [0, 1, 2, 3, 4, 3, 2, 1], [0, 2, 4, 2, 1, 2, 3, 2]], "arp_g": 0.075, "arp_dec": 0.2,
        "bateria": "pop", "bombeo": 0.22, "campanas": [72, 76, 79, 84, 86, 88],
    },
}


def leer_pagina(html: Path) -> dict:
    with sync_playwright() as p:
        b = lanzar(p.chromium, headless=True)
        page = b.new_page()
        page.goto(html.resolve().as_uri(), wait_until="load")
        datos = page.evaluate("""() => {
          const q = window.__proto;
          return { total: q.duration(), speed: q.speed ? q.speed() : 1, chaps: q.chapters(),
                   golpes: q.golpes ? q.golpes() : null, momentos: q.momentos ? q.momentos() : [] };
        }""")
        b.close()
    return datos


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", type=Path, required=True)
    ap.add_argument("--salida", type=Path, required=True)
    ap.add_argument("--estilo", choices=sorted(ESTILOS), default="corporativo")
    ap.add_argument("--tono", type=int, default=0, help="semitonos (-5..5)")
    ap.add_argument("--bpm", type=float, default=100)
    ap.add_argument("--semilla", type=int, default=7)
    ap.add_argument("--palabras", type=int, default=4, help="campanas de la apertura si la pagina no da sus golpes")
    a = ap.parse_args()
    ST = ESTILOS[a.estilo]
    tono = max(-5, min(5, a.tono))
    pg = leer_pagina(a.html)
    TOTAL, speed, chaps = pg["total"], pg["speed"], pg["chaps"]
    BPM = a.bpm * speed
    BEAT = 60 / BPM
    BAR = 4 * BEAT
    starts = [c["at"] for c in chaps]
    golpes = pg["golpes"] if pg["golpes"] is not None else [(0.6 + i * 0.6) / speed for i in range(a.palabras)]
    N = int(round(TOTAL * SR))
    rng = np.random.default_rng(a.semilla)
    L, Rt, VL, VR, PL, PR = (np.zeros(N) for _ in range(6))

    def hz(m: float) -> float:
        return 440.0 * 2 ** ((m + tono - 69) / 12)

    def add(sig, t0, pan=0.0, gain=1.0, verb=0.0, pad=False):
        i0 = int(round(t0 * SR))
        if i0 >= N:
            return
        if i0 < 0:
            sig, i0 = sig[-i0:], 0
        n = min(len(sig), N - i0)
        s = sig[:n] * gain
        gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        (PL if pad else L)[i0:i0 + n] += s * gl
        (PR if pad else Rt)[i0:i0 + n] += s * gr
        if verb:
            VL[i0:i0 + n] += s * gl * verb
            VR[i0:i0 + n] += s * gr * verb

    def env(n, at, d, s, r, hold):
        t = np.arange(n) / SR
        e = np.where(t < at, np.sin(np.pi / 2 * t / max(at, 1e-4)) ** 2, 1.0)
        e = np.where((t >= at) & (t < at + d), 1 - (1 - s) * (t - at) / max(d, 1e-4), e)
        e = np.where((t >= at + d) & (t < hold), s, e)
        e[t >= hold] = s * np.exp(-(t[t >= hold] - hold) / max(r, 1e-4) * 3)
        return e

    def lowpass(x, k):
        c = np.cumsum(np.concatenate([np.zeros(1), x]))
        y = (c[k:] - c[:-k]) / k
        pad = len(x) - len(y)
        return np.concatenate([np.full(pad // 2, y[0]), y, np.full(pad - pad // 2, y[-1])])

    CH, PROG = ST["acordes"], ST["prog"]
    NB = int(round(TOTAL / BAR))

    def chord(b):
        if b >= NB - 5:
            return ST["final"][b - (NB - 5)]
        if b < 3:
            return ST["intro"][b]
        return PROG[(b - 3) % 4]

    d0 = starts[1] if len(starts) > 1 else BAR * 2      # bateria desde la segunda parte
    d1 = starts[-1] if len(starts) > 2 else TOTAL       # ... hasta el cierre

    def gain(t):
        return 0.75 if t < d0 else (1.0 if t < d1 else 0.85)

    # Pad (sintesis aditiva, tres voces desafinadas) y brillo agudo.
    HARM = [(h, (1 / h) * np.exp(-(h - 1) / ST["brillo"])) for h in range(1, 13)]
    for b in range(NB):
        t0 = b * BAR
        _, notes = CH[chord(b)]
        last = b == NB - 1
        n = int((BAR + (2.6 if last else 1.0)) * SR)
        t = np.arange(n) / SR
        e = env(n, 0.45, 0.6, 0.82, 1.6 if last else 1.1, BAR + 0.4 if last else BAR - 0.05)
        breath = 1 + 0.06 * np.sin(2 * np.pi * 0.22 * (t + t0))
        for m in notes:
            for cents, pan in ((-7, -0.55), (0, 0.0), (7, 0.55)):
                f = hz(m) * 2 ** (cents / 1200)
                ph = rng.uniform(0, 2 * np.pi, len(HARM))
                sig = sum(amp * np.sin(2 * np.pi * f * h * t + ph[i]) for i, (h, amp) in enumerate(HARM) if f * h < 9000)
                add(sig * e * breath, t0, pan, ST["pad"] * gain(t0), 0.15, pad=True)
        for j, m in enumerate(notes[1:]):
            f = hz(m + 24)
            add((np.sin(2 * np.pi * f * t + j) + 0.25 * np.sin(4 * np.pi * f * t)) * e * breath, t0, (-0.6, 0, 0.6)[j],
                ST["shimmer"] * gain(t0), 0.4, pad=True)

    # Bajo y arpegio (desde el cuarto compas).
    arp = ST["arp"][int(rng.integers(len(ST["arp"])))]
    div = len(arp) // 4
    for b in range(3, NB):
        root, notes = CH[chord(b)]
        f = hz(root)
        if ST["bajo"] == "blancas":
            golpes_bajo = [(h * 2 * BEAT, 2 * BEAT, 0.85 if h else 1.0) for h in (0, 1)]
        elif ST["bajo"] == "redondas":
            golpes_bajo = [(0, 4 * BEAT, 1.0)]
        else:  # corcheas
            golpes_bajo = [(k * BEAT / 2, BEAT / 2, 1.0 if k % 2 == 0 else 0.72) for k in range(8)]
        for off, dur, g in golpes_bajo:
            t0 = b * BAR + off
            n = int(dur * SR)
            t = np.arange(n) / SR
            sig = np.sin(2 * np.pi * f * t) + 0.28 * np.sin(4 * np.pi * f * t) + 0.08 * np.sin(6 * np.pi * f * t)
            add(sig * env(n, 0.012, min(0.35, dur * 0.5), 0.55, 0.12, max(0.02, dur - 0.14)), t0, 0, ST["bajo_g"] * gain(t0) * g)
        step = BEAT / div
        for k, idx in enumerate(arp):
            t0 = b * BAR + k * step
            if t0 >= TOTAL - 3.0:
                break
            n = int(max(0.9, ST["arp_dec"] * 4) * SR)
            t = np.arange(n) / SR
            f = hz((notes[idx] if idx < 4 else notes[0] + 12) + 12)
            sig = (np.sin(2 * np.pi * f * t) + 0.45 * np.sin(4 * np.pi * f * t) + 0.22 * np.sin(6 * np.pi * f * t)
                   + 0.1 * np.sin(8 * np.pi * f * t) * np.exp(-t / 0.08)) * np.exp(-t / ST["arp_dec"]) * np.minimum(1, t / 0.004)
            acc = 1 if k == 0 else (0.8 if k % div == 0 else 0.62)
            add(sig, t0, -0.35 if k % 2 else 0.35, ST["arp_g"] * acc * gain(t0), 0.35)

    # Bateria.
    tk = np.arange(int(0.5 * SR)) / SR
    kick = np.sin(2 * np.pi * np.cumsum(45 + 75 * np.exp(-tk / 0.045)) / SR) * np.exp(-tk / 0.2)
    noise = rng.normal(0, 1, int(0.6 * SR))
    hat = (noise[: int(0.2 * SR)] - lowpass(noise[: int(0.2 * SR)], 6))[: int(0.12 * SR)] * np.exp(-np.arange(int(0.12 * SR)) / SR / 0.028)
    ohat = (noise - lowpass(noise, 5))[: int(0.4 * SR)] * np.exp(-np.arange(int(0.4 * SR)) / SR / 0.11)
    tc = np.arange(int(0.3 * SR)) / SR
    cn = rng.normal(0, 1, len(tc))
    clap = (cn - lowpass(cn, 3)) * np.exp(-tc / 0.07) * 0.4 + np.sin(2 * np.pi * 1150 * tc) * np.exp(-tc / 0.03) * 0.5
    estilo_bat = ST["bateria"]
    b = int(round(d0 / BAR))
    while b * BAR < d1 - 0.01:
        tb0 = b * BAR
        full = tb0 >= d0 + 2 * BAR
        for beat in range(4):
            tb = tb0 + beat * BEAT
            if estilo_bat == "ligera":
                if beat in (0, 2):
                    add(kick, tb, 0, 0.15 * (1 if beat == 0 else 0.85), 0.04)
                if beat in (1, 3) and full:
                    add(clap, tb, 0.1, 0.05, 0.3)
                add(hat, tb + BEAT / 2, 0.25, 0.02, 0.1)
                if tb >= d0 + 4 * BAR:
                    add(hat, tb + BEAT * 0.75, -0.25, 0.008, 0.1)
            elif estilo_bat == "cuatro":
                add(kick, tb, 0, 0.15, 0.03)
                if beat in (1, 3) and full:
                    add(clap, tb, 0.1, 0.045, 0.3)
                for s16 in range(4):
                    add(hat, tb + s16 * BEAT / 4, (0.25, -0.2, 0.25, -0.2)[s16], (0.006, 0.01, 0.016, 0.01)[s16], 0.08)
                if full:
                    add(ohat, tb + BEAT / 2, 0.3, 0.012, 0.15)
            elif estilo_bat == "suave":
                if beat == 0:
                    add(kick, tb, 0, 0.09, 0.05)
                add(hat, tb + BEAT / 2, 0.3, 0.008, 0.2)
            else:  # pop
                if beat in (0, 2):
                    add(kick, tb, 0, 0.15, 0.03)
                if beat == 1:
                    add(kick, tb + BEAT / 2, 0, 0.11, 0.03)
                if beat in (1, 3) and full:
                    add(clap, tb, 0.1, 0.055, 0.3)
                add(hat, tb, -0.2, 0.01, 0.08)
                add(hat, tb + BEAT / 2, 0.25, 0.02, 0.1)
                if beat == 3 and full:
                    add(ohat, tb + BEAT / 2, 0.3, 0.014, 0.15)
        b += 1

    # Barrido + golpe en cada parte, campanas en los golpes de la apertura y destello en cada rotulo.
    tw = np.arange(int(1.4 * SR)) / SR
    wn = rng.normal(0, 1, len(tw))
    whoosh = (lowpass(wn, 24) * 0.8 + (wn - lowpass(wn, 4)) * 0.15) * (tw / 1.4) ** 3 * np.minimum(1, (1.4 - tw) / 0.05)
    ti = np.arange(int(1.6 * SR)) / SR
    impact = np.sin(2 * np.pi * 52 * ti) * np.exp(-ti / 0.45) + lowpass(rng.normal(0, 1, len(ti)), 40) * np.exp(-ti / 0.35) * 0.8
    for k, t in enumerate(starts[1:], 1):
        big = k == 1
        add(whoosh, t - 1.4, 0, 0.08 if big else 0.05, 0.45)
        add(impact, t, 0, 0.14 if big else 0.07, 0.5)

    def bell(f, dur=2.2):
        t = np.arange(int(dur * SR)) / SR
        return np.sin(2 * np.pi * f * t + 1.4 * np.sin(2 * np.pi * 3.5 * f * t) * np.exp(-t / 0.25)) * np.exp(-t / 0.9) * np.minimum(1, t / 0.003)

    notas = ST["campanas"]
    for i, t in enumerate(golpes):
        add(bell(hz(notas[i % len(notas)])), t, -0.4 + (i % 6) * 0.16, 0.07, 0.5)
    for t in pg["momentos"]:
        for j, m in enumerate(notas[-3:]):
            add(bell(hz(m + 12), 1.4), t + j * 0.07, (-0.3, 0, 0.3)[j], 0.03, 0.6)
        add(whoosh[int(0.7 * SR):], t - 0.7, 0, 0.03, 0.4)

    # Reverb, bombeo del pad, mezcla y nivel.
    ti = np.arange(int(2.4 * SR)) / SR
    irs = []
    for _ in range(2):
        ir = lowpass(rng.normal(0, 1, len(ti)), 5) * np.exp(-ti / 0.34)
        ir[: int(0.022 * SR)] = 0
        irs.append(ir / np.sqrt(np.sum(ir ** 2)) * 0.9)

    def conv(x, h, block=1 << 18):
        nfft = 1 << int(np.ceil(np.log2(block + len(h) - 1)))
        H = np.fft.rfft(h, nfft)
        y = np.zeros(len(x) + len(h) - 1)
        for s in range(0, len(x), block):
            seg = x[s:s + block]
            yb = np.fft.irfft(np.fft.rfft(seg, nfft) * H, nfft)[: len(seg) + len(h) - 1]
            y[s:s + len(yb)] += yb
        return y[: len(x)]

    tt = np.arange(N) / SR
    pump = np.ones(N)
    if ST["bombeo"] > 0:
        ph = np.mod(tt - d0, BEAT)
        dip = np.where(ph < 0.01, ph / 0.01, np.exp(-(ph - 0.01) / 0.13))
        on = (tt >= d0) & (tt < d1)
        pump[on] = 1 - ST["bombeo"] * dip[on]
    L += PL * pump
    Rt += PR * pump
    L += conv(VL, irs[0]) * 0.55
    Rt += conv(VR, irs[1]) * 0.55
    mix = np.stack([L, Rt])
    mix -= np.stack([lowpass(c, 4800) for c in mix])
    mix += 1.1 * (mix - np.stack([lowpass(c, 8) for c in mix]))
    mix /= np.max(np.abs(mix)) + 1e-9
    mix = np.tanh(1.15 * mix) / np.tanh(1.15)
    mix *= np.clip((TOTAL - tt) / 1.2, 0, 1) ** 1.5 * np.clip(tt / 0.05, 0, 1)
    mix *= 10 ** (-17 / 20) / (np.sqrt(np.mean(mix ** 2)) + 1e-12)
    peak = np.max(np.abs(mix))
    if peak > 10 ** (-1 / 20):
        mix *= 10 ** (-1 / 20) / peak
    a.salida.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(a.salida), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(mix.T, -1, 1) * 32767).astype("<i2").tobytes())
    print(f"{a.salida.name}: {TOTAL:.1f} s, {NB} compases a {BPM:.0f} ppm, estilo {a.estilo}, tono {tono:+d}, "
          f"{len(golpes)} golpes de apertura, {len(pg['momentos'])} momentos, "
          f"RMS {20 * np.log10(np.sqrt(np.mean(mix ** 2)) + 1e-12):.1f} dBFS")
    for c, t in zip(chaps, starts):
        print(f"  {c['id']:12s} {t:6.1f} s  compas {t / BAR:5.2f}" + ("" if abs(t / BAR - round(t / BAR)) < 0.02 else "  <- fuera del compas"))


if __name__ == "__main__":
    main()
