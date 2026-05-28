# CB Baeza — Registro de Progreso de Desarrollo

> Fichero de trazabilidad del desarrollo de la mejora de 4 roles de usuario.
> Actualizar cada vez que se complete una subtarea.

---

## Contexto del proyecto

Mejora principal: Sistema de **4 roles de usuario** (Admin, Entrenador, Jugador, Padres)
con credenciales propias para jugadores, rol Visor para entrenadores, formulario de
justificaciones de ausencias/retrasos y notificaciones por email vía MailApp.

---

## Estado global

| Fase | Descripción | Estado |
|------|-------------|--------|
| 1 — Backend core | Config, Setup, Auth | ✅ Completo |
| 2 — Backend lógica | Notificaciones, Equipos, Asistencia, Code | ✅ Completo |
| 3a — Datos de prueba | SeedData actualizado | ✅ Completo |
| 3b — Frontend estructura | Index.html | ✅ Completo |
| 3c — Frontend estilos | styles.html | ✅ Completo |
| 3d — Frontend lógica | app.html | ✅ Completo |
| 4a — Bugs admin y credenciales | CSS, persistencia, edición segura | 🔄 En curso |
| 4b — Rediseño vista sesión | Solo lectura + modo edición + estados justif. | ⏳ Pendiente |
| 4c — Justificaciones | Persistencia, asincronía, pre-justificación | ⏳ Pendiente |
| 4d — Entrenadores: sustitución | Botón "Sustituir en otro equipo" (acceso puntual) | ✅ Completo |
| 4e — Rediseño perfil jugador | Nueva vista inicial + Mi Equipo con ranking | ⏳ Pendiente |
| 4f — UX: confirmación y asincronía | Aviso antes de guardar + guardado en background | ⏳ Pendiente |

---

## Detalle de tareas completadas

### FASE 1 — Backend core

#### ✅ Config.gs — Nuevas constantes
**Fecha:** Mayo 2026
**Cambios:**
- `ROLES: { ADMIN, ENTRENADOR, JUGADOR }` — constantes de rol
- `TIPOS_ROL_ENTRENADOR: { ENTRENADOR, VISOR }` — tipo de relación entrenador-equipo
- `MOTIVOS_JUSTIFICACION: [...]` — 8 categorías para el formulario de justificación

---

#### ✅ Setup.gs — Schema actualizado + migraciones
**Fecha:** Mayo 2026
**Cambios en SCHEMA:**
- `Jugadores`: +`Usuario`, `PIN`, `CodigoPadres`, `EmailPadre1`, `EmailPadre2`, `NombrePadre1`, `NombrePadre2`
- `Entrenadores`: +`EsAdmin`
- `Entrenadores_Equipos`: +`TipoRol` ('Entrenador' | 'Visor')
- `Asist_Jugadores`: +`TieneJustificacion`, `TipoJustificacion`, `MotivoCategoria`, `MotivoDetalle`, `FechaJustificacion`, `JustificadoPor`, `MensajeGenerado`, `NotificadoEntrenador`
**Funciones añadidas:**
- `migrarCamposJugadores()`, `migrarGenerarCredencialesJugadores()`
- `migrarCamposEntrenadores()`, `migrarTipoRolEntrenadorEquipo()`
- `migrarCamposJustificacion()`, `ejecutarMigracionesV2()` (punto de entrada)

---

#### ✅ Auth.gs — Sistema de 4 roles (reescrito completo)
**Fecha:** Mayo 2026
**Nuevo formato `auth`:** `{ tipo: 'entrenador'|'jugador', email?, usuario?, pin }`
**Funciones principales:**
- `validate(auth)` — valida credenciales para ambos tipos
- `getRol(auth)` — devuelve 'admin' | 'entrenador' | 'jugador' (admin = ADMIN_EMAILS o EsAdmin=true)
- `getContextoUsuario(auth)` — devuelve contexto completo con rol, equipos, equiposVisor
- `requireAdmin(auth)`, `requireEntrenadorOAdmin(auth)` — guards de acceso
- `requireAccesoGestionEquipo(equipoId, auth)` — solo TipoRol='Entrenador' o admin
- `requireAccesoLecturaEquipo(equipoId, auth)` — todos los roles autenticados
- `verificarCodigoPadres(jugadorId, codigo)` — valida código de 6 chars para justificaciones
- `getEntrenadorActual(auth)`, `getJugadorActual(auth)` — helpers de identidad

