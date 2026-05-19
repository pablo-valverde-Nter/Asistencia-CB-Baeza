# CB Baeza — Gestión de Asistencia: Instrucciones para GitHub Copilot

## Descripción del proyecto

Aplicación web para la gestión de asistencia de entrenamientos del Club de Baloncesto Baeza.
Desarrollada con **Google Apps Script** (GAS) + **HtmlService** (SPA) y **Google Sheets** como base de datos.
El deporte es siempre **baloncesto** — no existe esa variable en ningún modelo.

---

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Backend | Google Apps Script (`.gs`) — V8 runtime |
| Frontend | HTML + CSS + JavaScript vanilla servido por `HtmlService` |
| Base de datos | Google Sheets (una hoja de cálculo por entorno) |
| Comunicación cliente-servidor | `google.script.run` (asíncrono) |
| Autenticación | `Session.getActiveUser().getEmail()` — Google OAuth |
| Despliegue | Apps Script Web App (Execute as: Me, Access: Anyone with Google Account) |

---

## Estructura de ficheros

```
src/
  Config.gs          → ID del Spreadsheet, nombres de hojas, constantes
  Auth.gs            → Control de acceso: roles, permisos por equipo, email lookup
  DataAccess.gs      → CRUD genérico sobre Sheets (getSheet, appendRow, updateRow, deleteRow)
  Equipos.gs         → Lógica de equipos, jugadores y entrenadores
  Sesiones.gs        → Generación automática de sesiones + sesiones extra
  Asistencia.gs      → Registro y consulta de asistencia de jugadores y entrenadores
  Informes.gs        → Exportación a Sheets y generación de estadísticas
  Code.gs            → doGet(), endpoints públicos (funciones llamadas por google.script.run)
ui/
  Index.html         → Shell SPA: navegación + contenedor de vistas
  styles.css         → Estilos globales; colores de estado: verde=#4CAF50 rojo=#F44336 amarillo=#FFC107
  app.js             → Lógica SPA: routing, llamadas a google.script.run, renderizado de vistas
```

---

## Modelo de datos — Resumen de hojas (Google Sheets)

Todas las hojas usan la **primera fila como cabecera**. Los IDs son strings únicos generados con `Utilities.getUuid()`.

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
- **Admin**: ve y gestiona todo (identificado por email en `Config.gs → ADMIN_EMAILS`).
- **Entrenador estándar**: ve únicamente los equipos asignados en `Entrenadores_Equipos`.
- **Acceso temporal**: un entrenador puede pedir acceso a otro equipo para cubrir una sesión puntual (no modifica `Entrenadores_Equipos`).

---

## Convenciones de código

### Apps Script (`.gs`)
- Siempre usar **V8 runtime** (declarado en `appsscript.json`).
- Todas las funciones expuestas al cliente deben estar en `Code.gs` y ser llamadas vía `google.script.run`.
- Las funciones en otros `.gs` son internas — no exponer directamente.
- Usar `SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)` — nunca `getActiveSpreadsheet()` en producción.
- Cachear objetos `Sheet` dentro de la misma ejecución; no obtenerlos repetidamente.
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
- Hojas de Sheets: `PascalCase_ConGuion` como se define en `Config.gs`.
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

### Leer todos los registros de una hoja
```javascript
// En DataAccess.gs
function getSheetData(sheetName) {
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}
```

### Llamada cliente → servidor con feedback
```javascript
// En app.js
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
