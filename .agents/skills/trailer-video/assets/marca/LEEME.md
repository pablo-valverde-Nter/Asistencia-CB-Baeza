# Logos de marca

Logos oficiales del Manual de Marca N. Se usan tal cual: no se editan, no se recolorean ni se les aplican
filtros. `scripts/construir.py` los incrusta en la página del tráiler.

| Archivo | Qué es | Dónde sale |
|---|---|---|
| `n.svg` | La N, signo común del grupo. Extraída del SVG oficial de Nfq: mismos trazados y degradados, sin el texto. Sus tres piezas llevan `data-parte="1|2|3"` (pierna izquierda, diagonal y pierna derecha) para animarlas por separado. | Siempre en pequeño: cabecera, esquina de la apertura y etiqueta de cada capítulo. En el cierre, solo con `--marca n`. |
| `nfq-claim-negro.svg` | Nfq con su claim ("Beyond consulting") para fondo claro. | Firma del cierre **por defecto** (tema claro). |
| `nfq-claim-blanco.svg` | Lo mismo para fondo oscuro. | Firma del cierre **por defecto** (tema oscuro). |

## Añadir otra submarca (NWorld, Nforce, Nter)
Descarga sus logos del Drive de marca ("Descargar logotipos" en el manual) y copia las versiones **con claim**
en SVG con estos nombres:

```
<marca>-claim-negro.svg    # para fondo claro (texto en Black)
<marca>-claim-blanco.svg   # para fondo oscuro (texto en blanco)
```

Por ejemplo, `nter-claim-negro.svg` y `nter-claim-blanco.svg`. Después ya se puede usar `--marca nter`.
Antes de copiarlos, comprueba que el SVG no lleve `<script>`, manejadores `on...=` ni enlaces externos.
