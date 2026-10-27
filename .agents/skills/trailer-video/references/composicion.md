# Formato de la composición (`assets/plantilla.html`)

Todo es función de `t`. `render(t)` recorre `SEGS`, enciende las capas de la parte que toca (con un fundido
cruzado de `XF = 0.6 s`) y llama a su `render(lt, S)` con el tiempo local `lt`. Nada usa `setTimeout` ni
animaciones CSS: así se puede saltar a cualquier segundo y grabar fotograma a fotograma.

## Marca y tema
- En `<html>`: `data-tema="claro"` (por defecto) u `"oscuro"`, y `data-acento="azul"` (por defecto),
  `"naranja"` o `"frambuesa"`. Es lo único de estilo que se elige; las variables `--n-*` son la paleta del
  manual y no se tocan (ver `marca.md`). Para colores nuevos en un capítulo, usa las variables: `var(--accent)`,
  `var(--text)`, `var(--muted)`, `var(--card)`...
- Huecos que rellena `construir.py`: `IMGS`, `RECTS`, `MARCA` (la N en línea y la firma con claim para cada
  tema: Nfq por defecto, ninguna con `--marca n`), `ICONO` (icono o mascota de la app), `LOGO` (logo del
  cliente), `MUSIC` y `VIDEO` (el MP4 del botón "Descargar vídeo", solo si el usuario lo pidió).

## Dirección creativa: `ESTILO`
Arriba del script, la decide la IA (criterio en `direccion.md`):
```js
const ESTILO = { apertura: "pantallas", transicion: "bandas", cierre: "completo", pantallas: ["lista", "nuevo", "informe"] };
```
- `apertura`: `"palabras"` (palabras una por golpe, pasos numerados y la frase) · `"pantallas"` (hasta 5 capturas
  que entran en abanico 3D, una por golpe, y se apartan para la frase; se eligen en `pantallas` o salen del
  `RECAP`) · `"marca"` (bandas plenas, la N se monta pieza a pieza en el centro y viaja a la esquina; luego la
  frase). Las tres duran 9,6 s, en esta parte se habre un pequeño margen de adaptación que decide la IA para variar la forma
  en la que se presenta.
- `transicion`: `"bandas"` (las 5 bandas del acento barren la pantalla y tapan el corte; `XF` pasa a 0,25 s) ·
  `"fundido"` (fundido cruzado con desenfoque, `XF` 0,6 s), añade un pequeño margen de variabilidad que depende de la IA para 
  adaptarse de manera correcta a la app que se muestra.
- `cierre`: `"completo"` (mosaico → app → firma, 12 s) · `"directo"` (app → firma, 9,6 s). La firma cae siempre
  en el último compás, añade un pequeño margen de variabilidad que depende de la IA para 
  adaptarse de manera correcta a la app que se muestra.
- Dónde sale la marca: la N en la cabecera del reproductor, en la esquina de la apertura y en la etiqueta de
  cada capítulo (allí la sustituye el icono de la app si se pasa `--icono`). En el cierre, la N se monta por
  piezas sobre las bandas o, con submarca, entra su logo con claim.

## Coordenadas y referencias
- Escenario fijo de 1920×1080 px. Las capturas se dibujan a ese tamaño (son 2880×1620 para que la cámara
  pueda acercar hasta ~1,5-2× sin perder nitidez).
- `"captura.elemento"` → el rectángulo `[x, y, w, h]` que guardó `capturas.py` en `rects.json`.
- Un objetivo de cámara o cursor puede ser `"captura.elemento"` (su centro), `[x, y]`, o
  `["captura.elemento", fx, fy]` (un punto relativo dentro del rectángulo: `0.3, 0.5` = a la izquierda, centrado).
- Un `ref` de foco o etiqueta puede ser una lista de referencias (el rectángulo que las contiene).

