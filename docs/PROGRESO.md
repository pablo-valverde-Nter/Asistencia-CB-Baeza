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
| 4a — Bugs admin y credenciales | CSS, persistencia, edición segura | ✅ Completo |
| 4b — Rediseño vista sesión | Solo lectura + modo edición + estados justif. | ✅ Completo |
| 4c — Justificaciones | Persistencia, asincronía, pre-justificación | ✅ Completo |
| 4d — Entrenadores: sustitución | Botón "Sustituir en otro equipo" (acceso puntual) | ✅ Completo |
| 4e — Rediseño perfil jugador | Nueva vista inicial + Mi Equipo con ranking | ✅ Completo |
| 4f — UX: confirmación y asincronía | Aviso antes de guardar + guardado en background | ✅ Completo |
| 5a — Mejoras lista entrenadores | Orden (yo primero) + estadísticas en tarjeta | ✅ Completo |
| 5b — Mejoras lista equipos | Orden (propios primero + edad) + estadísticas | ✅ Completo |
| 5c — Mejoras lista jugadores | Agrupación por equipo + orden por rol/edad + stats | ✅ Completo |
| 5d — Mejoras vista sesiones equipo | Título descriptivo + subtítulo descriptivo | ✅ Completo |
| 5e — Mejoras sesión guardada | Más datos visibles + diferenciación visual clara | ✅ Completo |
| 6a — Pie chart en tarjetas de equipo | Donut chart P/A/R en cada tarjeta de equipo del entrenador | ✅ Completo |
| 6b — Título "Registrar Asistencia" | Cabecera de sección en la vista de equipos del entrenador | ✅ Completo |
| 6c — Filas compactas en sesión guardada | Jugadores y entrenadores con rows más pequeñas y símbolos simples | ✅ Completo |
| 6d — Eliminar botones inferiores sesión guardada | Quitar Editar y Eliminar del pie de la vista de solo lectura | ✅ Completo |

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
| 4e-1 | **[HTML]** Rediseñar `perfil-jugador`: imagen centrada arriba + nombre + equipo, luego fila horizontal con 3 botones rectangulares ("Mis entrenamientos", "Mi equipo", "Ajustes"), luego bloque de estadísticas propias | `Index.html` | ✅ |
| 4e-2 | **[CSS]** Estilos para la fila de 3 botones rectangulares horizontales en el perfil del jugador — deben ser de igual tamaño, con buen padding y contraste | `styles.html` | ✅ |
| 4e-3 | **[HTML]** Nueva vista `mi-equipo`: sección con estadísticas globales del equipo (% asistencia, total sesiones, etc.) y ranking de asistencia de compañeros (posición, nombre, % o nº de presencias) | `Index.html` | ✅ |
| 4e-4 | **[CSS]** Estilos para el ranking de compañeros: filas de ranking con posición, nombre y barra/chip de porcentaje de asistencia | `styles.html` | ✅ |
| 4e-5 | **[JS]** Routing: al acceder como jugador, la vista inicial es `perfilJugador` (ya estaba); asegurarse de que los 3 botones del rediseño naveguen a `misEntrenamientos`, `miEquipo` y `ajustesCuenta` respectivamente | `app.html` | ✅ |
| 4e-6 | **[JS]** Nueva función `miEquipo()`: construye ranking de compañeros por número de presencias usando datos en caché y renderiza la vista | `app.html` | ✅ |
| 4e-7 | **[Backend]** `getEstadisticasEquipo()` en `Code.gs` / `Informes.gs` — ya existía y devuelve recuentos por jugador | `Informes.gs`, `Code.gs` | ✅ |

---

### FASE 4f — UX: confirmación antes de guardar y asincronía

**Indicación original:**
> "En todo proceso que se modifiquen cosas y haya que darle al botón de guardar como al guardar cambios de los ajustes de cuenta de los jugadores, se tiene que lanzar el mensaje de aviso de que se van a perder los cambios. Y guardarse en segundo plano."

