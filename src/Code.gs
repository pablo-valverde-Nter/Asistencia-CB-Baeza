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
    const programacionesR      = leerHojaSegura('programacionesJustificaciones', 'Programaciones_Justificaciones');

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
      programacionesR,
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

    // ── Estadísticas agregadas (antes de sanear; el jugador solo recibe las suyas) ──
    let estadisticas = null;
    let estadisticasError = null;
    try {
      estadisticas = Estadisticas.consultar({
        temporadas: temporadasR.data, equipos: equiposR.data, horarios: horariosR.data,
        jugadores: jugadoresR.data, jugadoresEquipos: jugadoresEquiposR.data,
        entrenadores: entrenadoresR.data, entrenadoresEquipos: entrenadoresEquiposR.data,
        sesiones: sesionesR.data, asistJugadores: asistJugadoresR.data, asistEntrenadores: asistEntrenadoresR.data,
      }, { entidad: rol === CONFIG.ROLES.JUGADOR ? 'propio' : 'resumen' }, contextoEstadisticas_(contexto), ahoraMadrid_());
    } catch (e) {
      estadisticasError = e.message;
      Logger.log(`[cargarDatos:${traceId}] fallo estadisticas: ${e.message}`);
    }

    // ── Filtrado de datos sensibles según rol ──────────────────────────────────
    let jugadoresFinal    = jugadoresR.data;
    let asistJugFinal     = asistJugadoresR.data;
    let entrenFinal       = entrenadoresR.data;
    let equiposFinal      = equiposR.data;
    let jugEquiposFinal   = jugadoresEquiposR.data;
    let entEquiposFinal   = entrenadoresEquiposR.data;
    let horariosFinal     = horariosR.data;
    let sesionesFinal     = sesionesR.data;
    let asistEntFinal     = asistEntrenadoresR.data;

    if (rol === CONFIG.ROLES.JUGADOR) {
      const jugadorPropioId = contexto.jugador ? contexto.jugador.ID : null;
      const esActivo = r => r.Activo === true || r.Activo === 'TRUE';

      // Solo sus propios datos; el jugador nunca ve su CodigoPadres (es para padres)
      jugadoresFinal = jugadoresR.data.filter(j => j.ID === jugadorPropioId).map(j => {
        const s = Object.assign({}, j);
        delete s.CodigoPadres;
        return s;
      });
      jugEquiposFinal = jugadoresEquiposR.data.filter(r => r.ID_Jugador === jugadorPropioId);
      asistJugFinal = asistJugadoresR.data.filter(r => r.ID_Jugador === jugadorPropioId);
      programacionesR.data = programacionesR.data.filter(r => r.ID_Jugador === jugadorPropioId);

      const equiposActivos = new Set(jugEquiposFinal.filter(esActivo).map(r => r.ID_Equipo));
      const sesionesPropias = new Set(asistJugFinal.map(r => r.ID_Sesion));
      sesionesFinal = sesionesR.data.filter(s => equiposActivos.has(s.ID_Equipo) || sesionesPropias.has(s.ID));
      const equiposVisibles = new Set(jugEquiposFinal.map(r => r.ID_Equipo).concat(sesionesFinal.map(s => s.ID_Equipo)));
      equiposFinal = equiposR.data.filter(e => equiposVisibles.has(e.ID));
      horariosFinal = horariosR.data.filter(h => equiposActivos.has(h.ID_Equipo));

      entrenFinal = [];
      entEquiposFinal = [];
      asistEntFinal = [];
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
      supabaseRealtime:    getSupabaseRealtimeConfig_(),
      contexto:            contexto,
      jugadores:           jugadoresFinal,
      entrenadores:        entrenFinal,
      equipos:             equiposFinal,
      jugadoresEquipos:    jugEquiposFinal,
      entrenadoresEquipos: entEquiposFinal,
      horarios:            horariosFinal,
      sesiones:            sesionesFinal,
      temporadas:          temporadasR.data,
      asistJugadores:      asistJugFinal,
      asistEntrenadores:   asistEntFinal,
      programacionesJustificaciones: programacionesR.data,
      motivosJustificacion: CONFIG.MOTIVOS_JUSTIFICACION,
      estadisticas:        estadisticas,
      estadisticasError:   estadisticasError,
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

function ahoraMadrid_() { return Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd HH:mm'); }

function contextoEstadisticas_(contexto) { return { rol: contexto.rol, jugadorId: contexto.jugador ? contexto.jugador.ID : null }; }

/**
 * Estadísticas agregadas para otro periodo o un detalle (equipo, jugador, entrenador, club).
 * @param {Object} auth
 * @param {{temporadaId?:string, periodo?:string, entidad:string, id?:string}} consulta
 * @returns {Object}
 */
function getEstadisticas(auth, consulta) {
  try {
    const contexto = Auth.getContextoUsuario(auth);
    if (!contexto.success) return { success: false, error: contexto.error };
    const datos = {
      temporadas:          getSheetData(CONFIG.SHEETS.TEMPORADAS),
      equipos:             getSheetData(CONFIG.SHEETS.EQUIPOS),
      horarios:            getSheetData(CONFIG.SHEETS.HORARIOS),
      jugadores:           getSheetData(CONFIG.SHEETS.JUGADORES),
      jugadoresEquipos:    getSheetData(CONFIG.SHEETS.JUGADORES_EQUIPOS),
      entrenadores:        getSheetData(CONFIG.SHEETS.ENTRENADORES),
      entrenadoresEquipos: getSheetData(CONFIG.SHEETS.ENTRENADORES_EQUIPOS),
      sesiones:            getSheetData(CONFIG.SHEETS.SESIONES),
      asistJugadores:      getSheetData(CONFIG.SHEETS.ASIST_JUGADORES),
      asistEntrenadores:   getSheetData(CONFIG.SHEETS.ASIST_ENTRENADORES),
    };
    return {
      success: true,
      estadisticas: Estadisticas.consultar(datos, consulta || {}, contextoEstadisticas_(contexto), ahoraMadrid_()),
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
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
    const actualizado = Equipos.actualizarEquipo(equipoId, datos);
    if (!actualizado) throw new Error('No se encontró el equipo o no se pudo actualizar.');
    return { success: true, actualizado: actualizado };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function eliminarEquipo(auth, equipoId) {
  try {
    Auth.requireAccesoGestionEquipo(equipoId, auth);
    const eliminado = Equipos.eliminarEquipo(equipoId);
    if (!eliminado) throw new Error('No se encontró el equipo o no se pudo eliminar.');
    return { success: true, eliminado: eliminado };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Jugadores ─────────────────────────────────────────────────────────────────

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
    const actualizado = Equipos.actualizarJugador(jugadorId, datos);
    if (!actualizado) throw new Error('No se encontró el jugador o no se pudo actualizar.');
    return { success: true, actualizado: actualizado };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function eliminarJugador(auth, jugadorId) {
  try {
    Auth.requireEntrenadorOAdmin(auth);
    const eliminado = Equipos.eliminarJugador(jugadorId);
    if (!eliminado) throw new Error('No se encontró el jugador o no se pudo eliminar.');
    return { success: true, eliminado: eliminado };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function asignarJugadorAEquipo(auth, jugadorId, equipoId, tipo) {
  try {
    Auth.requireEntrenadorOAdmin(auth);
    const relacion = Equipos.asignarJugadorAEquipo(jugadorId, equipoId, tipo);
    if (!relacion) throw new Error('No se pudo asignar el jugador al equipo.');
    return { success: true, relacion: relacion };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function desasignarJugadorDeEquipo(auth, jugadorId, equipoId) {
  try {
    Auth.requireEntrenadorOAdmin(auth);
    const desasignado = Equipos.desasignarJugadorDeEquipo(jugadorId, equipoId);
    if (!desasignado) throw new Error('No se encontró la asignación del jugador o no se pudo quitar.');
    return { success: true, desasignado: desasignado };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Actualiza las credenciales (Usuario y/o PIN) de un jugador.
 * El propio jugador puede cambiar las suyas (requiere codigoSeguridad = CodigoPadres).
 * Entrenadores/admins pueden cambiar cualquiera sin código de seguridad.
 */
function actualizarCredencialesJugador(auth, jugadorId, nuevoUsuario, nuevoPin, nuevoCodigoPadres, codigoSeguridad) {
  try {
    const v = Auth.validate(auth);
    if (!v.success) throw new Error(v.error);
    if (Auth.isJugador(auth)) {
      const jugadorActual = Auth.getJugadorActual(auth);
      if (!jugadorActual || jugadorActual.ID !== jugadorId) {
        throw new Error('Solo puedes modificar tus propias credenciales.');
      }
      // Los jugadores deben verificar el código de seguridad (CodigoPadres)
      if (!Auth.verificarCodigoPadres(jugadorId, codigoSeguridad)) {
        throw new Error('Código de seguridad incorrecto.');
      }
      // Los jugadores no pueden cambiar su propio CodigoPadres
      if (nuevoCodigoPadres) throw new Error('Solo un administrador puede cambiar el código de familias.');
    } else {
      Auth.requireEntrenadorOAdmin(auth);
      // Solo admin puede cambiar CodigoPadres
      if (nuevoCodigoPadres && !Auth.isAdmin(auth)) throw new Error('Solo un administrador puede cambiar el código de familias.');
    }
    const actualizado = Equipos.actualizarCredencialesJugador(jugadorId, nuevoUsuario, nuevoPin, nuevoCodigoPadres);
    if (!actualizado) throw new Error('No se modificaron las credenciales.');
    return { success: true, actualizado: actualizado };
  } catch (e) { return { success: false, error: e.message }; }
}

/**
 * Permite a un jugador actualizar sus propios datos de contacto y familiares.
 * Requiere verificación del CodigoPadres como código de seguridad.
 * Entrenadores/admins pueden actualizar cualquier jugador sin código.
 */
function actualizarPerfilJugador(auth, jugadorId, datos, codigoSeguridad) {
  try {
    const v = Auth.validate(auth);
    if (!v.success) throw new Error(v.error);
    if (Auth.isJugador(auth)) {
      const jugadorActual = Auth.getJugadorActual(auth);
      if (!jugadorActual || jugadorActual.ID !== jugadorId) {
        throw new Error('Solo puedes modificar tu propio perfil.');
      }
      // Verificar código de seguridad (CodigoPadres)
      if (!Auth.verificarCodigoPadres(jugadorId, codigoSeguridad)) {
        throw new Error('Código de seguridad incorrecto.');
      }
      // Filtrar solo los campos que un jugador puede editar
      if (datos.FechaNac) {
        const fechaNacimiento = String(datos.FechaNac);
        const fechaParseada = new Date(`${fechaNacimiento}T00:00:00Z`);
        const hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento) ||
            Number.isNaN(fechaParseada.getTime()) || fechaParseada.toISOString().slice(0, 10) !== fechaNacimiento ||
            fechaNacimiento > hoy) {
          throw new Error('La fecha de nacimiento no es válida o es futura.');
        }
      }
      const camposPermitidos = ['FechaNac', 'Telefono', 'Email',
        'NombrePadre1', 'ApellidosPadre1', 'TelefonoPadre1', 'EmailPadre1',
        'NombrePadre2', 'ApellidosPadre2', 'TelefonoPadre2', 'EmailPadre2'];
      const datosFiltrados = {};
      camposPermitidos.forEach(k => { if (datos[k] !== undefined) datosFiltrados[k] = datos[k]; });
      const actualizado = Equipos.actualizarJugador(jugadorId, datosFiltrados);
      if (!actualizado) throw new Error('No se pudo actualizar el perfil.');
      return { success: true, actualizado: actualizado };
    } else {
      Auth.requireEntrenadorOAdmin(auth);
      const actualizado = Equipos.actualizarJugador(jugadorId, datos);
      if (!actualizado) throw new Error('No se pudo actualizar el perfil.');
      return { success: true, actualizado: actualizado };
    }
  } catch (e) { return { success: false, error: e.message }; }
}

// ── Entrenadores ──────────────────────────────────────────────────────────────

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

    const actualizado = Equipos.actualizarEntrenador(entrenadorId, datos, true);
    if (!actualizado) throw new Error('No se encontró el entrenador o no se pudo actualizar.');
    return { success: true, actualizado: actualizado };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function eliminarEntrenador(auth, entrenadorId) {
  try {
    Auth.requireAdmin(auth);
    const eliminado = Equipos.eliminarEntrenador(entrenadorId);
    if (!eliminado) throw new Error('No se encontró el entrenador o no se pudo eliminar.');
    return { success: true, eliminado: eliminado };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function asignarEntrenadorAEquipo(auth, entrenadorId, equipoId, tipoRol) {
  try {
    Auth.requireAdmin(auth);
    const relacion = Equipos.asignarEntrenadorAEquipo(entrenadorId, equipoId, tipoRol);
    if (!relacion) throw new Error('No se pudo asignar el entrenador al equipo.');
    return { success: true, relacion: relacion };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function desasignarEntrenadorDeEquipo(auth, entrenadorId, equipoId) {
  try {
    Auth.requireAdmin(auth);
    const desasignado = Equipos.desasignarEntrenadorDeEquipo(entrenadorId, equipoId);
    if (!desasignado) throw new Error('No se encontró la asignación del entrenador o no se pudo quitar.');
    return { success: true, desasignado: desasignado };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Sesiones ──────────────────────────────────────────────────────────────────

function generarSesionesSemana(auth, equipoId) {
  try {
    Auth.requireEntrenadorOAdmin(auth);
    return { success: true, sesiones: Sesiones.generarSesionesSemana(equipoId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function crearSesionExtra(auth, equipoId, datos) {
  try {
    Auth.requireEntrenadorOAdmin(auth);
    return { success: true, sesion: Sesiones.crearSesionExtra(equipoId, datos) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function eliminarSesion(auth, sesionId) {
  try {
    Auth.requireEntrenadorOAdmin(auth);
    return { success: true, eliminado: Sesiones.eliminarSesion(sesionId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function cancelarSesion(auth, sesionId, motivo) {
  try {
    Auth.requireEntrenadorOAdmin(auth);
    return { success: true, sesion: Sesiones.cancelarSesion(sesionId, motivo) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function reactivarSesion(auth, sesionId) {
  try {
    Auth.requireEntrenadorOAdmin(auth);
    return { success: true, sesion: Sesiones.reactivarSesion(sesionId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Asistencia ────────────────────────────────────────────────────────────────

function guardarAsistenciaCompleta(auth, sesionId, asistencias) {
  try {
    Auth.requireEntrenadorOAdmin(auth);
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

function eliminarJustificacion(auth, sesionId, jugadorId, codigoPadres) {
  try {
    const v = Auth.validate(auth);
    if (!v.success) throw new Error(v.error);
    return Asistencia.eliminarJustificacion(sesionId, jugadorId, codigoPadres);
  } catch (e) { return { success: false, error: e.message }; }
}

function crearProgramacionJustificacion(auth, jugadorId, codigoPadres, datos) {
  try {
    const v = Auth.validate(auth);
    if (!v.success || !Auth.isJugador(auth) || Auth.getJugadorActual(auth).ID !== jugadorId) throw new Error('Acceso no autorizado.');
    return { success: true, programacion: Asistencia.crearProgramacion(jugadorId, codigoPadres, datos) };
  } catch (e) { return { success: false, error: e.message }; }
}

function actualizarProgramacionJustificacion(auth, programacionId, jugadorId, codigoPadres, datos) {
  try {
    const v = Auth.validate(auth);
    if (!v.success || !Auth.isJugador(auth) || Auth.getJugadorActual(auth).ID !== jugadorId) throw new Error('Acceso no autorizado.');
    return { success: true, programacion: Asistencia.actualizarProgramacion(programacionId, jugadorId, codigoPadres, datos) };
  } catch (e) { return { success: false, error: e.message }; }
}

function eliminarProgramacionJustificacion(auth, programacionId, jugadorId, codigoPadres) {
  try {
    const v = Auth.validate(auth);
    if (!v.success || !Auth.isJugador(auth) || Auth.getJugadorActual(auth).ID !== jugadorId) throw new Error('Acceso no autorizado.');
    return { success: true, eliminado: Asistencia.eliminarProgramacion(programacionId, jugadorId, codigoPadres) };
  } catch (e) { return { success: false, error: e.message }; }
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