## Un capítulo (`CH`)
```js
{ id: "alta", n: "02", title: "Da de alta un pedido", hot: ["pedido"], tag: "Alta de pedidos",
  sub: "Rellenas el formulario y la app valida cada campo al momento.", dur: 14.4,
  stills: [[0, "lista", "cut"], [4.15, "nuevo", "dialog", 0.55, { from: "lista.nuevo", dialog: "nuevo.dialog" }]],
  cam: [[0, [960, 560], 1.06], [3.0, "lista.nuevo", 1.2], [4.8, "nuevo.dialog", 1.15], [6.6, "nuevo.cliente", 1.45],
        [10.2, "nuevo.cliente", 1.45], [12.0, "nuevo.guardar", 1.3], [15.0, "nuevo.guardar", 1.25]],
  cursor: { start: [1200, 700], show: [2.8, 13.4], moves: [[3.2, 4.0, "lista.nuevo"], [5.6, 6.4, ["nuevo.cliente", 0.2, 0.5]]],
            clicks: [4.0, 6.5] },
  covers: [{ still: "nuevo", kind: "type", rect: [742, 431, 380, 22], text: [748, 154.2, 14], t0: 6.9, t1: 8.3, focus: 6.5,
             color: "rgb(255, 255, 255)", caret: "rgb(31, 41, 55)" }],
  spots: [{ ref: "nuevo.guardar", pad: 8, r: 10, t0: 11.4, t1: 13.4 }],
  calls: [{ ref: "nuevo.cliente", text: "Autocompleta con tus clientes", icon: "user", side: "right", gap: 70, t0: 8.6, t1: 13.0 }] }
```
- `n`, `title`, `hot` (palabras del título que van en negrita), `sub` (solo en la presentación del
  capítulo), `tag` (texto de la etiqueta fija abajo a la izquierda, con la N o el icono de la app). `dur` en
  segundos de composición (múltiplo de 2,4 s).
- **Patrón temporal fijo** de cada capítulo: 0-2,2 s título grande sobre una banda del acento, con la app
  difuminada detrás; 2,2-3 s el título se encoge hasta la etiqueta; desde 2,8 s la app nítida con cámara,
  cursor y etiquetas; los últimos 0,7 s se difumina para el siguiente. Por tanto la acción útil va de 2,8 s a
  `dur - 0,8`.
- El título va en blanco sobre la banda: ≤ 5 palabras, que quepa en una línea (Sora es ancha: ~25 caracteres
  a 92 px). El subtítulo, una frase.

### `stills`: qué captura se ve y cómo se pasa a la siguiente
`[t, captura, modo, duración, opciones]`
- `cut` (solo la primera) · `fade` (fundido) ·
- `dialog` `{ from: "a.boton", dialog: "b.dialog" }`: la ventana crece desde el botón y el fondo se
  oscurece; luego se ve la captura completa con el diálogo.
- `drop` `{ rect: "b.menu" }`: un desplegable que baja. `slide` `{ rect: "b.panel" }`: un panel lateral que entra.
- `unroll` `{ shift, y0, y1 }`: algo que se abre empujando el contenido hacia abajo (la nueva captura se
  revela de `y0` a `y1` mientras la anterior sube `shift` px).

### `cam`: cámara
`[t, objetivo, zoom]`, interpolada con spline de Hermite (suave, sin paradas bruscas). El encuadre nunca sale
de la captura. Zoom 1,0 = captura entera; 1,1-1,2 para recorrer; 1,3-1,6 para un detalle; > 2 solo un
instante. Pon dos claves seguidas en el mismo objetivo para que la cámara repose ahí (≈ 3-4 s para leer una
etiqueta). Añade una clave final un poco después de `dur` para que siga moviéndose durante el fundido.

### `cursor`
`start`, `show: [desde, hasta]`, `moves: [[t0, t1, objetivo], ...]` (en arco, con aceleración suave) y
`clicks: [t, ...]` (el cursor se encoge y sale una onda del color de acento). Un clic va justo al terminar el
movimiento y **antes** del cambio de captura que provoca (p. ej. clic en 4,0 y `dialog` en 4,15).

### `spots`: foco
`{ ref, pad, r, t0, t1 }`: oscurece el resto y bordea el elemento con el acento. `r: 999` para píldoras.
Uno a la vez.

### `calls`: etiquetas con línea
`{ ref, text, icon, side, gap, dx, at, t0, t1 }`: un punto en el borde del elemento, una curva y una píldora
con icono. `side` = dónde va la píldora; `gap` = distancia; `at` = posición del punto a lo largo del borde
(0-1); `dx` = desplazamiento lateral (para `top`/`bottom`). Iconos: check coin branch clock doc layers flow
chart shield spark send list search alert help chat bolt rocket user. Ritmo: se encadenan cada 0,4-0,6 s y
duran ≥ 2,5 s. Texto ≤ 8 palabras. Que no tapen lo que señalan ni se pisen entre ellas (revisa con `vistazo.py`).