| # | Subtarea | Fichero/s afectado/s | Estado |
|---|----------|----------------------|--------|
| 4f-1 | **[JS]** Implementar función genérica `confirmarYGuardar(mensaje, callbackGuardado)` que muestra un modal de confirmación antes de ejecutar cualquier guardado destructivo | `app.html` | ✅ |
| 4f-2 | **[HTML/CSS]** Modal de confirmación genérico reutilizable (botones "Cancelar" / "Guardar de todas formas") — si ya existe un modal genérico, extenderlo | `Index.html`, `styles.html` | ✅ (usa modal existente) |
| 4f-3 | **[JS]** Aplicar `confirmarYGuardar` en `ajustesCuenta` (cambio Usuario/PIN del jugador) | `app.html` | ✅ |
| 4f-4 | **[JS]** Aplicar `confirmarYGuardar` en el formulario de edición de credenciales del admin (4a-3, 4a-4) | `app.html` | ✅ |
| 4f-5 | **[JS]** Revisar todas las llamadas a `google.script.run` que no usen `withSuccessHandler`/`withFailureHandler` y migrarlas al patrón asíncrono estándar del proyecto (mostrar loading, no bloquear UI) | `app.html` | ✅ (ya estaban todas migradas) |
| 4f-6 | **[JS]** Detectar cambios pendientes sin guardar al navegar entre vistas (dirty state): si el usuario tiene cambios sin guardar y navega a otra vista, mostrar aviso de que se perderán | `app.html` | ✅ (`ajustes-cuenta` añadida a `_dirtyViews`) |

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

---

---

## FASE 5 — Mejoras de UX en listas y vistas (Mayo 2026)

> Mejoras detectadas en revisión de UX. Indicaciones originales del usuario conservadas en cada bloque.

---

### FASE 5a — Lista de entrenadores: orden y estadísticas

**Indicación original:**
> "En el modo entrenador, en el apartado de Gestión, en la lista de entrenadores, deberá aparecer arriba del todo él, y luego los demás en cualquier orden. En el espacio de la derecha se puede aprovechar para incluir algunas estadísticas generales."

| # | Subtarea | Fichero/s afectado/s | Estado |
|---|----------|----------------------|--------|
| 5a-1 | **[JS]** Ordenar lista de entrenadores: el entrenador logueado aparece primero; el resto mantiene orden original | `app.html` | ✅ |
| 5a-2 | **[JS/CSS]** Añadir mini-stats en el espacio derecho de cada ítem: nº de sesiones como entrenador y % de asistencia calculado desde `asistEntrenadores` | `app.html`, `styles.html` | ✅ |

---

### FASE 5b — Lista de equipos: orden y estadísticas en tarjeta

**Indicación original:**
> "En la lista de equipos, los equipos en los que está un entrenador deberían aparecer arriba del todo, y los demás en orden de edad. Aquí también veo que hay espacio para poder mostrar estadísticas generales, aunque los elementos salgan más grandes."

Orden de categorías (de mayor a menor edad): `senior → junior → cadete → infantil → minibasket → pre-minibasket → baybasket`

| # | Subtarea | Fichero/s afectado/s | Estado |
|---|----------|----------------------|--------|
| 5b-1 | **[JS]** Reordenar equipos: los propios del entrenador van al inicio (con chip "Mi equipo"), el resto ordenado por categoría de edad descendente | `app.html` | ✅ |
| 5b-2 | **[JS/CSS]** Ampliar tarjeta de equipo: mostrar número de jugadores activos, sesiones registradas y % de asistencia media en el cuerpo de la tarjeta | `app.html`, `styles.html` | ✅ |
| 5b-3 | **[CSS]** Tarjeta de equipo más grande (más padding, layout vertical en lugar de una sola fila) con zona de estadísticas bien diferenciada | `styles.html` | ✅ |

---

### FASE 5c — Lista de jugadores: agrupación por equipo y estadísticas

**Indicación original:**
> "En la lista de Jugadores, deberían estar separados y agrupados por equipos en los que se encuentran los jugadores. Es decir, hacer una lista por equipo y ponerlas una lista seguida de la otra. Como administrador se verían los equipos de menor a mayor edad (senior, junior, cadete, infantil, mini, premini y baby). Como entrenador primero aparecen las listas de tu equipos, y luego el resto de equipos ordenados por edad. Por último, añadir también en el espacio que hay a la derecha unas estadísticas generales del jugador."