---

### FASE 2 — Backend lógica

#### ✅ Notificaciones.gs — Módulo email (fichero nuevo)
**Fecha:** Mayo 2026
**Funciones:**
- `notificarAusenciaAFamilia(jugador, sesion, equipo, estado)` — email a EmailPadre1/2 cuando A o R
- `notificarJustificacionAEntrenadores(...)` — email a todos los TipoRol=Entrenador del equipo
- `generarMensajeJustificacion(...)` — texto auto-generado que se guarda en MensajeGenerado

---

#### ✅ Equipos.gs — CRUD actualizado
**Fecha:** Mayo 2026
**Cambios en jugadores:**
- `crearJugador()`: auto-genera `Usuario`, `PIN` (4 dígitos), `CodigoPadres` (6 chars), guarda EmailPadre1/2, NombrePadre1/2
- `actualizarCredencialesJugador(jugadorId, nuevoUsuario, nuevoPin)`: valida unicidad del usuario
**Cambios en entrenadores:**
- `crearEntrenador()`: guarda PIN y EsAdmin
- `actualizarEntrenador(id, datos, permiteEmail)`: permite cambio de email si permiteEmail=true
- `asignarEntrenadorAEquipo(id, equipoId, tipoRol)`: guarda TipoRol
**Nuevas funciones:**
- `añadirEquipoVisor(entrenadorId, equipoId)` — no degrada rol Entrenador existente
- `eliminarEquipoVisor(entrenadorId, equipoId)` — solo elimina relaciones Visor

---

#### ✅ Asistencia.gs — Sistema de justificaciones
**Fecha:** Mayo 2026
**Cambios en `guardarAsistenciaCompleta()`:**
- Trigger de email automático a familias para estados A y R con EmailPadre1/2
**Nuevas funciones:**
- `registrarJustificacion(sesionId, jugadorId, codigoPadres, ...)` — valida CodigoPadres, upsert registro, notifica entrenadores
- `getJustificacionesSesion(sesionId)` — lista justificaciones de una sesión

---

#### ✅ Code.gs — Endpoints y guards actualizados
**Fecha:** Mayo 2026
**Cambios en guards:**
- `iniciarSesion(tipo, credencial, pin)` — soporta tipo 'jugador' (usuario+pin) y 'entrenador' (email+pin)
- `cargarDatos(auth)` — filtra datos sensibles según rol (jugadores no ven CodigoPadres de otros ni sus PIN; entrenadores no ven PIN entre sí; admin ve todo)
- `crearEquipo/actualizarEquipo/eliminarEquipo`: `requireEntrenadorOAdmin` / `requireAccesoGestionEquipo`
- `crearJugador/actualizarJugador/eliminarJugador/asignarJugadorAEquipo`: `requireEntrenadorOAdmin`
- `sesiones`: `requireAccesoGestionEquipo` (era `requireAccesoEquipo` genérico)
- `setHorariosEquipo`: `requireAccesoGestionEquipo`
- `getEstadisticasEquipo`: todos los roles (solo lectura)
**Nuevos endpoints:**
- `añadirEquipoVisor(auth, equipoId)`, `eliminarEquipoVisor(auth, equipoId)`
- `actualizarCredencialesJugador(auth, jugadorId, nuevoUsuario, nuevoPin)`
- `enviarJustificacion(auth, sesionId, jugadorId, codigoPadres, ...)` — sin restricción de rol (CodigoPadres es la autorización)
- `getJustificacionesSesion(auth, sesionId)` — solo entrenadores/admins
- `getEstadisticasJugador(auth, jugadorId)` — todos los roles

