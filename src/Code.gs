/**
 * Code.gs
 * Punto de entrada de la Web App y funciones públicas accesibles
 * desde el cliente mediante google.script.run.
 *
 * REGLA: Solo este fichero expone funciones al cliente.
 * Toda la lógica real está en los módulos internos (Equipos.gs, Sesiones.gs, etc.).
 */

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Sirve la aplicación web.
 * @returns {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet() {
  return HtmlService.createTemplateFromFile('ui/Index')
    .evaluate()
    .setTitle('CB Baeza — Asistencia')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Helper para incluir ficheros CSS/JS en el HTML (usa <?!= include('ui/styles') ?>).
 * @param {string} filename
 * @returns {string}
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ── Contexto inicial ──────────────────────────────────────────────────────────

/**
 * Devuelve el contexto del usuario que ha iniciado sesión:
 * su perfil de entrenador, rol y equipos asignados.
 * Es la primera llamada que hace la SPA al cargar.
 * @returns {{ success: boolean, usuario: Object|null, esAdmin: boolean, equipos: Object[] }}
 */
function getContextoUsuario() {
  try {
    return Auth.getContextoUsuario();
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Temporadas ────────────────────────────────────────────────────────────────

function getTemporadaActiva() {
  try {
    const temporadas = getSheetData(CONFIG.SHEETS.TEMPORADAS);
    const activa = temporadas.find(t => t.Activa === true || t.Activa === 'TRUE');
    return { success: true, temporada: activa || null };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Equipos ───────────────────────────────────────────────────────────────────

function getEquipos() {
  try {
    return { success: true, equipos: Equipos.getEquipos() };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getEquipoById(equipoId) {
  try {
    return { success: true, equipo: Equipos.getEquipoById(equipoId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function crearEquipo(datos) {
  try {
    Auth.requireAdmin();
    return { success: true, equipo: Equipos.crearEquipo(datos) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function actualizarEquipo(equipoId, datos) {
  try {
    Auth.requireAdmin();
    return { success: true, actualizado: Equipos.actualizarEquipo(equipoId, datos) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function eliminarEquipo(equipoId) {
  try {
    Auth.requireAdmin();
    return { success: true, eliminado: Equipos.eliminarEquipo(equipoId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Jugadores ─────────────────────────────────────────────────────────────────

function getJugadores() {
  try {
    return { success: true, jugadores: Equipos.getJugadores() };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getJugadoresByEquipo(equipoId) {
  try {
    return { success: true, jugadores: Equipos.getJugadoresByEquipo(equipoId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function crearJugador(datos) {
  try {
    Auth.requireAdmin();
    return { success: true, jugador: Equipos.crearJugador(datos) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function actualizarJugador(jugadorId, datos) {
  try {
    Auth.requireAdmin();
    return { success: true, actualizado: Equipos.actualizarJugador(jugadorId, datos) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function asignarJugadorAEquipo(jugadorId, equipoId, tipo) {
  try {
    Auth.requireAdmin();
    return { success: true, relacion: Equipos.asignarJugadorAEquipo(jugadorId, equipoId, tipo) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function desasignarJugadorDeEquipo(jugadorId, equipoId) {
  try {
    Auth.requireAdmin();
    return { success: true, desasignado: Equipos.desasignarJugadorDeEquipo(jugadorId, equipoId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Entrenadores ──────────────────────────────────────────────────────────────

function getEntrenadores() {
  try {
    return { success: true, entrenadores: Equipos.getEntrenadores() };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getEntrenadoresByEquipo(equipoId) {
  try {
    return { success: true, entrenadores: Equipos.getEntrenadoresByEquipo(equipoId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function crearEntrenador(datos) {
  try {
    Auth.requireAdmin();
    return { success: true, entrenador: Equipos.crearEntrenador(datos) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function actualizarEntrenador(entrenadorId, datos) {
  try {
    Auth.requireAdmin();
    return { success: true, actualizado: Equipos.actualizarEntrenador(entrenadorId, datos) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function asignarEntrenadorAEquipo(entrenadorId, equipoId) {
  try {
    Auth.requireAdmin();
    return { success: true, relacion: Equipos.asignarEntrenadorAEquipo(entrenadorId, equipoId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function desasignarEntrenadorDeEquipo(entrenadorId, equipoId) {
  try {
    Auth.requireAdmin();
    return { success: true, desasignado: Equipos.desasignarEntrenadorDeEquipo(entrenadorId, equipoId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Sesiones ──────────────────────────────────────────────────────────────────

function getSesionesByEquipo(equipoId) {
  try {
    Auth.requireAccesoEquipo(equipoId);
    return { success: true, sesiones: Sesiones.getSesionesByEquipo(equipoId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function generarSesionesSemana(equipoId) {
  try {
    Auth.requireAccesoEquipo(equipoId);
    return { success: true, sesiones: Sesiones.generarSesionesSemana(equipoId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function crearSesionExtra(equipoId, datos) {
  try {
    Auth.requireAccesoEquipo(equipoId);
    return { success: true, sesion: Sesiones.crearSesionExtra(equipoId, datos) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function actualizarSesion(sesionId, datos) {
  try {
    return { success: true, actualizado: Sesiones.actualizarSesion(sesionId, datos) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function eliminarSesion(sesionId) {
  try {
    return { success: true, eliminado: Sesiones.eliminarSesion(sesionId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Asistencia ────────────────────────────────────────────────────────────────

function getAsistenciaSesion(sesionId) {
  try {
    return { success: true, asistencia: Asistencia.getAsistenciaSesion(sesionId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function registrarAsistenciaJugador(sesionId, jugadorId, estado, esInvitado) {
  try {
    return { success: true, registro: Asistencia.registrarAsistenciaJugador(sesionId, jugadorId, estado, esInvitado) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function registrarAsistenciaEntrenador(sesionId, entrenadorId, asistio, esInvitado) {
  try {
    return { success: true, registro: Asistencia.registrarAsistenciaEntrenador(sesionId, entrenadorId, asistio, esInvitado) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function guardarAsistenciaCompleta(sesionId, asistencias) {
  try {
    return Asistencia.guardarAsistenciaCompleta(sesionId, asistencias);
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Informes ──────────────────────────────────────────────────────────────────

function getEstadisticasEquipo(equipoId, temporadaId) {
  try {
    return { success: true, estadisticas: Informes.getEstadisticasEquipo(equipoId, temporadaId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function exportarInformeASheets(equipoId, temporadaId) {
  try {
    Auth.requireAdmin();
    return { success: true, url: Informes.exportarASheets(equipoId, temporadaId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
