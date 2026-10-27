# Lecciones aprendidas (errores que ya salieron en tráileres anteriores)

## Composición
- **Nombres de clase que chocan.** El reproductor y el escenario comparten documento: `.bar` (barra de
  progreso) aplastó las barras de un gráfico SVG, y `.ct` descolocó los tiempos de los capítulos. Usa nombres
  propios dentro del escenario (`.bx`, `.cht`...) y busca la clase en todo el archivo antes de crear una.
- **`filter` u `opacity` sobre un elemento con `transform-style: preserve-3d` lo aplana**: el abanico de
  pantallas pegaba un salto al aplicar el desenfoque. Aplica filtro y opacidad al contenedor (el que tiene la
  perspectiva), no al que tiene `preserve-3d`.
- **Etiquetas que se pisan o se salen**: se ven solo en la hoja de contactos. Revisa con `vistazo.py` cada
  capítulo en los segundos en que hay etiquetas, y ajusta `side`, `gap`, `dx` y `at`.
- **Un elemento que no existe en `rects.json`** rompe el capítulo entero (`sin rectangulo: ...`). `vistazo.py`
  imprime el error: corrige el selector en `capturas.py` o el nombre en el capítulo.
- **El clic tiene que ir antes del cambio de captura** que provoca, nunca después.
- **`typepatch` invisible**: la caja del parche necesita `z-index` por encima de la captura actual (que
  lleva 2); sin él la escritura no se veía. Ya está corregido en la plantilla; si copias un motor antiguo,
  revísalo.
- **Degradados SVG con ids repetidos**: si un `<linearGradient>` vive dentro de una capa oculta
  (`display: none`), las demás copias que lo referencian se pintan sin él. Cada copia de la N lleva ids
  propios (`brandMark`); haz lo mismo con cualquier SVG en línea que repitas.
- **Bandas detrás de texto**: un borde duro de banda que cruza una línea de texto se ve como un corte. Con
  texto encima, las bandas se quedan cerca de los bordes (`reach` 0,55) y solo llegan al centro en el final.
- **El barrido de bandas tapa el corte solo ±0,15 s**: por eso con `transicion: "bandas"` el fundido entre partes
  (`XF`) baja a 0,25 s. Si alargas `XF`, el cambio se ve por detrás de las bandas al salir.
- **Rótulos que tapan**: un rótulo es una banda opaca de ~150 px de alto; colócalo (`pos`, `y`) donde no haya
  nada que se esté explicando y que no coincida con un foco en la misma zona.
- **Sora es más ancha que Inter**: un título de 5 palabras ronda los 1.300 px a 92 px. Revisa en
  `vistazo.jpg` que nada se salga de la banda ni de la pantalla.
- **Leer requiere tiempo**: un título de 5 palabras ≈ 2 s; una etiqueta ≈ 2,5-3 s quieta. Si el usuario dice
  que va rápido, baja `SPEED` (0,9) en vez de rehacer tiempos, y regenera la música.

## Captura
- Captura a `device_scale_factor=2` y guarda a 2880×1620: a 1× el texto se ve borroso en cuanto la cámara acerca.
- Mueve el ratón a una esquina antes de cada foto (que no salga ningún hover) y espera ~0,5 s a que terminen
  las transiciones.
- Una página nueva por bloque: así no se arrastran desplegables abiertos ni estados de una captura a otra.
- Calienta la app antes (abrir los casos una vez) para que las capturas no salgan con esqueletos de carga.
- Escribe en los campos para la foto, pero **nunca** pulses enviar, guardar ni confirmar.

## Música
- Tempo, duraciones y velocidad deben casar: cada capítulo, un número entero de compases. Con `SPEED` 0,9 la
  música pasa de 100 a 90 ppm y todo se alarga igual (lo hace `musica.py` leyendo la página).
- Nivel suave (RMS −17 dBFS): la primera versión sonaba fuerte y apagada; la mezcla equilibrada lleva un
  realce leve de agudos y el pad discreto.
- Un filtro paso bajo O(n·k) tarda minutos en 4 min de audio: usa la media móvil con sumas acumuladas (ya está).
- En la musica que haya margen de variablidad adaptado a la aplicación tanto en tonos como en frecuencia.

## Entorno
- En Windows, un venv dentro de una ruta larga (p. ej. una carpeta temporal muy anidada) deja Playwright a medio instalar
  (`No module named 'playwright.sync_api'`): crea el venv en `%USERPROFILE%\.venv-trailer`.

## Grabación y entrega
- La grabación en tiempo real con captura de pantalla da tirones. Por eso se calcula cada fotograma con
  `seek(t)` y se captura por CDP: tarda más, pero sale perfecto a 60 fps.
- x264 con entrada de capturas JPEG puede salir en 4:4:4 (no se reproduce en muchos sitios): fuerza
  `format=yuv420p` y la conversión de color BT.601 → BT.709 (ya está en `grabar.py`).
- 1440p: `--dpr 1.3333` dibuja el escenario a 2560×1440 de verdad (texto nítido), no reescala.
- La página en directo se ve más nítida que cualquier MP4 (se dibuja a la resolución de la pantalla). Es la
  mejor forma de enseñarlo; el MP4 es para compartir o proyectar.
- **Botón "Descargar vídeo" que no descarga**: abierta la página desde el disco (`file://`), Chrome ignora el
  atributo `download` de un enlace a otro archivo y reproduce el MP4 en una pestaña. Por eso, hasta 20 MB el
  vídeo va incrustado en la página (descarga siempre); enlazado solo descarga si la página se sirve por web.
- Para publicar la página como artefacto de Claude: la página por debajo de 16 MB y cada archivo aparte por
  debajo de 15 MB. Con el vídeo incrustado, `version_web.py --mb 10` (la página con música y 20-30 capturas ya
  ocupa 2-12 MB). En otros entornos, entrega los archivos. No publiques nada sin que el usuario lo pida.

## Extra
Añade un pequeño margen de variabilidad que depende de la IA para 
adaptarse de manera correcta a la app que se muestra y añadir ese pequeño toque de
magia e individualidad entre videos, esto apliaca a todos los puntos anteriores.