---

### FASE 3a — Datos de prueba

#### ✅ SeedData.gs — Datos actualizados
**Fecha:** Mayo 2026
**Cambios:**
- `entrenadorDefs`: añadido campo `EsAdmin: false` a los 4 entrenadores
- `asignaciones`: añadido campo `TipoRol: 'Entrenador'` a las 6 asignaciones
- `insertarJugadoresEquipo()`: reemplaza `appendRow(JUGADORES, j)` por `Equipos.crearJugador(j)` para auto-generar Usuario, PIN y CodigoPadres

---

## Tareas pendientes — Subtareas detalladas

### FASE 3b — Index.html (estructura HTML de vistas)

| # | Subtarea | Estado |
|---|----------|--------|
| 3b-1 | Pantalla de login: toggle Entrenador/Jugador, campos dinámicos | ✅ |
| 3b-2 | Vista `perfil-jugador`: 4 botones principales de navegación | ✅ |
| 3b-3 | Vista `mis-entrenamientos`: lista de sesiones del equipo propio | ✅ |
| 3b-4 | Vista `detalle-sesion-jugador`: detalle de sesión con botón justificar | ✅ |
| 3b-5 | Vista `ajustes-cuenta`: formulario cambio Usuario/PIN | ✅ |
| 3b-6 | Modal de justificación: formulario completo (5 campos + preview + CodigoPadres) | ✅ |
| 3b-7 | Actualizar `<nav>`: ítems distintos según rol | ✅ |

---

### FASE 3c — styles.html (estilos CSS)

| # | Subtarea | Estado |
|---|----------|--------|
| 3c-1 | Login toggle button (`.login-tabs`, `.login-tab`) | ✅ |
| 3c-2 | Badge admin (`.badge-admin`) en lista de entrenadores | ✅ |
| 3c-3 | Chip Visor (`.chip-visor`) en tarjetas de equipo | ✅ |
| 3c-4 | Mini-stats en tarjetas de equipo (`.card-stats`, chips P/A/R) | ✅ |
| 3c-5 | Lista de sesiones del jugador (coloreada por estado A/R) | ✅ |
| 3c-6 | Indicador de justificación enviada (`.justif-badge`) | ✅ |
| 3c-7 | Modal de justificación (formulario, previsualización de mensaje) | ✅ |
| 3c-8 | Vista perfil jugador y ajustes cuenta | ✅ |

---

### FASE 3d — app.html (lógica SPA — la más extensa)

| # | Subtarea | Estado |
|---|----------|--------|
| 3d-1 | `App.state.rol` + `App.state.auth.tipo` en objeto de estado | ✅ |
| 3d-2 | `App.iniciarSesion()`: lee toggle tipo, llama `iniciarSesion(tipo, credencial, pin)` | ✅ |
| 3d-3 | `App._applyBootstrapData()`: maneja `contexto.rol`, `equiposVisor`, `jugador` | ✅ |
| 3d-4 | `App.init()`: routing inicial según rol (jugador→perfil-jugador, entrenador→equipos) | ✅ |
| 3d-5 | `renderEquipos()`: mini-stats en cards, botones Visor, chip Visor | ✅ |
| 3d-6 | `renderEntrenadores()`: badge ADMIN en lista | ✅ |
| 3d-7 | Ocultar botones de edición/borrado para rol jugador | ✅ |
| 3d-8 | Vista `perfilJugador()`: render 4 botones + datos del jugador propio | ✅ |
| 3d-9 | Vista `misEntrenamientos()`: lista sesiones del equipo propio, coloreadas | ✅ |
| 3d-10 | Vista `detalleSessionJugador()`: detalle + botón justificar | ✅ |
| 3d-11 | Vista `ajustesCuenta()`: formulario cambio Usuario/PIN | ✅ |
| 3d-12 | Modal justificación: 5 campos, preview en tiempo real, envío con CodigoPadres | ✅ |

