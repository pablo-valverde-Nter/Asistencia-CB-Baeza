---
name: trailer-video
description: >
  Crea el tráiler, vídeo demo o vídeo promocional de cualquier aplicación o página web (local o por URL) a partir
  de capturas reales, con dirección creativa propia (orden, composición, animaciones y música original) y la marca
  de la empresa (Manual de Marca N; firma Nfq por defecto). Pregunta la URL y qué se quiere mostrar; la duración es
  opcional. Entrega una página web "en directo" con música y capítulos y, si se pide, el MP4 descargable desde la
  propia página. Todo es código (Playwright + HTML/JS + ffmpeg), sin modelos de vídeo. Usar SIEMPRE que se pida un
  tráiler, demo, vídeo promocional o explicativo, recorrido animado o "vídeo como el de..." de una app, web o caso
  de uso, o retocar, acelerar, cambiar la música o la marca, o pasar a vídeo uno hecho con esta skill. NO usar
  para editar vídeos grabados por otros ni para generar vídeo con IA.
---

# Tráiler de una app a partir de capturas reales

El vídeo no se graba de la pantalla: se **dibuja**. Una página HTML calcula cada fotograma como función del
tiempo `t` sobre un escenario de 1920×1080. Las capturas son reales, y lo que se mueve encima (cámara,
cursor, etiquetas, títulos, rótulos) es CSS/JS. Así hay control total del ritmo, el resultado es reproducible
y la misma página es el entregable "en directo" y la fuente del MP4. Tú eres el director: el usuario dice qué
enseñar y tú decides cómo contarlo (orden, estilo, momentos, música), siempre con la marca de la empresa.

## Qué hay en la skill (léelo cuando toque)
- `references/direccion.md`: cómo decidir historia, duración, estilo, momentos y música. **Paso 2.**
- `references/marca.md`: Manual de Marca N resumido (firma, colores, contraste, tipografías). **Antes de componer.**
- `references/composicion.md`: formato de capítulos, rótulos, `ESTILO` y utilidades. **Al componer.**
- `references/lecciones.md`: errores que ya salieron. **Antes de entregar.**
- `assets/plantilla.html` (motor completo con la marca), `assets/recorrido.py` (plantilla de capturas),
  `assets/encargo.md` (ficha para el usuario), `assets/marca/` (la N y los logos con claim).
- `scripts/`: `comprobar.py`, `sesion.py`, `capturas.py`, `construir.py`, `vistazo.py`, `musica.py`,
  `grabar.py`, `version_web.py` (y `navegador.py`, que usan los demás). Se ejecutan desde la skill:
  `python <skill>/scripts/<script>.py`.

## Reglas de seguridad (no negociables)
- Las capturas **solo navegan**: abrir, hacer clic en pestañas, desplegables y diálogos, escribir en campos para
  la foto. **Nunca** enviar formularios, guardar, crear, borrar, aprobar, lanzar procesos ni mandar mensajes.
  Con una URL de producción, el doble de cuidado. Si un estado solo existe tras una acción con efectos, pide al
  usuario un caso ya preparado en ese estado.
- **Nunca pidas ni escribas contraseñas.** Si la app pide iniciar sesión, usa `sesion.py`: el usuario entra él
  mismo en una ventana del navegador. El archivo de sesión es una credencial: queda en la carpeta de trabajo, no
  se incrusta, no se comparte y se borra al terminar.
- No muestres secretos: si una captura enseña tokens, correos personales o datos sensibles, tápalos con un
  `cover` de tipo `wipe` permanente o recorta el plano.
- Trabaja en una carpeta propia, fuera del repo de la app. No hagas commit ni push.

## Proceso

### 0. Entorno
`python <skill>/scripts/comprobar.py` dice qué falta y cómo arreglarlo (Python 3.9+, paquetes, Chrome/Edge o el
Chromium de Playwright, ffmpeg, Google Fonts). Si faltan paquetes, crea un entorno en una ruta corta (en Windows
Playwright se instala mal en rutas largas) y reutilízalo:
```
python -m venv ~/.venv-trailer          # Windows: python -m venv %USERPROFILE%\.venv-trailer
<venv>/bin/python -m pip install -r <skill>/requirements.txt     # Windows: <venv>\Scripts\python
```

### 1. Encargo (pregunta antes de hacer nada)
Pide en **un solo mensaje** lo que falte (con la herramienta de preguntas del agente si la hay; quien lo prefiera
puede rellenar `assets/encargo.md`). No vuelvas a preguntar lo que ya venga en la petición.
1. **URL de la app** (obligatoria): local (`http://localhost:...`) o remota (`https://...`). Si es local y no está
   arrancada pero tienes el repo, ofrécete a levantarla. Comprueba que responde: `comprobar.py --url <URL>`.
2. **Guía de qué mostrar** (obligatoria): pantallas, flujos, mensajes clave y lo que **no** debe salir. Si es
   vaga ("enséñalo todo"), pide concretar o propón tú 3-5 ideas y que elija.