### `rotulos`: el momento del capítulo
`{ t0, t1, text, sub, pos, y, cifra: { de, a, dec, prefijo, sufijo } }`: un titular en blanco sobre una banda
del acento que sale de un lado (`pos`: `"izq"` o `"der"`; `y` = parte de arriba, 720 por defecto). Con `cifra`,
un número que cuenta de `de` (0) hasta `a` (formato español: `dec` decimales, `prefijo`/`sufijo` p. ej. `"×"`,
`" %"`, `" €"`). `text` ≤ 4 palabras, `sub` una frase corta. Dura ≥ 3 s; como mucho uno por capítulo, en la
zona que no tape lo que se explica. Solo cifras reales (de la app o del usuario). La música pone un destello en
cada `t0`; haz que caiga en un múltiplo de 0,6 s desde el inicio del capítulo.
```js
rotulos: [{ t0: 4.8, t1: 8.2, text: "pedidos al día", sub: "sin abrir una hoja de cálculo", pos: "der", cifra: { a: 48 } }]
```

### `covers` y `typepatch`: escritura y zonas que aparecen
- `{ still, kind: "type", rect, text: [x0, ancho, n], t0, t1, focus, color, caret }`: tapa el texto escrito
  con el color del campo y lo va descubriendo letra a letra con un caret. `rect` = la zona del texto en la
  captura (y = parte superior del texto, alto ≈ tamaño de letra + 6). `x0` = inicio del texto, `ancho` y `n`
  salen de las métricas del campo (`rects.json` → `m.campo.w` y `.n`; `x0 = r[0] + pl`). `color` =
  `m.campo.bg`; `caret` (opcional) = `m.campo.col`, el color del texto de la app.
- `{ still, kind: "wipe", rect, t0, d, color }`: una zona tapada que se revela (un aviso que aparece, un
  bloque que se rellena).
- `typepatch`: igual que `type`, pero sobre una captura que luego cambia (p. ej. escribir en un buscador antes
  de que aparezcan los resultados); `until` = cuándo deja de verse.

## Partes que no son capítulos
- **Apertura** (`INTROS[ESTILO.apertura]`, 9,6 s): ver `ESTILO`. Cada estilo declara sus `golpes` (segundos en
  que cae algo: palabras, tarjetas o piezas de la N, cada 0,6 s desde 0,6 s); la música pone una campana en
  cada uno. Textos: `BRAND.words`, `BRAND.claim`, `BRAND.sub`.
- **Cierre** (`buildOutro/renderOutro`): mosaico de capturas `RECAP` (hasta 8, solo en `completo`) → la app
  (icono, nombre `BRAND.word`, `BRAND.closing` y logo del cliente) → en el último compás las bandas se llenan
  y entra la firma (Nfq con claim por defecto, o la N montándose por piezas) → fundido al color de fondo.
- Se pueden añadir estilos nuevos a `INTROS` con cualquier animación, siempre que sean funciones puras de `t`,
  declaren sus `golpes` y respeten la marca.
  Utilidades: `makeBg(root)` → `bg(t, k, t0, reach)` (bandas; `k` = intensidad: 0,2 detrás de texto, 1
  plenas; `reach` = cuánto entran hacia el centro: 0,55 con texto encima, 1 completas),
  `brandMark(padre, clase)` → `{ el, parts }` (una copia de la N) y `nReveal(parts, t, t0)` (la monta por
  piezas), `iconoEl` (icono de la app), `rise`, `riseWords`, `riseNoBlur`, `E` (curvas `out`, `out5`, `in3`,
  `io`, `spring`), `P(t, t0, d)` (progreso 0-1), `lerp`, `clamp`. A los logos no se les aplica `filter`: entran
  con `riseNoBlur` o `nReveal`.

## Línea de tiempo y velocidad
`SEGS` define el orden y la duración. `SPEED < 1` ralentiza todo por igual (0,9 = un 10 % más pausado: da
más tiempo a leer sin tocar los tiempos de cada capítulo). La música lee `SPEED` de la página.

## Contrato para grabar (`window.__proto`)
`render()` (modo grabación: escenario fijo a 1920×1080 sin controles), `ready` (fuentes de marca e imágenes
cargadas), `duration()`, `speed()`, `seek(t)`, `chapters()` (id, n, título, segundo de inicio), `golpes()`
(campanas de la apertura), `momentos()` (inicio de cada rótulo) y `estilo()` (lo elegido: `ESTILO`, tema,
acento, firma, vídeo). No lo rompas: lo usan `grabar.py`, `musica.py` y `vistazo.py`.

## Extra
Añade un pequeño margen de variabilidad que depende de la IA para 
adaptarse de manera correcta a la app que se muestra y añadir ese pequeño toque de
magia e individualidad entre videos, esto apliaca a todos los puntos anteriores.