---

## Convenciones de este fichero

- **✅ Completo** — implementado y verificado en el código
- **🔄 En curso** — trabajo activo en este momento
- **⏳ Pendiente** — planificado, aún no iniciado
- **⚠️ Bloqueado** — tiene dependencias no resueltas

Actualizar el estado y añadir notas de decisiones de diseño al completar cada subtarea.

---

---

## FASE 4 — Correcciones y mejoras detectadas en pruebas (Mayo 2026)

> Bugs y mejoras registradas tras la primera ronda de pruebas funcionales completas.
> Indicaciones literales del usuario conservadas en cada bloque para no perder el objetivo.

---

### FASE 4a — Admin: bugs y gestión de credenciales

**Indicación original:**
> "El botón que asigna a un entrenador como administrador no se ve en el fondo blanco. Además, tampoco se mantiene. Al refrescar la aplicación deja de aparecer como administrador. [...] Echo en falta la posibilidad de cambiar el PIN de un jugador. De hecho, las credenciales como correo para los entrenadores, usuario para los jugadores, los PIN y el código de los padres, deberían ser editables. Con un mensaje de aviso al menos de para lo que se usan en el sistema y que tenga cuidado si lo modifica. Por otro lado, cuando se crean los usuarios, si el PIN se genera automáticamente, pero no es 1234 por defecto, hay que mostrarlo en el mensaje al crear el jugador."

| # | Subtarea | Fichero/s afectado/s | Estado |
|---|----------|----------------------|--------|
| 4a-1 | **[CSS Bug]** Botón toggle "Hacer Admin" invisible en fondo blanco — revisar contraste del botón en `styles.html` | `styles.html` | ✅ |
| 4a-2 | **[Backend Bug]** Estado `EsAdmin` no persiste al refrescar — verificar que `cargarDatos` en `Code.gs` devuelve `EsAdmin` y que `_applyBootstrapData` en `app.html` lo aplica correctamente al estado | `Code.gs`, `app.html` | ✅ |
| 4a-3 | **[Frontend]** Edición de credenciales de jugador desde admin: campo `Usuario`, campo `PIN` (con confirmación), campo `CodigoPadres` — añadir formulario con modal de aviso explicativo | `Index.html`, `styles.html`, `app.html` | ✅ |
| 4a-4 | **[Frontend]** Edición de credenciales de entrenador desde admin: campo `Email` (con confirmación), campo `PIN` — añadir al formulario de edición de entrenador con modal de aviso | `Index.html`, `styles.html`, `app.html` | ✅ |
| 4a-5 | **[Frontend]** Modal de aviso genérico de credenciales: texto que explique para qué se usa cada campo (`Email` = acceso al sistema, `PIN` = contraseña, `Usuario` = login jugador, `CodigoPadres` = autorización de justificaciones) y advertencia de consecuencias si se modifica | `Index.html`, `styles.html` | ✅ |
| 4a-6 | **[Frontend/Backend]** Al crear un jugador, mostrar el PIN auto-generado en el toast/mensaje de confirmación de alta, ya que no es `1234` por defecto sino generado aleatoriamente | `app.html`, `Equipos.gs` | ✅ |

---

### FASE 4b — Sesiones: vista de solo lectura con modo edición

**Indicación original:**
> "Cuando una sesión se ha guardado, esta debe adoptar un formato de vista con la información del entreno, pero que no se pueda modificar a no ser que se clicke arriba a la derecha a un botón de editar (como el resto de elementos). Importante que en esta vista se diferencie si el jugador tiene una incidencia sin justificar o ya está justificada."

