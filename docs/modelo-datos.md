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

**Guardar el horario** (`Equipos.setHorariosEquipo`): compara con las filas actuales y conserva sus `ID` (los usan `Sesiones.ID_Horario` y `Programaciones_Justificaciones.ID_Horario`, esta con `ON DELETE CASCADE`). El emparejamiento es una función pura, `Equipos._planHorarios_`: mismo día y horas → no se escribe; mismo día con otras horas (uno a uno) → `updateRow` con el mismo `ID`; solo se insertan los días nuevos y se borran los quitados.

**Programaciones afectadas** (`Equipos._programacionesAfectadas_`): las del horario que se quita **y las del horario cuya hora cambia** (aunque conserve su `ID`, la regla se programó para esa hora y la familia debe revisarla), activas y pausadas. Al guardar se eliminan como `Asistencia.eliminarProgramacion` (vía `Asistencia._retirarProgramacion_`, sin código familiar: retira sus justificaciones de sesiones no empezadas y nunca toca las pasadas) antes de tocar `Horarios`, y cada una deja un aviso en `Avisos_Jugador` para su jugador. Si alguna afectada está activa y no llega `opciones.forzar`, falla sin escribir nada («No se puede quitar el horario del jueves 19:00-20:00…» / «No se puede cambiar la hora del…»); las pausadas se eliminan sin confirmación.

**«Editar equipo»** solo llama a `setHorariosEquipo` si el horario cambió, y lo hace antes que el resto del guardado. Antes pide `previsualizarCambioHorarios` (solo lectura, mismo plan): sin afectadas activas guarda directamente; con alguna, retira el «Guardando…» (`App.operation.cancelar`) y abre «Quitar ausencias programadas» con jugador, día, horas y si se quita el día o cambia la hora (las pausadas, marcadas). «Cancelar» no guarda nada y deja el formulario igual; «Quitar y guardar» repite el guardado con `{ forzar: true }` y quita esas programaciones de la caché.

Una sesión sin `ID_Horario` se asocia a su entrenamiento semanal por `DiaSemana` de su `Fecha` y por horas (`Asistencia._horarioDeSesion_`).

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
| `DetalleCancelacion` | String (≤ 300, una línea) | Texto libre opcional de la cancelación; llega a las familias en el aviso. Migración: `supabase/migrations/2026-11-11-cancelacion-detalle.sql` |
| `FechaCancelacion` | String (YYYY-MM-DD HH:MM) | Momento de la cancelación |
| `CanceladoPor` | String o NULL | Nombre y apellidos de la ficha de entrenador autenticado; `CB Baeza` si no tiene ficha o nombre. NULL en cancelaciones anteriores |
| `CanalAvisoCancelacion` | String o NULL | Canal elegido: `whatsapp`, `correo`, `copiar` o `ninguno`; NULL en cancelaciones anteriores |
| `FechaPrimerRegistro` | String (YYYY-MM-DD HH:MM) | Primer guardado de asistencia; no se sobrescribe |