| # | Subtarea | Fichero/s afectado/s | Estado |
|---|----------|----------------------|--------|
| 5c-1 | **[JS]** Reescribir `jugadores-admin._render()`: agrupar jugadores por equipo en lugar de lista plana; renderizar un encabezado de sección por equipo seguido de los jugadores de ese equipo | `app.html` | ✅ |
| 5c-2 | **[JS]** Orden de grupos como admin: categorías de mayor a menor edad (senior → baybasket). Dentro del mismo equipo: por apellido | `app.html` | ✅ |
| 5c-3 | **[JS]** Orden de grupos como entrenador: primero sus equipos propios (en el mismo orden de edad), luego el resto de equipos ordenados por edad | `app.html` | ✅ |
| 5c-4 | **[HTML/CSS]** Estilo para el encabezado de grupo de equipo: nombre del equipo + categoría/modalidad como separador visual entre bloques | `styles.html` | ✅ |
| 5c-5 | **[JS/CSS]** Mini-stats en el ítem de jugador: mostrar a la derecha el % de presencia o nº P/A/R calculado desde `asistJugadores` | `app.html`, `styles.html` | ✅ |
| 5c-6 | **[JS]** El buscador de jugadores filtra dentro de todos los grupos manteniendo los encabezados de aquellos grupos que tengan resultados | `app.html` | ✅ |

---

### FASE 5d — Vista de sesiones del equipo: título y mejoras en tarjetas

**Indicación original:**
> "Por último, en el apartado de Equipos, podrían añadirse en los elementos más estadísticas, aunque el elemento sea más grande. Y un Título al menos que indique que ahí es donde se va a añadir la asistencia de las sesiones."

| # | Subtarea | Fichero/s afectado/s | Estado |
|---|----------|----------------------|--------|
| 5d-1 | **[HTML/JS]** Añadir título/subtítulo descriptivo en la vista `sesiones` que indique claramente que es el apartado de registro de asistencia | `Index.html`, `app.html` | ✅ |
| 5d-2 | **[JS/CSS]** Ampliar la tarjeta de sesión ya registrada: mostrar nombres de jugadores con incidencia (A/R) sin justificar, y separar visualmente las guardadas de las pendientes | `app.html`, `styles.html` | ✅ |

---

### FASE 5e — Vista sesión guardada: más datos y diferenciación visual

**Indicación original:**
> "Las sesiones, una vez guardadas, podrían mostrar más datos y de forma que se diferencia más una sesión cuando se ha guardado de cuando está en modo edición."

| # | Subtarea | Fichero/s afectado/s | Estado |
|---|----------|----------------------|--------|
| 5e-1 | **[CSS]** Estilo diferenciado para la vista `sesion-guardada`: cabecera con fondo de color, banner "Sesión registrada" bien visible, aspecto completamente distinto al formulario de edición | `styles.html` | ✅ |
| 5e-2 | **[JS]** Ampliar la información mostrada en `sesion-guardada`: resumen numérico (P/A/R totales), lista de incidencias sin justificar destacada, notas de la sesión | `app.html` | ✅ |
| 5e-3 | **[HTML]** Bloque de resumen estadístico en la parte superior de la sesión guardada (antes de la lista de jugadores): contador de P/A/R con colores | `Index.html` | ✅ |

---

## Orden de implementación sugerido (Fase 5)

> Priorizado por visibilidad inmediata y facilidad de implementación.

1. **5a-1, 5a-2** — Lista de entrenadores: orden + stats (impacto rápido, pocos cambios)
2. **5b-1, 5b-2, 5b-3** — Lista de equipos: orden + tarjeta ampliada
3. **5c-1 → 5c-6** — Lista de jugadores agrupada (más compleja, mayor impacto)
4. **5d-1, 5d-2** — Vista sesiones: título + tarjetas mejoradas
5. **5e-1, 5e-2, 5e-3** — Sesión guardada: diferenciación visual + más datos

---

---

## FASE 6 — Mejoras visuales: pie chart y depuración de sesión guardada (Mayo 2026)