| # | Subtarea | Fichero/s afectado/s | Estado |
|---|----------|----------------------|--------|
| 4b-1 | **[HTML]** Nueva vista de sesión guardada (modo lectura): layout con info del entrenamiento (fecha, hora, equipo) y lista de asistencias, sin controles editables | `Index.html` | ✅ |
| 4b-2 | **[HTML]** Botón "Editar" (icono lápiz) en esquina superior derecha de la vista de sesión guardada, que cambia al modo edición actual | `Index.html` | ✅ |
| 4b-3 | **[CSS]** Estilos para la vista de solo lectura de sesión: fondo diferenciado, lista de jugadores no interactiva | `styles.html` | ✅ |
| 4b-4 | **[CSS]** Indicador visual diferenciado en la lista de asistencia de la sesión guardada: incidencia (A/R) **sin justificar** (icono/color de alerta) vs. incidencia **ya justificada** (icono/color de confirmación) — distinto del color de estado actual | `styles.html` | ✅ |
| 4b-5 | **[JS]** Lógica de routing: al abrir una sesión ya guardada, determinar si tiene datos en `Asist_Jugadores` y mostrar vista de solo lectura; si no tiene datos, mostrar directamente el formulario de toma de asistencia | `app.html` | ✅ |
| 4b-6 | **[JS]** Al pulsar "Editar", cambiar la sesión al modo formulario editable cargando los datos existentes | `app.html` | ✅ |

---

### FASE 4c — Justificaciones: persistencia, asincronía y pre-justificación

**Indicación original:**
> "Cuando en el perfil del jugador se justifica una incidencia, esta no llega a guardarse entre sesiones. Además, no se carga la justificación en segundo plano y eso es un fallo. Debe hacerse como el resto de procesos en segundo plano mientras el usuario puede hacer otras cosas. Tampoco tiene la posibilidad de justificar las sesiones que aún no se han registrado. Es muy importante esto, porque un padre debe poder justificar una falta incluso antes de que el entrenador rellene la asistencia de esa sesión. En caso de que eso ocurra, en la sesión al entrenador le aparecerá cuando vaya a rellenar la sesión que esta ya se ha justificado como una falta o retraso."

| # | Subtarea | Fichero/s afectado/s | Estado |
|---|----------|----------------------|--------|
| 4c-1 | **[JS Bug]** Justificación no persiste entre sesiones de la SPA — revisar si el estado `App.state` limpia las justificaciones al navegar; asegurarse de que al volver a la vista se recarga de Sheets | `app.html` | ✅ |
| 4c-2 | **[JS Bug]** La justificación se envía de forma síncrona/bloqueante — migrar el envío al patrón estándar `google.script.run.withSuccessHandler().withFailureHandler()` mostrando spinner y permitiendo navegación mientras se procesa | `app.html` | ✅ |
| 4c-3 | **[Backend]** Permitir pre-justificación: `registrarJustificacion()` en `Asistencia.gs` debe funcionar aunque no exista registro en `Asist_Jugadores` para esa sesión — crear un registro parcial con estado `TieneJustificacion=true` pero sin estado P/A/R, o bien guardarlo en la columna de justificación independientemente | `Asistencia.gs` | ✅ |
| 4c-4 | **[Backend]** Endpoint `enviarJustificacion` en `Code.gs` debe aceptar la pre-justificación (sin registro de asistencia previo) sin devolver error | `Code.gs` | ✅ |
| 4c-5 | **[Frontend]** Vista `misEntrenamientos` y `detalleSessionJugador`: mostrar opción de justificar también en sesiones futuras/no registradas del equipo propio | `Index.html`, `app.html` | ✅ |
| 4c-6 | **[Frontend Entrenador]** Al abrir una sesión para rellenar asistencia, si algún jugador tiene pre-justificación, mostrar un aviso destacado en su fila indicando “Justificación enviada previamente: [tipo/motivo]” antes de que el entrenador marque el estado | `app.html`, `styles.html` | ✅ |
| 4c-7 | **[Backend]** `getJustificacionesSesion()` debe devolver también pre-justificaciones (registros sin estado P/A/R) para que el frontend del entrenador pueda mostrarlas | `Asistencia.gs`, `Code.gs` | ✅ |

