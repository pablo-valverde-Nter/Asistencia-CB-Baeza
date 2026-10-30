# Modelo de Datos — CB Baeza Asistencia

Supabase PostgreSQL es la base de datos operativa. Las tablas y columnas conservan los nombres
del esquema lógico; consulta `supabase/schema.sql` para el DDL.
Los IDs se generan con `Utilities.getUuid()`. Fechas como `YYYY-MM-DD`. Horas como `HH:MM`.

---

## Tablas y esquemas

### `Temporadas`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `ID` | String (UUID) | Identificador único |
| `Nombre` | String | Ej. `2025-2026` |
| `FechaInicio` | String (YYYY-MM-DD) | Inicio de la temporada |
| `FechaFin` | String (YYYY-MM-DD) | Fin de la temporada |
| `Activa` | Boolean | Solo una temporada activa a la vez |

**Reglas:** Solo puede haber un registro con `Activa = true` en cada momento.

---

### `Equipos`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `ID` | String (UUID) | Identificador único |
| `Nombre` | String | Ej. `Infantil Masculino A` |
| `Categoria` | String | `baybasket` / `pre-minibasket` / `minibasket` / `infantil` / `cadete` / `junior` / `senior` |
| `Modalidad` | String | `Masculino` / `Femenino` / `Mixto` |
| `ID_Temporada` | String (UUID) | FK → `Temporadas.ID` |

---

### `Horarios`
Un equipo puede tener varios registros (uno por día de entrenamiento semanal).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `ID` | String (UUID) | Identificador único |
| `ID_Equipo` | String (UUID) | FK → `Equipos.ID` |
| `DiaSemana` | Number (1-7) | 1=Lunes, 2=Martes, ..., 7=Domingo |
| `HoraInicio` | String (HH:MM) | Hora de inicio del entrenamiento |
| `HoraFin` | String (HH:MM) | Hora de fin del entrenamiento |

**Ejemplo:** Un equipo que entrena lunes y miércoles tendrá 2 filas en esta tabla.

---

### `Jugadores`
Registro global de jugadores del club, independiente de equipos o temporadas.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `ID` | String (UUID) | Identificador único |
| `Nombre` | String | Nombre del jugador |
| `Apellidos` | String | Apellidos del jugador |
| `FechaNac` | String (YYYY-MM-DD) | Fecha de nacimiento |
| `Telefono` | String | Teléfono de contacto (o de los padres en menores) |
| `Email` | String | Email de contacto |
| `FotoURL` | String | Foto anterior (URL), avatar `avatar:<slug>` o JPEG `data:image/jpeg;base64,...` (máximo 16000 caracteres); vacío elimina la foto |
| `Dorsal` | Number | Número de camiseta. Único entre los jugadores activos de cada equipo (validado en la app al cambiarlo o al asignar a un equipo; sin restricción en BD) |
| `BienvenidaVista` | Timestamp (nullable) | Cuándo la familia terminó, omitió o cerró el asistente de bienvenida. `NULL` = se muestra en la próxima entrada como jugador. Solo lo escribe `marcarBienvenidaVista` (hora del servidor); aplicar `supabase/perfil.sql` en instalaciones existentes |

---

### `Jugadores_Equipos`
Relación jugador ↔ equipo. Un jugador puede estar en varios equipos con distinto tipo.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `ID` | String (UUID) | Identificador único |
| `ID_Jugador` | String (UUID) | FK → `Jugadores.ID` |
| `ID_Equipo` | String (UUID) | FK → `Equipos.ID` |
| `Tipo` | String | `Principal` o `Secundario` |
| `Activo` | Boolean | Para dar de baja sin borrar el historial |
| `FechaAlta` | String (YYYY-MM-DD) | Alta en el equipo; `null` en relaciones anteriores a su registro |
| `FechaBaja` | String (YYYY-MM-DD) | Baja en el equipo; reasignar crea una fila nueva y conserva la anterior |

**Reglas:**
- Cada jugador tiene exactamente **un** equipo con `Tipo = "Principal"`.
- Puede tener varios equipos con `Tipo = "Secundario"` (dobla regularmente).
- Los invitados puntuales **no** generan fila aquí; se marcan en `Asist_Jugadores` con `EsInvitado = true`.

---

### `Entrenadores`
Registro global de entrenadores. Identificados por su email de Google.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `ID` | String (UUID) | Identificador único |
| `Nombre` | String | Nombre |
| `Apellidos` | String | Apellidos |
| `Email` | String | **Email de Google** — clave de autenticación |
| `Telefono` | String | Teléfono de contacto |
| `FotoURL` | String | Avatar o JPEG de perfil, con el mismo formato y límite que `Jugadores.FotoURL`; aplicar `supabase/perfil.sql` en instalaciones existentes |

**Reglas:** El acceso usa email y PIN, sin depender de la sesión Google. Los administradores se validan en `Administradores`, no mediante `Entrenadores.EsAdmin`. Un administrador con ficha de entrenador entra con el PIN de su ficha (`Entrenadores.PIN`); al darle permisos y cada vez que cambia ese PIN se copia a `Administradores.PIN`, que solo valida a administradores sin ficha. No hay distinción de roles entre entrenadores.

