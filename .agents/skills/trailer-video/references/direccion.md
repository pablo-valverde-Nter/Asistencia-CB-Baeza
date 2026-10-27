# Dirección creativa: la "magia"

El usuario dice **qué** enseñar; tú decides **cómo** contarlo. Un buen tráiler no es un recorrido por el menú: es
una historia corta con un gancho, un ritmo y un par de momentos que se recuerdan. Decide con criterio, anótalo en
`direccion.md` y cuéntaselo al usuario en ≤ 5 líneas; no pidas permiso para cada elección. Lo que el usuario haya
pedido explícitamente (orden, duración, marca, estilo) manda siempre.

## 1. La historia (orden de los capítulos)
- **Arco**: gancho → valor → momento estrella → cierre.
  - **Gancho**: la apertura dice el beneficio en una frase (`BRAND.claim`) y el primer capítulo enseña lo más
    vistoso o lo que más se entiende de un vistazo. Los primeros 15 s deciden si alguien sigue mirando.
  - **Valor**: agrupa por lo que el usuario **consigue**, no por pestañas ("encuentra cualquier pedido", no
    "la pestaña Búsqueda").
  - **Momento estrella**: lo más impactante va en el penúltimo capítulo, no al principio ni al final.
  - **Cierre**: algo que remate (un informe, un resumen, el resultado) y luego el mosaico y la firma.
- Si la guía describe un flujo que depende de su orden (crear → revisar → aprobar), respétalo. Si son funciones
  independientes, ordénalas por impacto.
- Una idea por capítulo. Título ≤ 5 palabras con una palabra destacada (`hot`); subtítulo = el beneficio en una
  frase.

## 2. La duración (si no la dieron)
- Cuenta las ideas de la guía: cada capítulo dura 12-17 s (5-7 compases de 2,4 s); apertura 9,6 s; cierre 12 s
  (`completo`) o 9,6 s (`directo`).
- 2-3 ideas → 45-60 s · 4-6 ideas → 75-120 s · más → agrupa, o propón dos vídeos. Tope razonable: 4 min.
- Si te dan una duración, ajústala con el número de capítulos y sus compases, y afina con `SPEED` (0,9-1,1):
  duración real = (9,6 + Σ capítulos + cierre) / `SPEED`.

## 3. El estilo
Puntos de partida (mézclalos y varía; dos tráileres seguidos no deberían salir iguales):

| Para... | apertura | transición | cierre | música | acento | SPEED |
|---|---|---|---|---|---|---|
| Dirección, comité, cliente | `palabras` | `bandas` | `completo` | `corporativo` | azul | 0,95-1 |
| Producto técnico, datos, IA | `pantallas` | `bandas` | `completo` | `tech` | azul | 1-1,05 |
| Lanzamiento, evento, marca | `marca` | `bandas` | `directo` | `energico` | frambuesa o naranja | 1,05-1,1 |
| Formación, tutorial | `palabras` | `fundido` | `directo` | `calma` | azul | 0,9 |

- `pantallas` necesita al menos 3 capturas que se distingan bien entre sí (elígelas en `ESTILO.pantallas`).
- `marca` da protagonismo a la N: úsala cuando el vídeo también presenta a la empresa.
- **Acento**: azul por defecto; naranja para algo comercial o con energía; frambuesa para eventos y personas.
  Tema oscuro solo si la app es oscura (y entonces azul).
- **Música**: el estilo según el tono; `--tono` entre −3 y +3 para que no suene siempre igual y una `--semilla`
  distinta en cada tráiler.

## 4. Los momentos (lo que hace que tenga magia)
Cada capítulo necesita **un** momento que se recuerde. Herramientas:
- **Rótulo** (`rotulos`): el beneficio en grande sobre una banda, a un lado. Con **cifra** cuando hay un número
  real (un KPI de la captura, un dato que dio el usuario): "48 pedidos al día", "3× más rápido". **No inventes
  cifras**: si no hay número, rótulo sin cifra.
- **La acción en vivo**: un diálogo que nace del botón (`dialog`), un desplegable (`drop`), escritura letra a
  letra (`covers` y `typepatch`). Ver hacer algo engancha más que ver el resultado.
- **Foco + etiquetas encadenadas**: `spot` sobre lo esencial y 2-3 `calls` que se suceden cada 0,4-0,6 s.
- **Cámara con intención**: un acercamiento fuerte (zoom 1,4-1,6) al detalle clave y luego aire (1,1-1,2), que la movilidad de
  la camara sea suave.
- **Variedad**: alterna la dirección de la cámara entre capítulos, no pongas tres etiquetas seguidas del mismo
  lado y alterna los rótulos entre `izq` y `der`.
- **Ritmo**: haz caer clics, cambios de captura y rótulos en múltiplos de 0,6 s desde el inicio del capítulo: así
  coinciden con los golpes de la música (los rótulos llevan además un destello sonoro).

## 5. El tratamiento (`direccion.md` en la carpeta de trabajo)
```
# Tratamiento: <App>
Público: ... · Duración: ... (pedida | decidida) · Firma: Nfq · Tema y acento: claro, azul
Estilo: apertura ..., transición ..., cierre ... · Música: <estilo>, tono <n>, semilla <n> · SPEED <x>
Historia:
  1. <título> — <qué se ve> — momento: <rótulo / acción / cámara>
  2. ...
Por qué: <2-3 frases: qué gancho, qué momento estrella y por qué este estilo>
```
Al usuario, algo así: "He montado la historia en 4 capítulos (…), con apertura de pantallas en abanico, música
tech y un rótulo con los 48 pedidos diarios como momento estrella. Si quieres otro orden, música o estilo,
dímelo."

## 6. Magia y sus limites
Añade un pequeño margen de variabilidad que depende de la IA para 
adaptarse de manera correcta a la app que se muestra y añadir ese pequeño toque de
magia e individualidad entre videos, esto aplica a todos los puntos anteriores.

- No inventa: ni funciones, ni datos, ni claims que no estén en la app o en la guía.
- La marca manda (`marca.md`): la magia está en la historia, el ritmo y los momentos, no en salirse de la paleta.
- Se entiende antes que se luce: si un rótulo o una etiqueta tapa lo que se está explicando, muévelo.