---

### FASE 4d — Entrenadores: sustitución puntual en otro equipo

**Enfoque final (rediseñado):** Acceso puntual y efímero, sin persistir en Sheets. El entrenador pulsa "Sustituir en otro equipo", elige el equipo en un modal y navega directamente a sus sesiones. Puede registrar asistencia y añadirse como entrenador manualmente desde el formulario de sesión.

**Cambios de permisos:** Los guards de sesiones y asistencia en `Code.gs` cambian de `requireAccesoGestionEquipo` (que bloqueaba a Visor) a `requireEntrenadorOAdmin` (cualquier entrenador autenticado puede gestionar sesiones). Los guards de equipo (`actualizarEquipo`, `eliminarEquipo`) se mantienen estrictos.

**Cambios de UI en Gestión > Equipos:** Los equipos propios del entrenador se destacan con el chip verde "Mi equipo". El botón Editar solo aparece en equipos propios (o para admin). El FAB (añadir equipo) solo se muestra a admins.

| # | Subtarea | Fichero/s afectado/s | Estado |
|---|----------|----------------------|--------|
| 4d-1 | **[GS]** Cambiar guards de `generarSesionesSemana` y `crearSesionExtra` a `requireEntrenadorOAdmin` | `Code.gs` | ✅ |
| 4d-2 | **[GS]** Eliminar guard de equipo en `actualizarSesion`, `eliminarSesion`, `registrarAsistenciaJugador`, `registrarAsistenciaEntrenador`, `guardarAsistenciaCompleta`, `getJustificacionesSesion` | `Code.gs` | ✅ |
| 4d-3 | **[JS]** Botón "Sustituir en otro equipo" en vista de equipos del entrenador (solo rol entrenador) | `app.html` | ✅ |
| 4d-4 | **[JS]** Modal selector de equipos (excluye los propios) + navegación a sesiones | `app.html` | ✅ |
| 4d-5 | **[JS]** Ocultar FAB en `equipos-admin` si no es admin | `app.html` | ✅ |
| 4d-6 | **[JS]** Ocultar botón Editar en `equipo-detalle` si no es el equipo propio y no es admin | `app.html` | ✅ |
| 4d-7 | **[JS]** Chip "Mi equipo" (verde) en lista Gestión > Equipos para los equipos propios | `app.html` | ✅ |
| 4d-8 | **[CSS]** Añadir estilo `.chip-mi-equipo` | `styles.html` | ✅ |

---

### FASE 4e — Jugadores: rediseño perfil inicial y vista Mi Equipo

**Indicación original:**
> "Quiero que la vista inicial al acceder sea la de sus estadísticas, con la imagen en el centro arriba, el nombre y equipo como se ve ahora mismo. Debajo quiero en la misma línea horizontal, tres botones rectangulares que serán los de 'Mis entrenamientos', 'Mi equipo' y 'Ajustes'. Debajo de eso ya estarían las estadísticas. Además, quiero que en 'Mi Equipo' puedan ver las estadísticas de su equipo y de manera resumida la de sus compañeros. Por ejemplo haciendo un ranking de quienes han ido más."

