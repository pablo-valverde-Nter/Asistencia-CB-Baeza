/**
 * Code.gs
 * Punto de entrada de la Web App y funciones públicas accesibles
 * desde el cliente mediante google.script.run.
 *
 * REGLA: Solo este fichero expone funciones al cliente.
 * Toda la lógica real está en los módulos internos (Equipos.gs, Sesiones.gs, etc.).
 *
 * Todas las funciones requieren el argumento 'auth' en primer lugar
 * (excepto doGet, include e iniciarSesion) para validar el PIN y el correo electrónico.
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
 * Helper para incluir ficheros CSS/JS en el HTML.
 * @param {string} filename
 * @returns {string}
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ── Autenticación Explícita ───────────────────────────────────────────────────

/**
 * Valida las credenciales de email y PIN al iniciar sesión de forma explícita.
 * Devuelve el contexto si es exitoso.
 * @param {string} email
 * @param {string} pin
 * @returns {Object}
 */
function iniciarSesion(tipo, credencial, pin) {
  try {
    let auth;
    if (tipo === 'jugador') {
      auth = { tipo: 'jugador', usuario: credencial, pin: String(pin) };
    } else {
      auth = { tipo: 'entrenador', email: credencial, pin: String(pin) };
    }
    return cargarDatos(auth);
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Contexto inicial ──────────────────────────────────────────────────────────

/**
 * Devuelve el contexto del usuario validado por email y PIN.
 * @param {Object} auth
 * @returns {Object}
 */
function getContextoUsuario(auth) {
  try {
    return Auth.getContextoUsuario(auth);
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Carga completa (una sola llamada → cliente trabaja en memoria) ─────────────

/**
 * Devuelve TODOS los datos de la app en una sola llamada al servidor.
 * El cliente los almacena en App.cache y trabaja en memoria sin más lecturas.
 * @param {Object} auth
 * @returns {Object}
 */
function cargarDatos(auth) {
  const traceId = Utilities.getUuid().slice(0, 8);

  function leerHojaSegura(nombreLogico, sheetName) {
    try {
      return { ok: true, data: getSheetData(sheetName) };
    } catch (e) {
      return { ok: false, nombreLogico: nombreLogico, sheetName: sheetName, error: e };
    }
  }

  try {
    Logger.log(`[cargarDatos:${traceId}] inicio tipo=${auth && auth.tipo} id=${auth && (auth.email || auth.usuario)}`);
    const contexto = Auth.getContextoUsuario(auth);
    if (!contexto.success) {
      Logger.log(`[cargarDatos:${traceId}] fallo contexto: ${contexto.error}`);
      return {
        success: false,
        error: contexto.error,
        stage: 'auth_context',
        traceId: traceId,
      };
    }

    const jugadoresR           = leerHojaSegura('jugadores', 'Jugadores');
    const entrenadoresR        = leerHojaSegura('entrenadores', 'Entrenadores');
    const equiposR             = leerHojaSegura('equipos', 'Equipos');
    const jugadoresEquiposR    = leerHojaSegura('jugadoresEquipos', 'Jugadores_Equipos');
    const entrenadoresEquiposR = leerHojaSegura('entrenadoresEquipos', 'Entrenadores_Equipos');
    const horariosR            = leerHojaSegura('horarios', 'Horarios');
    const sesionesR            = leerHojaSegura('sesiones', 'Sesiones');
    const temporadasR          = leerHojaSegura('temporadas', 'Temporadas');
    const asistJugadoresR      = leerHojaSegura('asistJugadores', 'Asist_Jugadores');
    const asistEntrenadoresR   = leerHojaSegura('asistEntrenadores', 'Asist_Entrenadores');

    const resultados = [
      jugadoresR,
      entrenadoresR,
      equiposR,
      jugadoresEquiposR,
      entrenadoresEquiposR,
      horariosR,
      sesionesR,
      temporadasR,
      asistJugadoresR,
      asistEntrenadoresR,
    ];

    const fallo = resultados.find(r => !r.ok);
    if (fallo) {
      const mensaje = `Error cargando hoja ${fallo.sheetName}: ${fallo.error.message}`;
      Logger.log(`[cargarDatos:${traceId}] ${mensaje}`);
      return {
        success: false,
        error: mensaje,
        stage: 'sheet_load',
        failedSheet: fallo.sheetName,
        traceId: traceId,
      };
    }

    const rol = contexto.rol;

    // ── Filtrado de datos sensibles según rol ──────────────────────────────────
    let jugadoresFinal    = jugadoresR.data;
    let asistJugFinal     = asistJugadoresR.data;
    let entrenFinal       = entrenadoresR.data;

    if (rol === CONFIG.ROLES.JUGADOR) {
      const jugadorPropioId = contexto.jugador ? contexto.jugador.ID : null;

      // Jugadores: datos completos para el propio (sin CodigoPadres) y solo campos básicos para terceros
      jugadoresFinal = jugadoresR.data.map(j => {
        if (j.ID === jugadorPropioId) {
          const s = Object.assign({}, j);
          delete s.CodigoPadres;   // El jugador nunca ve su propio CodigoPadres (es para padres)
          return s;
        }
        return { ID: j.ID, Nombre: j.Nombre, Apellidos: j.Apellidos,
                 FotoURL: j.FotoURL || '', Dorsal: j.Dorsal || '' };
      });

      // Asistencias: propias completas; las de otros solo Estado (sin justificación)
      asistJugFinal = asistJugadoresR.data.map(r => {
        if (r.ID_Jugador === jugadorPropioId) return r;
        return { ID: r.ID, ID_Sesion: r.ID_Sesion, ID_Jugador: r.ID_Jugador,
                 Estado: r.Estado, EsInvitado: r.EsInvitado, FechaRegistro: r.FechaRegistro };
      });

      // Entrenadores: datos básicos, sin PIN
      entrenFinal = entrenadoresR.data.map(e => ({
        ID: e.ID, Nombre: e.Nombre, Apellidos: e.Apellidos, EsAdmin: e.EsAdmin || false,
      }));
    } else if (rol === CONFIG.ROLES.ENTRENADOR) {
      // Entrenadores no ven el PIN de sus compañeros entrenadores
      entrenFinal = entrenadoresR.data.map(e => {
        const s = Object.assign({}, e);
        delete s.PIN;
        return s;
      });
    }
    // Admin: datos completos en todas las hojas

    Logger.log(`[cargarDatos:${traceId}] ok rol=${rol}`);

    return {
      success:             true,
      traceId:             traceId,
      contexto:            contexto,
      jugadores:           jugadoresFinal,
      entrenadores:        entrenFinal,
      equipos:             equiposR.data,
      jugadoresEquipos:    jugadoresEquiposR.data,
      entrenadoresEquipos: entrenadoresEquiposR.data,
      horarios:            horariosR.data,
      sesiones:            sesionesR.data,
      temporadas:          temporadasR.data,
      asistJugadores:      asistJugFinal,
      asistEntrenadores:   asistEntrenadoresR.data,
      motivosJustificacion: CONFIG.MOTIVOS_JUSTIFICACION,
    };
  } catch (e) {
    Logger.log(`[cargarDatos:${traceId}] excepcion inesperada: ${e.message}`);
    return {
      success: false,
      error: e.message,
      stage: 'unexpected',
      traceId: traceId,
    };
  }
}

// ── Temporadas ────────────────────────────────────────────────────────────────

function getTemporadaActiva(auth) {
  try {
    const v = Auth.validate(auth);
    if (!v.success) throw new Error(v.error);
    const temporadas = getSheetData(CONFIG.SHEETS.TEMPORADAS);
    const activa = temporadas.find(t => t.Activa === true || t.Activa === 'TRUE');
    return { success: true, temporada: activa || null };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── Equipos ───────────────────────────────────────────────────────────────────

function getEquipos(auth) {
  try {
    const v = Auth.validate(auth);
    if (!v.success) throw new Error(v.error);
    return { success: true, equipos: Equipos.getEquipos() };
  } catch (e) { return { success: false, error: e.message }; }
}

function getEquipoById(auth, equipoId) {
  try {
    const v = Auth.validate(auth);
    if (!v.success) throw new Error(v.error);
    return { success: true, equipo: Equipos.getEquipoById(equipoId) };
  } catch (e) { return { success: false, error: e.message }; }
}

function crearEquipo(auth, datos) {
  try {
    Auth.requireEntrenadorOAdmin(auth);
    return { success: true, equipo: Equipos.crearEquipo(datos) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function actualizarEquipo(auth, equipoId, datos) {
  try {
    Auth.requireAccesoGestionEquipo(equipoId, auth);
    return { success: true, actualizado: Equipos.actualizarEquipo(equipoId, datos) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function eliminarEquipo(auth, equipoId) {
  try {
    Auth.requireAccesoGestionEquipo(equipoId, auth);
    return { success: true, eliminado: Equipos.eliminarEquipo(equipoId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Jugadores ─────────────────────────────────────────────────────────────────

function getJugadores(auth) {
  try {
    const v = Auth.validate(auth);
    if (!v.success) throw new Error(v.error);
    return { success: true, jugadores: Equipos.getJugadores() };
  } catch (e) { return { success: false, error: e.message }; }
}

function getJugadoresByEquipo(auth, equipoId) {
  try {
    const v = Auth.validate(auth);
    if (!v.success) throw new Error(v.error);
    return { success: true, jugadores: Equipos.getJugadoresByEquipo(equipoId) };
  } catch (e) { return { success: false, error: e.message }; }
}

function crearJugador(auth, datos) {
  try {
    Auth.requireEntrenadorOAdmin(auth);
    return { success: true, jugador: Equipos.crearJugador(datos) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function actualizarJugador(auth, jugadorId, datos) {
  try {
    Auth.requireEntrenadorOAdmin(auth);
    return { success: true, actualizado: Equipos.actualizarJugador(jugadorId, datos) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function eliminarJugador(auth, jugadorId) {
  try {
    Auth.requireEntrenadorOAdmin(auth);
    return { success: true, eliminado: Equipos.eliminarJugador(jugadorId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function asignarJugadorAEquipo(auth, jugadorId, equipoId, tipo) {
  try {
    Auth.requireEntrenadorOAdmin(auth);
    return { success: true, relacion: Equipos.asignarJugadorAEquipo(jugadorId, equipoId, tipo) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function desasignarJugadorDeEquipo(auth, jugadorId, equipoId) {
  try {
    Auth.requireEntrenadorOAdmin(auth);
    return { success: true, desasignado: Equipos.desasignarJugadorDeEquipo(jugadorId, equipoId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Actualiza las credenciales (Usuario y/o PIN) de un jugador.
 * El propio jugador puede cambiar las suyas; entrenadores/admins pueden cambiar cualquiera.
 */
function actualizarCredencialesJugador(auth, jugadorId, nuevoUsuario, nuevoPin, nuevoCodigoPadres) {
  try {
    const v = Auth.validate(auth);
    if (!v.success) throw new Error(v.error);
    if (Auth.isJugador(auth)) {
      const jugadorActual = Auth.getJugadorActual(auth);
      if (!jugadorActual || jugadorActual.ID !== jugadorId) {
        throw new Error('Solo puedes modificar tus propias credenciales.');
      }
      // Los jugadores no pueden cambiar su propio CodigoPadres
      if (nuevoCodigoPadres) throw new Error('Solo un administrador puede cambiar el código de familias.');
    } else {
      Auth.requireEntrenadorOAdmin(auth);
      // Solo admin puede cambiar CodigoPadres
      if (nuevoCodigoPadres && !Auth.isAdmin(auth)) throw new Error('Solo un administrador puede cambiar el código de familias.');
    }
    return { success: true, actualizado: Equipos.actualizarCredencialesJugador(jugadorId, nuevoUsuario, nuevoPin, nuevoCodigoPadres) };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── Entrenadores ──────────────────────────────────────────────────────────────

function getEntrenadores(auth) {
  try {
    const v = Auth.validate(auth);
    if (!v.success) throw new Error(v.error);
    return { success: true, entrenadores: Equipos.getEntrenadores() };
  } catch (e) { return { success: false, error: e.message }; }
}

function getEntrenadoresByEquipo(auth, equipoId) {
  try {
    const v = Auth.validate(auth);
    if (!v.success) throw new Error(v.error);
    return { success: true, entrenadores: Equipos.getEntrenadoresByEquipo(equipoId) };
  } catch (e) { return { success: false, error: e.message }; }
}

function crearEntrenador(auth, datos) {
  try {
    Auth.requireAdmin(auth);
    return { success: true, entrenador: Equipos.crearEntrenador(datos) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function actualizarEntrenador(auth, entrenadorId, datos) {
  try {
    let permiteEdicion = false;
    let isAdmin = Auth.isAdmin(auth);
    if (isAdmin) {
      permiteEdicion = true;
    } else {
      const ent = Auth.getEntrenadorActual(auth);
      if (ent && ent.ID === entrenadorId) {
        permiteEdicion = true;
      }
    }
    
    if (!permiteEdicion) {
      throw new Error('No tienes permisos para editar este entrenador.');
    }

    return { success: true, actualizado: Equipos.actualizarEntrenador(entrenadorId, datos, true) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function eliminarEntrenador(auth, entrenadorId) {
  try {
    Auth.requireAdmin(auth);
    return { success: true, eliminado: Equipos.eliminarEntrenador(entrenadorId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function asignarEntrenadorAEquipo(auth, entrenadorId, equipoId, tipoRol) {
  try {
    Auth.requireAdmin(auth);
    return { success: true, relacion: Equipos.asignarEntrenadorAEquipo(entrenadorId, equipoId, tipoRol) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function desasignarEntrenadorDeEquipo(auth, entrenadorId, equipoId) {
  try {
    Auth.requireAdmin(auth);
    return { success: true, desasignado: Equipos.desasignarEntrenadorDeEquipo(entrenadorId, equipoId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/** Añade un equipo a la lista de Visor del entrenador autenticado */
function añadirEquipoVisor(auth, equipoId) {
  try {
    Auth.requireEntrenadorOAdmin(auth);
    const ent = Auth.getEntrenadorActual(auth);
    if (!ent) throw new Error('No se encontró el entrenador.');
    return { success: true, relacion: Equipos.añadirEquipoVisor(ent.ID, equipoId) };
  } catch (e) { return { success: false, error: e.message }; }
}

/** Elimina un equipo de la lista de Visor del entrenador autenticado */
function eliminarEquipoVisor(auth, equipoId) {
  try {
    Auth.requireEntrenadorOAdmin(auth);
    const ent = Auth.getEntrenadorActual(auth);
    if (!ent) throw new Error('No se encontró el entrenador.');
    return { success: true, eliminado: Equipos.eliminarEquipoVisor(ent.ID, equipoId) };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── Sesiones ──────────────────────────────────────────────────────────────────

function getSesionesByEquipo(auth, equipoId) {
  try {
    const v = Auth.validate(auth);
    if (!v.success) throw new Error(v.error);
    return { success: true, sesiones: Sesiones.getSesionesByEquipo(equipoId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function generarSesionesSemana(auth, equipoId) {
  try {
    Auth.requireAccesoGestionEquipo(equipoId, auth);
    return { success: true, sesiones: Sesiones.generarSesionesSemana(equipoId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function crearSesionExtra(auth, equipoId, datos) {
  try {
    Auth.requireAccesoGestionEquipo(equipoId, auth);
    return { success: true, sesion: Sesiones.crearSesionExtra(equipoId, datos) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function actualizarSesion(auth, sesionId, datos) {
  try {
    const v = Auth.validate(auth);
    if (!v.success) throw new Error(v.error);
    const sesion = findById(CONFIG.SHEETS.SESIONES, sesionId);
    if (sesion) Auth.requireAccesoGestionEquipo(sesion.ID_Equipo, auth);
    return { success: true, actualizado: Sesiones.actualizarSesion(sesionId, datos) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function eliminarSesion(auth, sesionId) {
  try {
    const v = Auth.validate(auth);
    if (!v.success) throw new Error(v.error);
    const sesion = findById(CONFIG.SHEETS.SESIONES, sesionId);
    if (sesion) Auth.requireAccesoGestionEquipo(sesion.ID_Equipo, auth);
    return { success: true, eliminado: Sesiones.eliminarSesion(sesionId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Asistencia ────────────────────────────────────────────────────────────────

function getAsistenciaSesion(auth, sesionId) {
  try {
    const v = Auth.validate(auth);
    if (!v.success) throw new Error(v.error);
    const sesion = findById(CONFIG.SHEETS.SESIONES, sesionId);
    if (sesion) Auth.requireAccesoLecturaEquipo(sesion.ID_Equipo, auth);
    return { success: true, asistencia: Asistencia.getAsistenciaSesion(sesionId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function registrarAsistenciaJugador(auth, sesionId, jugadorId, estado, esInvitado) {
  try {
    const v = Auth.validate(auth);
    if (!v.success) throw new Error(v.error);
    const sesion = findById(CONFIG.SHEETS.SESIONES, sesionId);
    if (sesion) Auth.requireAccesoGestionEquipo(sesion.ID_Equipo, auth);
    return { success: true, registro: Asistencia.registrarAsistenciaJugador(sesionId, jugadorId, estado, esInvitado) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function registrarAsistenciaEntrenador(auth, sesionId, entrenadorId, asistio, esInvitado) {
  try {
    const v = Auth.validate(auth);
    if (!v.success) throw new Error(v.error);
    const sesion = findById(CONFIG.SHEETS.SESIONES, sesionId);
    if (sesion) Auth.requireAccesoGestionEquipo(sesion.ID_Equipo, auth);
    return { success: true, registro: Asistencia.registrarAsistenciaEntrenador(sesionId, entrenadorId, asistio, esInvitado) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function guardarAsistenciaCompleta(auth, sesionId, asistencias) {
  try {
    const v = Auth.validate(auth);
    if (!v.success) throw new Error(v.error);
    const sesion = findById(CONFIG.SHEETS.SESIONES, sesionId);
    if (sesion) Auth.requireAccesoGestionEquipo(sesion.ID_Equipo, auth);
    return Asistencia.guardarAsistenciaCompleta(sesionId, asistencias);
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Envía una justificación de ausencia/retraso.
 * Accesible por cualquier usuario autenticado: el CodigoPadres es la autorización real.
 */
function enviarJustificacion(auth, sesionId, jugadorId, codigoPadres, tipoIncidencia, motivo, detalle, horaIncorporacion) {
  try {
    const v = Auth.validate(auth);
    if (!v.success) throw new Error(v.error);
    return Asistencia.registrarJustificacion(sesionId, jugadorId, codigoPadres, tipoIncidencia, motivo, detalle, horaIncorporacion);
  } catch (e) { return { success: false, error: e.message }; }
}

/** Devuelve las justificaciones de una sesión — solo entrenadores/admins */
function getJustificacionesSesion(auth, sesionId) {
  try {
    Auth.requireEntrenadorOAdmin(auth);
    const sesion = findById(CONFIG.SHEETS.SESIONES, sesionId);
    if (sesion) Auth.requireAccesoLecturaEquipo(sesion.ID_Equipo, auth);
    return { success: true, justificaciones: Asistencia.getJustificacionesSesion(sesionId) };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── Informes ──────────────────────────────────────────────────────────────────

function getEstadisticasEquipo(auth, equipoId, temporadaId) {
  try {
    const v = Auth.validate(auth);
    if (!v.success) throw new Error(v.error);
    return { success: true, estadisticas: Informes.getEstadisticasEquipo(equipoId, temporadaId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/** Estadísticas de asistencia de un jugador concreto — todos los roles */
function getEstadisticasJugador(auth, jugadorId) {
  try {
    const v = Auth.validate(auth);
    if (!v.success) throw new Error(v.error);
    return { success: true, estadisticas: Informes.getEstadisticasJugador(jugadorId) };
  } catch (e) { return { success: false, error: e.message }; }
}

function exportarInformeASheets(auth, equipoId, temporadaId) {
  try {
    Auth.requireAdmin(auth);
    return { success: true, url: Informes.exportarASheets(equipoId, temporadaId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function setHorariosEquipo(auth, equipoId, horarios) {
  try {
    Auth.requireAccesoGestionEquipo(equipoId, auth);
    return { success: true, actualizado: Equipos.setHorariosEquipo(equipoId, horarios) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Trigger semanal de generación automática de sesiones ──────────────────────

/**
 * Handler del trigger de tiempo. Se ejecuta automáticamente cada lunes a las 6:00.
 * DEBE ser una función de nivel superior (no un método de objeto).
 */
function triggerGenerarSesiones() {
  try {
    Sesiones.generarSesionesSemanaGlobal();
  } catch (e) {
    Logger.log('Error en trigger semanal: ' + e.message);
  }
}

/**
 * Recibe trazas de diagnóstico desde cliente para localizar rebotes de navegación.
 * No requiere auth para poder registrar errores previos al login.
 * @param {string} evento
 * @param {Object=} data
 * @returns {{success:boolean}}
 */
function logCliente(evento, data) {
  try {
    const payload = data || {};
    Logger.log(`[cliente] ${evento} ${JSON.stringify(payload)}`);
    return { success: true };
  } catch (e) {
    Logger.log(`[cliente] logCliente error: ${e.message}`);
    return { success: false, error: e.message };
  }
}