### Cuenta propia

- `actualizarFotoPerfil` modifica la foto propia; `actualizarMiPerfil` conserva la verificación familiar de jugadores y limita al personal a nombre, apellidos y teléfono. Un administrador sin ficha de entrenador no puede editar su perfil ni su foto.
- `cambiarCredenciales` exige el PIN actual y devuelve las nuevas credenciales de sesión. Con ficha de entrenador se modifica `Entrenadores.PIN` (y `Administradores.PIN` si es administrador); un administrador sin ficha lo cambia en `Administradores`. El usuario de jugador sigue siendo único.
- `cambiarCodigoSeguridad` exige el código familiar anterior y guarda uno de seis letras o números en mayúsculas.
- Recuperación: `opcionesRecuperacion` devuelve destinos con correo enmascarado. `solicitarCodigoRecuperacion` envía un número de seis dígitos únicamente al correo elegido (jugador, tutor o cuenta del personal); nunca envía PIN ni código familiar. Se guarda solo su hash SHA-256 por cuenta durante diez minutos y se permite una solicitud por minuto. `verificarCodigoRecuperacion` consume el número una sola vez; cinco errores lo invalidan. Devuelve el PIN y, únicamente si se eligió un tutor, el código familiar. No se registran secretos en logs.
- `actualizarEntrenador` valida email y PIN antes de autorizar; los no administradores solo pueden modificar su nombre, apellidos y teléfono, nunca Email, PIN ni EsAdmin.

---

### `Entrenadores_Equipos`
Relación entrenador ↔ equipo (asignación permanente).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `ID` | String (UUID) | Identificador único |
| `ID_Entrenador` | String (UUID) | FK → `Entrenadores.ID` |
| `ID_Equipo` | String (UUID) | FK → `Equipos.ID` |
| `Activo` | Boolean | Para desasignar sin borrar historial |
| `FechaAlta` | String (YYYY-MM-DD) | Alta en el equipo; `null` en relaciones anteriores a su registro |
| `FechaBaja` | String (YYYY-MM-DD) | Baja en el equipo |
| `TipoRol` | String | Siempre `Entrenador`. Las filas antiguas con `Visor` (rol retirado) se tratan como `Entrenador` |

**Reglas:** Un entrenador puede estar asignado a varios equipos. Los sustitutos puntuales se registran en `Asist_Entrenadores` con `EsInvitado = true`.

---

### `Sesiones`
Cada sesión de entrenamiento, generada automáticamente o creada manualmente.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `ID` | String (UUID) | Identificador único |
| `ID_Equipo` | String (UUID) | FK → `Equipos.ID` |
| `ID_Temporada` | String (UUID) | FK → `Temporadas.ID` |
| `Fecha` | String (YYYY-MM-DD) | Fecha del entrenamiento |
| `HoraInicio` | String (HH:MM) | Hora de inicio |
| `HoraFin` | String (HH:MM) | Hora de fin |
| `EsExtra` | Boolean | `false` = generada por patrón, `true` = añadida manualmente |
| `Notas` | String | Observaciones opcionales sobre la sesión |
| `ID_Horario` | String (UUID) | Horario del que se generó (sin clave foránea) |
| `Cancelada` | Boolean | Sesión cancelada; no cuenta en estadísticas ni admite asistencia |
| `MotivoCancelacion` | String | Uno de `CONFIG.MOTIVOS_CANCELACION` |
| `FechaCancelacion` | String (YYYY-MM-DD HH:MM) | Momento de la cancelación |
| `FechaPrimerRegistro` | String (YYYY-MM-DD HH:MM) | Primer guardado de asistencia; no se sobrescribe |

**Reglas:**
- Al inicio de cada semana se auto-generan sesiones según los `Horarios` de cada equipo.
- Eliminar una sesión borra en cascada sus registros en `Asist_Jugadores` y `Asist_Entrenadores`.

---

### `Asist_Jugadores`
Registro de asistencia de jugadores por sesión.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `ID` | String (UUID) | Identificador único |
| `ID_Sesion` | String (UUID) | FK → `Sesiones.ID` |
| `ID_Jugador` | String (UUID) | FK → `Jugadores.ID` |
| `Estado` | String | `P` (Presente) / `A` (Ausente) / `R` (Retraso) |
| `EsInvitado` | Boolean | `true` si el jugador no pertenece al equipo de la sesión |
| `FechaRegistro` | String (YYYY-MM-DD HH:MM) | Timestamp del registro |
| `MinutosRetraso` | Integer (1–180) | Minutos de retraso cuando `Estado = R`; `null` si no se indicó. Un aviso de retraso de la familia lo rellena si aún no hay `Estado` (prerrellena la ficha del entrenador) o si el entrenador marcó R sin minutos; nunca sustituye minutos ya registrados |