| # | Subtarea | Fichero/s afectado/s | Estado |
|---|----------|----------------------|--------|
| 4e-1 | **[HTML]** Rediseñar `perfil-jugador`: imagen centrada arriba + nombre + equipo, luego fila horizontal con 3 botones rectangulares ("Mis entrenamientos", "Mi equipo", "Ajustes"), luego bloque de estadísticas propias | `Index.html` | ⏳ |
| 4e-2 | **[CSS]** Estilos para la fila de 3 botones rectangulares horizontales en el perfil del jugador — deben ser de igual tamaño, con buen padding y contraste | `styles.html` | ⏳ |
| 4e-3 | **[HTML]** Nueva vista `mi-equipo`: sección con estadísticas globales del equipo (% asistencia, total sesiones, etc.) y ranking de asistencia de compañeros (posición, nombre, % o nº de presencias) | `Index.html` | ⏳ |
| 4e-4 | **[CSS]** Estilos para el ranking de compañeros: filas de ranking con posición, nombre y barra/chip de porcentaje de asistencia | `styles.html` | ⏳ |
| 4e-5 | **[JS]** Routing: al acceder como jugador, la vista inicial es `perfilJugador` (ya estaba); asegurarse de que los 3 botones del rediseño naveguen a `misEntrenamientos`, `miEquipo` y `ajustesCuenta` respectivamente | `app.html` | ⏳ |
| 4e-6 | **[JS]** Nueva función `miEquipo()`: llama a `getEstadisticasEquipo(equipoId)` y a `getJugadoresByEquipo(equipoId)` en paralelo con `google.script.run`, construye el ranking de compañeros por número de presencias y renderiza la vista | `app.html` | ⏳ |
| 4e-7 | **[Backend]** `getEstadisticasEquipo()` en `Code.gs` / `Asistencia.gs` debe devolver por jugador el recuento de presencias de la temporada activa para poder construir el ranking | `Asistencia.gs`, `Code.gs` | ⏳ |

---

### FASE 4f — UX: confirmación antes de guardar y asincronía

**Indicación original:**
> "En todo proceso que se modifiquen cosas y haya que darle al botón de guardar como al guardar cambios de los ajustes de cuenta de los jugadores, se tiene que lanzar el mensaje de aviso de que se van a perder los cambios. Y guardarse en segundo plano."

| # | Subtarea | Fichero/s afectado/s | Estado |
|---|----------|----------------------|--------|
| 4f-1 | **[JS]** Implementar función genérica `confirmarYGuardar(mensaje, callbackGuardado)` que muestra un modal de confirmación antes de ejecutar cualquier guardado destructivo | `app.html` | ⏳ |
| 4f-2 | **[HTML/CSS]** Modal de confirmación genérico reutilizable (botones "Cancelar" / "Guardar de todas formas") — si ya existe un modal genérico, extenderlo | `Index.html`, `styles.html` | ⏳ |
| 4f-3 | **[JS]** Aplicar `confirmarYGuardar` en `ajustesCuenta` (cambio Usuario/PIN del jugador) | `app.html` | ⏳ |
| 4f-4 | **[JS]** Aplicar `confirmarYGuardar` en el formulario de edición de credenciales del admin (4a-3, 4a-4) | `app.html` | ⏳ |
| 4f-5 | **[JS]** Revisar todas las llamadas a `google.script.run` que no usen `withSuccessHandler`/`withFailureHandler` y migrarlas al patrón asíncrono estándar del proyecto (mostrar loading, no bloquear UI) | `app.html` | ⏳ |
| 4f-6 | **[JS]** Detectar cambios pendientes sin guardar al navegar entre vistas (dirty state): si el usuario tiene cambios sin guardar y navega a otra vista, mostrar aviso de que se perderán | `app.html` | ⏳ |

---

## Orden de implementación sugerido (Fase 4)

> Priorizado por impacto en UX y dependencias entre subtareas.

1. **4a-1, 4a-2** — Bugs críticos de admin (visibilidad botón + persistencia estado)
2. **4c-1, 4c-2** — Bugs críticos de justificaciones (persistencia + asincronía)
3. **4c-3, 4c-4, 4c-5, 4c-6, 4c-7** — Pre-justificación y aviso al entrenador
4. **4b-1 → 4b-6** — Rediseño completo de vista de sesión guardada
5. ✅ **4a-3 → 4a-6** — Edición de credenciales y mensaje de PIN en alta
6. **4e-1 → 4e-7** — Rediseño perfil jugador y Mi Equipo con ranking
7. **4d-1 → 4d-6** — Botón "Añadir otro equipo" para sustituciones
8. **4f-1 → 4f-6** — UX: confirmaciones y asincronía globales