> Mejoras detectadas tras revisión de la UI en dispositivo real. Indicaciones originales del usuario conservadas.

---

### FASE 6a — Pie chart en tarjetas de equipo

**Indicación original:**
> "Echo en falta una pie chart como la que he dibujado en el apartado de equipos, además de el titulo de 'Registrar Asistencia'."

| # | Subtarea | Fichero/s afectado/s | Estado |
|---|----------|----------------------|--------|
| 6a-1 | **[JS]** Añadir función `_pieCard(cP, cA, cR)` que genera SVG donut de 44×44px con sectores verde/rojo/naranja para P/A/R; gris si sin datos | `app.html` | ✅ |
| 6a-2 | **[JS]** Incluir el pie chart generado en cada `equipo-card` de la vista `equipos` (tab del entrenador), posicionado a la derecha del contenido y antes de la flecha `›` | `app.html` | ✅ |
| 6a-3 | **[CSS]** Estilo `.eq-pie-svg` para el SVG embebido (flex-shrink:0, margin) | `styles.html` | ✅ |

---

### FASE 6b — Título "Registrar Asistencia" en vista equipos

**Indicación original:**
> "…además de el titulo de 'Registrar Asistencia'."

| # | Subtarea | Fichero/s afectado/s | Estado |
|---|----------|----------------------|--------|
| 6b-1 | **[HTML]** Añadir cabecera de sección `<div class="section-hdr">` con etiqueta "Registrar Asistencia" en la parte superior de `#view-equipos` | `Index.html` | ✅ |

---

### FASE 6c — Filas compactas en sesión guardada (jugadores y entrenadores)

**Indicación original:**
> "He marcado dentro de cada asistencia, como me gustaría que los elementos dentro de la lista de JUGADORES y ENTRENADORES, se viera más pequeña y con los símbolos de asistencia más simples para diferenciarse del modo editar sesión."

| # | Subtarea | Fichero/s afectado/s | Estado |
|---|----------|----------------------|--------|
| 6c-1 | **[CSS]** Nueva clase `.jug-ro-mini` para filas compactas de jugadores (padding reducido, avatar pequeño 28px) y variantes de color P/A/R | `styles.html` | ✅ |
| 6c-2 | **[CSS]** Nueva clase `.ro-dot` (22px, circular) con variantes `.P`, `.A`, `.R`, `.none` para indicar estado de forma simple y discreta | `styles.html` | ✅ |
| 6c-3 | **[CSS]** Nueva clase `.ent-ro-mini` para filas compactas de entrenadores en modo lectura | `styles.html` | ✅ |
| 6c-4 | **[JS]** Actualizar render de jugadores en `sesion-guardada`: usar `.jug-ro-mini` + `.ro-dot` en vez de `.jug-ro-card` + `.estado-chip` | `app.html` | ✅ |
| 6c-5 | **[JS]** Actualizar render de entrenadores en `sesion-guardada`: usar `.ent-ro-mini` + `.ro-dot` en vez de `.ent-row` con badges de texto | `app.html` | ✅ |

---

### FASE 6d — Eliminar botones redundantes de la vista sesión guardada

**Indicación original:**
> "Ya que se ha añadido el botón arriba a la derecha de editar, quitaría los botones de abajo del todo de Editar y Eliminar. Dejando solo la posibilidad de borrar la sesión una vez estás editándola."

| # | Subtarea | Fichero/s afectado/s | Estado |
|---|----------|----------------------|--------|
| 6d-1 | **[HTML]** Eliminar el bloque de botones inferior (`Editar asistencia` + `Eliminar sesión`) de `#view-sesion-guardada`; el botón Editar ya está en la cabecera y el Eliminar queda en `#view-sesion` (modo edición) | `Index.html` | ✅ |

---

## Orden de implementación sugerido (Fase 6)

1. **6a-1, 6a-2, 6a-3** — Pie chart: helper JS + uso en tarjeta + CSS
2. **6b-1** — Título en vista equipos (cambio mínimo en HTML)
3. **6c-1 → 6c-5** — CSS + JS filas compactas en sesión guardada
4. **6d-1** — Eliminar botones redundantes del HTML
