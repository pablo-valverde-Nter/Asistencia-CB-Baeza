# CB Baeza — Gestión de Asistencia: Instrucciones para GitHub Copilot

## Descripción del proyecto

Aplicación web para la gestión de asistencia de entrenamientos del Club de Baloncesto Baeza.
Desarrollada con **Google Apps Script** (GAS) + **HtmlService** (SPA) y **Supabase PostgreSQL** como base de datos.
El deporte es siempre **baloncesto** — no existe esa variable en ningún modelo.

---

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Backend | Google Apps Script (`.gs`) — V8 runtime |
| Frontend | HTML + CSS + JavaScript vanilla servido por `HtmlService` |
| Base de datos | Supabase PostgreSQL vía PostgREST; clave secreta guardada en Script Properties |
| Comunicación cliente-servidor | `google.script.run` (asíncrono) |
| Autenticación | Validación propia en Apps Script: email/PIN para entrenadores y usuario/PIN para jugadores |
| Despliegue | Apps Script Web App (Execute as: Me, Access: Anyone with Google Account) |

---

## Estructura de ficheros

```
src/
  Config.gs          → nombres de tablas, permisos, roles y constantes
  Auth.gs            → Control de acceso: roles, permisos por equipo, email lookup
  Schema.gs          → esquema/allowlist de tablas y columnas Supabase
  DataAccess.gs      → CRUD genérico sobre Supabase PostgREST
  Equipos.gs         → Lógica de equipos, jugadores y entrenadores
  Sesiones.gs        → Generación automática de sesiones + sesiones extra
  Asistencia.gs      → Registro y consulta de asistencia de jugadores y entrenadores
  Code.gs            → doGet(), endpoints públicos (funciones llamadas por google.script.run)
ui/
  Index.html         → Shell SPA: navegación + contenedor de vistas
  styles.html        → Estilos de la SPA
  app.html           → Lógica SPA: routing, llamadas a google.script.run, renderizado de vistas
```

No recrear utilidades de migración, datos semilla o inicialización de Google Sheets en el proyecto de producción.

---

## Modelo de datos — Tablas Supabase

Los IDs son strings únicos generados con `Utilities.getUuid()`. `CONFIG.SHEETS` conserva los nombres históricos de las tablas para el acceso PostgREST.

| Hoja | Propósito |
|------|-----------|
| `Temporadas` | Temporadas deportivas (ej. 2025-2026) |
| `Equipos` | Equipos del club por temporada |
| `Horarios` | Patrón semanal de entrenamientos por equipo (días + horas) |
| `Jugadores` | Registro global de jugadores del club |
| `Jugadores_Equipos` | Relación jugador-equipo con tipo Principal/Secundario |
| `Entrenadores` | Registro global de entrenadores (identificados por email Google) |
| `Entrenadores_Equipos` | Relación entrenador-equipo |
| `Sesiones` | Sesiones de entrenamiento (generadas o extra) |
| `Asist_Jugadores` | Asistencia de jugadores por sesión (P/A/R) |
| `Asist_Entrenadores` | Asistencia de entrenadores por sesión |

---

## Reglas de negocio clave

### Jugadores
- Cada jugador tiene un **equipo principal** (`Tipo = "Principal"`) y puede tener equipos secundarios (`Tipo = "Secundario"`) para los que dobla regularmente.
- En el formulario de asistencia se puede añadir de forma **puntual** cualquier jugador del club como invitado (`EsInvitado = true`). No modifica su `Jugadores_Equipos`.
- Campos: `ID`, `Nombre`, `Apellidos`, `FechaNac`, `Telefono`, `Email`, `FotoURL`, `Dorsal`.

### Entrenadores
- Identificados por su **email de Google** (usado para control de acceso).
- Un entrenador puede estar asignado a **varios equipos**.
- En una sesión aparecen por defecto los entrenadores del equipo; se pueden añadir otros como invitados (`EsInvitado = true`).
- No hay distinción de roles (primer entrenador, asistente, etc.).

### Sesiones
- Cada equipo tiene un **patrón semanal** en `Horarios` (N filas, una por día de entrenamiento).
- Al inicio de cada semana (o bajo demanda) se **auto-generan** las sesiones correspondientes al patrón.
- Se pueden añadir **sesiones extra** con fecha y hora personalizadas.
- Las sesiones existentes se pueden **modificar** (fecha, hora) o **eliminar** (borra asistencias en cascada).

### Asistencia de jugadores
- Estados: `P` (Presente → verde), `A` (Ausente → rojo), `R` (Retraso → amarillo).
- El formulario de asistencia muestra todos los jugadores del equipo en lista; el usuario toca el nombre para ciclar entre estados.
- Si un jugador no tiene registro en `Asist_Jugadores` para esa sesión, se considera **sin registrar** (gris).