**Reglas:**
- Si un jugador no tiene fila para una sesión, su estado es **sin registrar** (se muestra en gris en la UI).
- `EsInvitado = true` para jugadores de otros equipos que suben a entrenar puntualmente.
- El estado cicla en la UI: sin registrar → P (verde) → A (rojo) → R (amarillo) → P...
- `Estado` solo lo escribe el entrenador. Un aviso o justificación de la familia no rellena `Estado`: una A justificada sigue contando como ausencia.
- Motivo **Salud** (`MotivoCategoria`, `CONFIG.MOTIVO_SALUD`): sin texto libre. Apps Script descarta `MotivoDetalle` al guardar justificaciones y programaciones y nunca lo incluye en mensajes ni correos. Los motivos retirados `Lesión` y `Enfermedad` (`CONFIG.MOTIVOS_SALUD_ANTIGUOS`) no se migran: `cargarDatos` los entrega como «Salud» sin `MotivoDetalle` ni `MensajeGenerado`, y las estadísticas los agrupan con «Salud».

---

### `Asist_Entrenadores`
Registro de asistencia de entrenadores por sesión.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `ID` | String (UUID) | Identificador único |
| `ID_Sesion` | String (UUID) | FK → `Sesiones.ID` |
| `ID_Entrenador` | String (UUID) | FK → `Entrenadores.ID` |
| `Asistio` | Boolean | `true` = asistió, `false` = no asistió |
| `EsInvitado` | Boolean | `true` si el entrenador no está asignado al equipo de la sesión |
| `FechaRegistro` | String (YYYY-MM-DD HH:MM) | Timestamp del registro |

---

## Relaciones clave

```
Temporadas ──< Equipos ──< Horarios
                  │
                  ├──< Jugadores_Equipos >── Jugadores
                  ├──< Entrenadores_Equipos >── Entrenadores
                  └──< Sesiones ──< Asist_Jugadores >── Jugadores
                                └──< Asist_Entrenadores >── Entrenadores
```

---

## Notas de implementación

- **Fotos**: se almacena la URL de Google Drive. La subida de fotos se hace a Drive con `DriveApp.createFile()` y se guarda la URL pública.
- **Borrado**: nunca se borran jugadores o entrenadores del registro global; se desactivan con `Activo = false`.
- **Generación de sesiones**: la función `generarSesionesSemana(equipoId)` crea una sesión por cada fila de `Horarios` del equipo para la semana actual, si no existe ya.
- **Control de acceso**: `Auth.gs` valida entrenadores contra `Entrenadores.Email` y administradores activos contra la tabla privada `Administradores`.
- **Preferencias del dispositivo**: `localStorage.cb_baeza_prefs` guarda `{ idioma: 'es' | 'en', tema: 'claro' | 'oscuro' | 'patrimonio' }`. No se envían a Apps Script ni a Supabase. Se aplican antes del primer pintado; los cambios de idioma y tema son inmediatos y solo afectan a ese navegador. Los temas retirados se migran al arrancar y se guarda el valor nuevo: `clasico`, `lavanda` y `oro` → `claro`; `noche` y `medianoche` → `oscuro`; cualquier otro valor usa `claro`. La traducción mantiene los nombres y los motivos escritos por los usuarios sin modificar; los contenedores de datos pueden excluirse con `data-no-i18n` o `translate="no"`.
- **Navegación de ajustes**: `ajustes` muestra un listado de opciones con sus valores actuales. `ajustes-idioma` y `ajustes-apariencia` contienen los controles; usan el historial SPA para volver al listado sin descartar la preferencia aplicada.
- **Alertas de ausencias seguidas**: no tienen tabla. `Estadisticas.alertasAusencias` las calcula en `cargarDatos` con los datos ya descargados y la SPA las guarda en `App.state.alertasAusencias`. Regla:
  - Umbral `CONFIG.ESTADISTICAS.AUSENCIAS_SEGUIDAS` (3), el mismo de la alerta `seguidas` de las estadísticas (`Estadisticas.rachaAusencias_` es la única definición).
  - Solo la temporada activa y sesiones terminadas, guardadas y no canceladas hasta hoy (aunque la temporada activa ya haya pasado su `FechaFin`); se ignoran filas `Excluido`, preavisos sin `Estado` y casillas sin marcar (ni cuentan ni cortan).
  - Se recorre la línea de tiempo del jugador en todos sus equipos, de la sesión más reciente hacia atrás: cada `A` con relación vigente con el equipo suma (también las justificadas, que se indican aparte); una `P` o `R` corta la racha, también como invitado; una `A` como invitado se ignora.
  - La alerta sale en cada equipo de la temporada activa donde el jugador tiene hoy relación activa. El admin ve todos los equipos; el entrenador, solo los suyos (`equiposGestion`); sustitución puntual y jugadores no reciben nada.
  - «Contactado» se guarda solo en el navegador (`localStorage['cb-baeza-alertas-v1:' + identidad]`) con la clave `jugadorId:primeraSesionDeLaRacha` y el número de faltas al marcar; reaparece cuando la racha suma otras `umbral` faltas y se olvida cuando la racha termina.