**Reglas:**
- Al inicio de cada semana se auto-generan sesiones según los `Horarios` de cada equipo.
- Eliminar una sesión borra en cascada sus registros en `Asist_Jugadores` y `Asist_Entrenadores`.
- **Cancelar** (`cancelarSesion(auth, sesionId, motivo, { detalle, canal })`) exige un motivo de `CONFIG.MOTIVOS_CANCELACION`, rechaza sesiones con asistencia guardada o ya canceladas y guarda `Cancelada`, `MotivoCancelacion`, `DetalleCancelacion`, `FechaCancelacion`, `CanceladoPor` y `CanalAvisoCancelacion`. La identidad se obtiene en servidor tras autenticar, nunca de las opciones del cliente. Sin opciones equivale a `canal: 'ninguno'`. Reactivar vacía los cinco datos de cancelación.
- **Aviso a las familias al cancelar** (`Notificaciones.avisarCancelacionAFamilias`, después de guardar la cancelación; si falla, la sesión sigue cancelada y la respuesta trae `notificacion.error`):
  - Destinatarios: `Sesiones.convocados`, la lista del pase de lista: relaciones activas de `Jugadores_Equipos` del equipo (principal y secundario) más los invitados guardados en `Asist_Jugadores`, sin los `Excluido`.
  - Contactos por familia (`Notificaciones.contactosFamilia`): teléfonos o correos de los tutores 1 y 2; si no hay ninguno registrado, los del propio jugador. En correo solo cuentan los tutores con `NotificarAusenciasPadreN` activo. Quien no tiene contacto válido se omite y se cuenta en `omitidos` y se identifica en `omitidas` como `{ jugador: nombre }`, sin teléfonos.
  - Canales (`CONFIG.CANALES_AVISO_CANCELACION`): `ninguno`; `copiar` (solo devuelve `mensaje`); `correo` (HTML escapado y texto plano con los mismos datos, un `MailApp.sendEmail` por familia con sus direcciones en «Para»; hermanos con la misma dirección no la repiten); `whatsapp` (siempre prepara un enlace `https://wa.me/<número>?text=<mensaje>` por número normalizado sin repetir, también si existen properties de Cloud API). El entrenador usa su WhatsApp personal, con difusión manual o enlaces uno a uno. La firma usa `CanceladoPor` y, para registros antiguos sin nombre, `CB Baeza`.
  - `WhatsApp.avisar` conserva la Cloud API como vía interna dormida: con `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_ID` usa `WHATSAPP_TEMPLATE` (por defecto `cancelacion_entrenamiento`, idioma `WHATSAPP_TEMPLATE_LANG`, por defecto `es`) y sin ellos devuelve enlaces; un fallo de Cloud API también devuelve un enlace. La plantilla antigua de tres variables (equipo, cuándo y motivo) no refleja el nuevo mensaje ni su firma y quedaría desfasada hasta que se cree y apruebe una plantilla actualizada en Meta; el flujo personal no la usa.
  - Respuesta `notificacion`: `{ canal, mensaje, convocados, avisados, omitidos, omitidas?, fallidos, modo?, enlaces? }`; en WhatsApp `avisados` cuenta familias con enlace preparado, no envíos confirmados. Los logs no incluyen números, correos ni mensajes.

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
- **Programaciones** (`Programaciones_Justificaciones`): `aplicarProgramacionesSesion` crea en cada sesión generada del entrenamiento semanal (`ID_Horario`) una justificación con `JustificadoPor = 'programacion'` y `EsProgramada = true`. Editar una programación solo cambia la regla (las justificaciones ya creadas no se reescriben) y conserva `Activo`; no puede dejar dos programaciones del jugador en el mismo entrenamiento. Borrarla (con el código familiar, validado en Apps Script) elimina la regla y, solo en sesiones que aún no han empezado (`Fecha HoraInicio` posterior a ahora) y procedentes de ese mismo entrenamiento: borra la fila si no tiene `Estado` o, si el entrenador ya lo marcó, quita solo la justificación (conserva `Estado` y `MinutosRetraso`); avisa de la cancelación al entrenador si se le había notificado. Las sesiones pasadas o en curso y las justificaciones enviadas a mano por la familia no se tocan.
- Quitar o cambiar de hora un entrenamiento desde «Editar equipo» elimina sus programaciones de la misma forma (sin código familiar, tras confirmarlo el entrenador) y deja un aviso en `Avisos_Jugador`; ver «Programaciones afectadas» en `Horarios`.

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

### `Avisos_Jugador`
Mensajes persistentes del club para una cuenta de jugador/familia. Hoy los crea `Equipos.setHorariosEquipo` (`Tipo = 'programacion-quitada'`) por cada programación eliminada al quitar o cambiar de hora un entrenamiento. Solo Apps Script la lee y escribe (RLS sin políticas, como el resto); migración: `supabase/migrations/2026-11-09-avisos-jugador.sql`.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `ID` | String (UUID) | Identificador único |
| `ID_Jugador` | String (UUID) | FK → `Jugadores.ID` (`ON DELETE CASCADE`) |
| `Tipo` | String | Origen del aviso (`programacion-quitada`) |
| `Mensaje` | String | Línea destacada del aviso; en `programacion-quitada`, `Equipo · Día HoraInicio–HoraFin` (p. ej. `Infantil Mixto · Jueves 19:00–20:00`, día en plural y con mayúscula). Solo nombra su equipo y su entrenamiento, nunca a otros jugadores |
| `FechaCreacion` | String (YYYY-MM-DD HH:MM) | Hora del servidor al crearlo |
| `Leido` | Boolean | `false` hasta que la familia lo cierra |
| `FechaLectura` | String (YYYY-MM-DD HH:MM) | Hora del servidor al cerrarlo |

- `cargarDatos` entrega en `avisosJugador` solo los no leídos del jugador autenticado (al personal, ninguno); si la tabla no se puede leer, el arranque sigue sin avisos. La SPA los guarda en `App.state.avisosJugador` y, al iniciar sesión o recargar (tras la bienvenida si está abierta), los muestra de uno en uno en la tarjeta flotante `#modal-aviso-club` (`App.views.avisoClub`), sea cual sea la vista. El título y la frase de acción dependen del `Tipo` (en `programacion-quitada`: «Se ha quitado tu ausencia programada» / «Ha cambiado el horario. Si la sigues necesitando, vuelve a programarla.»); `Mensaje` va como línea destacada.
- «Entendido» llama a `marcarAvisoLeido(auth, avisoId)` con `App.operation`: solo cuentas de jugador y solo sus propios avisos; pone `Leido = true` y `FechaLectura`, lo quita de `App.state.avisosJugador` y pasa al siguiente o cierra la tarjeta. «Programar ausencia» hace lo mismo, lleva a Entrenos y, si no quedan avisos, abre el asistente de programaciones. Si el servidor rechaza el cierre, el aviso sigue a la vista.

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