3. **Duración** (opcional): si no la dan, la decides tú (`direccion.md`).
4. **Marca** (opcional): Nfq por defecto. La N sola u otra submarca solo si la piden.
5. **¿También en vídeo MP4 descargable?** Por defecto no: se entrega la página web en directo. Si dicen que sí,
   la página llevará un botón "Descargar vídeo".
6. Público e idioma (opcional; se deducen).
Sin URL y guía no sigas. Si la app pide inicio de sesión:
`python <skill>/scripts/sesion.py --url <URL> --salida <trabajo>/sesion.json` (abre un navegador visible; el
usuario entra y cierra la ventana).

### 2. Dirección creativa (tu "magia")
Lee `references/direccion.md` y **decide tú**: orden de capítulos, duración (si no la dieron), `ESTILO`
(apertura, transición, cierre), el momento de cada capítulo (rótulos, cifras, cámara), ritmo (`SPEED`), acento
y música (estilo y tono). Lo que el usuario pidió explícitamente manda. Escribe `direccion.md` en la carpeta de
trabajo y cuéntaselo al usuario en ≤ 5 líneas, sin esperar aprobación para seguir; si luego quiere otra cosa, se
cambia.

### 3. Capturas
Copia `assets/recorrido.py` a la carpeta de trabajo y escribe un bloque por estado de la app (página nueva por
bloque). Lee el código de la app si lo tienes para encontrar selectores estables (ids, `data-*`).
```
python <skill>/scripts/capturas.py --url <URL> --recorrido recorrido.py --out capturas [--sesion sesion.json]
```
Cada `FALTAN` es un selector que corregir. Abre 2-3 capturas para comprobar que el estado es el correcto.

### 4. Composición
Copia `assets/plantilla.html` como `trailer.html` y edita: `data-tema` y `data-acento` en `<html>`, `ESTILO`,
`BRAND`, `CH` (formato en `references/composicion.md`), `RECAP` y `SPEED`. No toques las variables `--n-*`.
```
python <skill>/scripts/construir.py --composicion trailer.html --capturas capturas [--marca n] [--icono ...] [--logo ...] --salida trailer-en-directo.html
python <skill>/scripts/vistazo.py --html trailer-en-directo.html --salida vistazo.jpg --cada 3
```
Mira `vistazo.jpg` y los errores que imprime (`--t 31 32.5` para un tramo). Repite hasta que cada etiqueta
apunte a su sitio, nada se corte ni tape lo que se explica, la N y la firma salgan completas y los textos estén
en Sora / Instrument Sans.

### 5. Música
```
python <skill>/scripts/musica.py --html trailer-en-directo.html --salida musica.wav --estilo <estilo> --tono <n> --semilla <n>
python <skill>/scripts/construir.py ... --musica musica.wav --salida trailer-en-directo.html
```
Ninguna parte debe quedar "fuera del compás". Si cambias duraciones o `SPEED`, regenera la música.

### 6. Revisión en directo
Entrega `trailer-en-directo.html` (si tu entorno puede publicar páginas, publícala; si no, da la ruta) y que el
usuario la vea: se reproduce con música, volumen, capítulos y pantalla completa. Itera con él.

### 7. Vídeo (solo si lo pidió)
```
python <skill>/scripts/grabar.py --html trailer-en-directo.html --musica musica.wav --salida App_trailer.mp4        # 1080p60
python <skill>/scripts/version_web.py --origen App_trailer.mp4 --salida App_trailer_web.mp4 --mb 19.5
python <skill>/scripts/construir.py ... --musica musica.wav --video App_trailer_web.mp4 --salida trailer-en-directo.html
```
La grabación tarda ≈ 5× la duración: lánzala en segundo plano y avisa al terminar (prueba antes un tramo con
`--desde 20 --hasta 30`). Con `--video`, la página muestra "Descargar vídeo": hasta 20 MB el MP4 va dentro de la
página (descarga siempre); si pesa más, se enlaza junto a ella (`--video-modo`). Para publicarla como artefacto
de Claude, usa `--mb 10` para que la página no pase de 16 MB. 1440p: `grabar.py --dpr 1.3333`.

### Entrega
La página en directo (y el MP4 si se pidió), `musica.wav` y el resumen de la dirección creativa. Borra
`sesion.json` si lo hubo.

## Estilo de marca (siempre)
La plantilla ya lo aplica; no lo rompas al componer. Detalle en `references/marca.md`.
- **Firma**: Nfq con su claim por defecto; `--marca n` (solo la N) u otra submarca si se pide. La N pequeña va en
  cabecera, esquina y etiquetas. Logos oficiales de `assets/marca/`, sin editar ni filtrar; el del cliente, tal cual.
- **Color**: paleta exacta (no toques `--n-*`), un solo primario de acento (`data-acento`), nunca rojo sobre naranja.
- **Tema** claro por defecto; oscuro solo si la app es oscura (y mejor con acento azul).
- **Tipografía**: Sora en títulos y destacados; Instrument Sans en subtítulos y apoyo. Texto blanco solo sobre el
  acento y grande.
- **Capturas** sin filtros ni tintes; solo se desenfocan en las transiciones. La magia no inventa: ni funciones ni
  cifras que no estén en la app o en la guía.
