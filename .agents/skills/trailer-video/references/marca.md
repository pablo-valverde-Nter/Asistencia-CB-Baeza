# Estilo de marca (Manual de Marca N)

Resumen del manual interno "(ES) Manual de Marca N" aplicado a los tráileres. La plantilla ya lo cumple: aquí
está qué se puede elegir, qué no se toca y por qué. Léelo antes de componer.

## Quién firma
- **En esta skill, la firma por defecto es Nfq** con su claim (`--marca nfq`, el valor por defecto de
  `construir.py`). Es una decisión de la empresa para los tráileres; el manual, en general, propone la N.
- **La N** es el signo común de todas las marcas del grupo. Sale siempre en pequeño (cabecera, esquina de la
  apertura y etiqueta de cada capítulo) y es la firma completa con `--marca n`, si el usuario lo pide.
- **Otra submarca**, solo si el usuario la pide y hay un motivo estratégico:

| Marca | Claim (va siempre con el logo completo) | Cuándo usarla |
|---|---|---|
| nfq | BEYOND CONSULTING | Especialización: banca, seguros y real estate |
| nter | DISRUPTING TECH | Entornos tecnológicos; vínculo local con Jaén |
| nforce | FUEL YOUR GROWTH | Recruiting |
| nworld | NEXTGEN CONSULTING SERVICES | Paraguas del grupo y proyectos estratégicos; vínculo local con Zaragoza |

- Si se usa el logo completo, siempre con su claim. No añadir ni quitar elementos, no recolorear, no deformar
  y no aplicar filtros ni efectos. Sobre fondo oscuro se usa la versión blanca oficial; nunca se invierte un
  logo con `filter`.
- Los logos están en `assets/marca/` (ver su `LEEME.md`). Hoy solo hay N y Nfq. Si piden otra submarca y no
  está, pide al usuario sus SVG con claim y no la imites.
- El logo de un **cliente** o de la app (`--logo`) va en el cierre, tal como lo entregan y sin filtros. No se
  mezcla con la N ni se le aplica la paleta.

## Color
Paleta exacta: no se alteran los HEX ni se crean variaciones.

| Primarios | HEX | Neutros | HEX |
|---|---|---|---|
| Siena orange | `#EC683E` | Black | `#100D25` |
| Raspberry red | `#D13B5F` | Grey 700 | `#5D6066` |
| Crayola blue | `#217BEE` | Grey 500 | `#82858D` |
| | | Grey 300 | `#BFBFBF` |
| | | Grey 200 | `#E1E1E1` |
| | | Grey 100 | `#F3F3F3` |

- **Errata del manual:** la guía rápida pone Siena orange `#E2AC33`, pero la página de Color y los SVG
  oficiales usan `#EC683E`. Usa `#EC683E`.
- **Un solo primario como acento** en cada tráiler: `data-acento="azul"` (por defecto), `"naranja"` o
  `"frambuesa"`. Los tres colores juntos solo aparecen dentro de la N.
- **Los neutros son la base** de fondos y textos, con los grises para marcar jerarquía. No sustituyen al
  acento en lo importante.
- **Usa el acento de forma selectiva**: número de capítulo, etiquetas con línea, foco, clic, barra de
  capítulos y bandas. No rellenes con él.
- **No abuses de los tonos muy oscuros**: el tema es claro por defecto. Usa `data-tema="oscuro"` (fondo
  Black) solo si la app es oscura, y entonces con acento azul: el naranja y el frambuesa, al degradarse
  sobre el Black, dejan bandas de tono marrón.

### Contraste (WCAG, ya calculado)
| Combinación | Contraste | Uso permitido |
|---|---|---|
| Black sobre blanco / Grey 100 | 19,0 / 17,1 : 1 | Cualquier texto |
| Grey 700 sobre blanco / Grey 100 | 6,3 / 5,7 : 1 | Texto secundario |
| Grey 500 sobre blanco | 3,7 : 1 | Solo texto grande o decorativo |
| Blanco sobre azul | 4,1 : 1 | Texto ≥ 24 px, o ≥ 19 px en negrita |
| Blanco sobre frambuesa | 4,7 : 1 | Cualquier texto |
| Blanco sobre naranja | 3,2 : 1 | Solo texto ≥ 24 px, o ≥ 19 px en negrita |
| Acento sobre blanco | 3,2-4,7 : 1 | Solo texto grande (números, títulos) |
| Acento sobre Black | 4,1-6,0 : 1 | Solo texto grande |
| Frambuesa sobre naranja | 1,5 : 1 | **Nunca** (el manual lo prohíbe expresamente) |

Por eso las etiquetas pequeñas van en Black (o blanco en tema oscuro) sobre tarjeta, y el blanco sobre el
acento solo se usa en el título de capítulo y en los iconos.

## Tipografía
- **Sora** (primaria): títulos, encabezados y textos destacados. En la plantilla: títulos de capítulo,
  palabras de la apertura, frase principal, números, etiqueta del capítulo y nombre de la app.
- **Instrument Sans** (secundaria): textos largos, subtítulos y contenido de apoyo. En la plantilla:
  subtítulos, etiquetas con línea, mosaico del cierre y reproductor.
- Las dos se cargan de Google Fonts. Los archivos oficiales están en el Drive de marca ("Descargar
  tipografías"). Sin internet, la página usaría la fuente del sistema; compruébalo en `vistazo.jpg`.
- Las palabras destacadas (`hot`, `<b>`) van en negrita y en el color de acento. Dentro de la banda del
  título, en blanco y negrita. Sin degradados ni brillos en el texto.

## Lenguaje gráfico
- **Bandas**: rectángulos horizontales del acento que se degradan a transparente, en filas de igual alto
  y con largos distintos (portada y última página del manual). En la plantilla: `makeBg()` dibuja el fondo
  de la apertura y el cierre, cada título de capítulo entra sobre una banda y el cierre termina como la
  última página del manual (bandas plenas y la N centrada).
- **Composición limpia y clara**: mucho blanco, tarjetas planas con borde Grey 200 y sombra suave, la N en
  una esquina. Sin brillos de neón ni efectos recargados.
- **Fotografía y capturas**: estilo claro, natural y profesional; sin filtros, tintes ni efectos; nada
  pixelado ni con marcas de agua. Las capturas se toman a 2× (ver `lecciones.md`) y solo se desenfocan en
  las transiciones. Si salen datos sensibles, se tapan (reglas de seguridad de `SKILL.md`).

## Cómo lo aplica la plantilla
| Pieza | Regla |
|---|---|
| `<html data-tema data-acento>` | Lo único que se elige: tema claro/oscuro y uno de los tres primarios. |
| `:root` (`--n-*`) | Paleta del manual. No se cambia. El resto de variables derivan de ella. |
| `/*MARCA*/` | `construir.py` mete la N (`n.svg`) y el logo con claim de la firma (Nfq por defecto; ninguno con `--marca n`). |
| Cabecera, esquina de la apertura y etiqueta | La N (o el icono de la app en la etiqueta, si se pasa `--icono`). |
| Cierre | (Mosaico →) producto (icono, nombre, frase y logo del cliente) → en el último compás, bandas plenas y la firma con claim, o la N montándose por piezas con `--marca n`. |
| Etiquetas, foco, clic y barra | Acento + tarjetas neutras; sin neón. |

## Cambiar de marca
Toda la marca vive en tres sitios: las variables `--n-*` y las fuentes de `assets/plantilla.html`, los logos
de `assets/marca/` y este archivo. Si cambia el manual, se actualizan esos tres.
