# Modelo de Datos — CB Baeza Asistencia

Google Spreadsheet como base de datos. Cada hoja es una tabla. Primera fila = cabecera.
IDs generados con `Utilities.getUuid()`. Fechas como `YYYY-MM-DD`. Horas como `HH:MM`.

---

## Hojas y esquemas

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

**Ejemplo:** Un equipo que entrena lunes y miércoles tendrá 2 filas en esta hoja.

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
| `FotoURL` | String | URL de Google Drive con la foto |
| `Dorsal` | Number | Número de camiseta (puede variar por equipo, aquí es referencia) |

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

**Reglas:** El email debe coincidir con `Session.getActiveUser().getEmail()` para el control de acceso. No hay distinción de roles entre entrenadores.

---

### `Entrenadores_Equipos`
Relación entrenador ↔ equipo (asignación permanente).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `ID` | String (UUID) | Identificador único |
| `ID_Entrenador` | String (UUID) | FK → `Entrenadores.ID` |
| `ID_Equipo` | String (UUID) | FK → `Equipos.ID` |
| `Activo` | Boolean | Para desasignar sin borrar historial |

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

**Reglas:**
- Si un jugador no tiene fila para una sesión, su estado es **sin registrar** (se muestra en gris en la UI).
- `EsInvitado = true` para jugadores de otros equipos que suben a entrenar puntualmente.
- El estado cicla en la UI: sin registrar → P (verde) → A (rojo) → R (amarillo) → P...

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
- **Control de acceso**: `Auth.gs` comprueba el email del usuario contra `Entrenadores.Email` y contra `ADMIN_EMAILS` en `Config.gs`.