### Temporadas
- Una sola temporada activa (`Activa = true`) en cada momento.
- Los equipos, jugadores y entrenadores persisten entre temporadas. Solo las sesiones y asistencias están ligadas a una temporada concreta.
- Formato de nombre: `YYYY-YYYY` (ej. `2025-2026`).

### Control de acceso
- **Admin**: ve y gestiona todo (identificado por email activo en la tabla privada `Administradores`).
- **Entrenador estándar**: ve únicamente los equipos asignados en `Entrenadores_Equipos`.
- **Acceso temporal**: un entrenador puede pedir acceso a otro equipo para cubrir una sesión puntual (no modifica `Entrenadores_Equipos`).

---

## Convenciones de código

### Apps Script (`.gs`)
- Siempre usar **V8 runtime** (declarado en `appsscript.json`).
- Todas las funciones expuestas al cliente deben estar en `Code.gs` y ser llamadas vía `google.script.run`.
- Las funciones en otros `.gs` son internas — no exponer directamente.
- El acceso operativo a datos usa Supabase PostgREST desde Apps Script. `src/Config.gs → SUPABASE_ENV` selecciona DEV o PRO por versión; las URL y claves están en Script Properties (`SUPABASE_DEV_URL`, `SUPABASE_DEV_SECRET_KEY`, `SUPABASE_DEV_PUBLISHABLE_KEY` y sus equivalentes PRO). Nunca exponer una Secret key al navegador ni guardarla en el repositorio. Los administradores se registran en `Administradores`, consultada solo por Apps Script; no hardcodear cuentas ni PINs administrativos. El navegador puede recibir solo la URL y Publishable key del entorno seleccionado para Realtime.
- La SPA recibe solo cambios de `public.app_sync_state` vía Supabase Realtime y recarga los datos mediante `cargarDatos(auth)`. No suscribir el navegador a tablas de negocio (contienen PIN, códigos familiares y datos personales); mantener la publishable key como única clave del cliente.
- Manejar errores con `try/catch` y devolver objetos `{ success: false, error: message }`.
- Los IDs siempre se generan con `Utilities.getUuid()`.
- Las fechas se almacenan como strings `YYYY-MM-DD` para evitar problemas de zona horaria.
- Las horas se almacenan como strings `HH:MM` (24h).

### Frontend (JavaScript en HtmlService)
- Toda comunicación con el servidor usa `google.script.run.withSuccessHandler(fn).withFailureHandler(fn).nombreFuncion(args)`.
- La app es una **SPA**: una única `Index.html` con secciones que se muestran/ocultan con CSS.
- No usar frameworks externos (React, Vue, etc.) — JavaScript vanilla + CSS puro.
- Los estados de asistencia se renderizan como botones de colores (verde/rojo/amarillo) que el usuario toca para cambiar.
- Usar `showToast(message, type)` para feedback de acciones (éxito/error).

### Nomenclatura
- Funciones GAS: `camelCase` (ej. `getJugadoresByEquipo`, `registrarAsistencia`).
- Tablas Supabase: usar nombres y columnas declarados en `Schema.gs`.
- Variables locales: `camelCase`.
- Constantes globales: `UPPER_SNAKE_CASE` dentro del objeto `CONFIG`.

---

## Navegación de la app (vistas SPA)

| Vista | Ruta lógica | Descripción |
|-------|------------|-------------|
| `dashboard` | `/` | Resumen: equipos del entrenador, próximas sesiones |
| `sesion` | `/sesion/:id` | Formulario de asistencia rápida de una sesión |
| `equipo` | `/equipo/:id` | Detalle del equipo: jugadores, entrenadores, horario |
| `jugadores` | `/jugadores` | CRUD de jugadores (admin) |
| `entrenadores` | `/entrenadores` | CRUD de entrenadores (admin) |
| `equipos` | `/equipos` | CRUD de equipos (admin) |
| `historico` | `/historico` | Listado y edición del histórico de sesiones |
| `informes` | `/informes` | Estadísticas y exportaciones |

---

## Categorías del club

`baybasket` | `pre-minibasket` | `minibasket` | `infantil` | `cadete` | `junior` | `senior`

Modalidades: `Masculino` | `Femenino` | `Mixto`

---

## Patrones de uso frecuente

### Leer registros de una tabla Supabase
```javascript
// En DataAccess.gs
function getSheetData(tableName) {
  assertSupabaseTable_(tableName);
  return supabaseRequest_(tableName, 'get', 'select=*');
}
```

### Llamada cliente → servidor con feedback
```javascript
// En app.html
function guardarAsistencia(sesionId, asistencias) {
  showLoading(true);
  google.script.run
    .withSuccessHandler(result => {
      showLoading(false);
      if (result.success) showToast('Asistencia guardada', 'success');
      else showToast(result.error, 'error');
    })
    .withFailureHandler(err => {
      showLoading(false);
      showToast('Error de conexión', 'error');
    })
    .registrarAsistencia(sesionId, asistencias);
}
```
