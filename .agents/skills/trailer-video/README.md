# trailer-video

Skill para asistentes de IA (Claude y GitHub Copilot) que crea el **tráiler o vídeo demo de cualquier app o
página web** a partir de capturas reales, con la marca de la empresa (Manual de Marca N, firma Nfq por defecto)
y con dirección creativa propia: el asistente decide el orden, la composición, las animaciones y la música.

**Uso interno del grupo**: incluye logos del manual de marca interno. No la compartas fuera.

## Qué hace
1. Te pregunta la **URL** de la app (local o remota) y una **guía de qué quieres enseñar**. La duración, la marca
   y el público son opcionales. También te pregunta si quieres el vídeo en MP4.
2. Recorre la app con un navegador **sin tocar nada** (solo navega) y toma capturas en alta resolución.
3. Monta el tráiler como una página web animada: cámara, cursor, etiquetas, títulos, rótulos con cifras y música
   original sintetizada al compás.
4. Te entrega la **página "en directo"** (un HTML con reproductor, capítulos y pantalla completa). Si pediste
   vídeo, también el **MP4 a 60 fps**, descargable desde un botón de la propia página.

Puedes pedírselo así: *"Hazme un tráiler de 1 minuto de https://mi-app.empresa.com para presentarla al comité:
el panel de inicio, el alta de solicitudes y el informe mensual"*. O rellena [assets/encargo.md](assets/encargo.md)
y pásaselo.

## Instalación
La misma carpeta `trailer-video/` sirve para todos. Copia la carpeta entera (no solo `SKILL.md`):

| Asistente | Dónde va |
|---|---|
| **Claude Code** (terminal, VS Code, escritorio) | Para ti: `~/.claude/skills/trailer-video/`. Para un repo: `<repo>/.claude/skills/trailer-video/` |
| **Claude** (claude.ai o la app de escritorio) | Ajustes → Capacidades → Skills → subir el `.zip` de la skill. Corre en el entorno de Claude: la URL tiene que ser accesible desde internet |
| **GitHub Copilot** (modo agente en VS Code o Copilot CLI) | Para ti: `~/.copilot/skills/trailer-video/`. Para un repo: `<repo>/.github/skills/trailer-video/` |

## Requisitos (en el equipo donde se ejecuta)
- Python 3.9 o superior y los paquetes de [requirements.txt](requirements.txt):
  `python -m pip install -r requirements.txt` (mejor en un entorno virtual en una ruta corta, p. ej. `~/.venv-trailer`).
- Google Chrome o Microsoft Edge. Si no tienes ninguno: `python -m playwright install chromium`.
- Internet para las fuentes de marca (Sora e Instrument Sans, de Google Fonts).

Compruébalo todo con:
```
python scripts/comprobar.py --url <URL de tu app>
```

## Apps con inicio de sesión
El asistente nunca te pedirá la contraseña. Ejecuta (o deja que ejecute)
`python scripts/sesion.py --url <URL> --salida sesion.json`: se abre un navegador, entras tú como siempre y
cierras la ventana. Ese archivo es una credencial: no lo compartas y bórralo al terminar.

## Qué hay dentro
```
SKILL.md                 instrucciones para el asistente
README.md                esta guía (para personas)
requirements.txt         paquetes de Python
assets/plantilla.html    el motor del tráiler (HTML/JS) con la marca aplicada
assets/recorrido.py      plantilla del recorrido de capturas
assets/encargo.md        ficha para pedir un tráiler
assets/marca/            la N y los logos oficiales con claim
references/              marca, dirección creativa, formato de composición y lecciones aprendidas
scripts/                 comprobar, sesion, capturas, construir, vistazo, musica, grabar, version_web
```
