/**
 * Sesiones.gs
 * Generación y gestión de sesiones de entrenamiento.
 * Todas las funciones son internas; se exponen al cliente a través de Code.gs.
 */

const Sesiones = {

  // ══════════════════════════════════════════════════════════════════════════════
  // CONSULTAS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Devuelve todas las sesiones de un equipo ordenadas por fecha descendente.
   * @param {string} equipoId
   * @returns {Object[]}
   */
  getSesionesByEquipo(equipoId) {
    return findWhere(CONFIG.SHEETS.SESIONES, 'ID_Equipo', equipoId)
      .sort((a, b) => b.Fecha.localeCompare(a.Fecha));
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // GENERACIÓN AUTOMÁTICA
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Genera las sesiones de la semana actual para un equipo según su patrón de Horarios.
   * Si una sesión ya existe para esa fecha y hora, no se duplica.
   * @param {string} equipoId
   * @returns {{ creadas: Object[], existentes: number }}
   */
  generarSesionesSemana(equipoId) {
    const horarios = findWhere(CONFIG.SHEETS.HORARIOS, 'ID_Equipo', equipoId);
    if (horarios.length === 0) {
      throw new Error('El equipo no tiene horario configurado. Añade el patrón semanal primero.');
    }

    const temporadaId = Sesiones._getTemporadaActivaId_();
    const lunes       = Sesiones._getLunesSemanaActual_();
    const sesionesActuales = Sesiones.getSesionesByEquipo(equipoId);

    const creadas = [];
    horarios.forEach(h => {
      const diaSemana  = Number(h.DiaSemana); // 1=Lunes … 7=Domingo
      const fechaSesion = Sesiones._sumarDias_(lunes, diaSemana - 1);
      const fechaStr    = Sesiones._formatDate_(fechaSesion);

      // Evitar duplicados: misma fecha y hora de inicio
      const yaExiste = sesionesActuales.some(
        s => s.Fecha === fechaStr && s.HoraInicio === h.HoraInicio
      );
      if (yaExiste) return;

      const sesion = appendRow(CONFIG.SHEETS.SESIONES, {
        ID_Equipo:   equipoId,
        ID_Temporada: temporadaId,
        ID_Horario:   h.ID,
        Fecha:       fechaStr,
        HoraInicio:  h.HoraInicio,
        HoraFin:     h.HoraFin,
        EsExtra:     false,
        Cancelada:   false,
        Notas:       '',
      });
      Asistencia.aplicarProgramacionesSesion(sesion);
      creadas.push(sesion);
    });

    sesionesActuales.forEach(sesion => {
      if (sesion.Fecha >= Sesiones._formatDate_(lunes) && sesion.Fecha <= Sesiones._formatDate_(Sesiones._sumarDias_(lunes, 6))) {
        Asistencia.aplicarProgramacionesSesion(sesion);
      }
    });

    return {
      creadas:    creadas,
      existentes: horarios.length - creadas.length,
    };
  },

  /**
   * Genera sesiones para todos los equipos de la temporada activa.
   * Útil para ejecutar como trigger semanal.
   * @returns {{ equipoId: string, creadas: number }[]}
   */
  generarSesionesSemanaGlobal() {
    const temporadaId = Sesiones._getTemporadaActivaId_();
    const equipos     = findWhere(CONFIG.SHEETS.EQUIPOS, 'ID_Temporada', temporadaId);
    const resultados  = [];

    equipos.forEach(equipo => {
      try {
        const result = Sesiones.generarSesionesSemana(equipo.ID);
        resultados.push({ equipoId: equipo.ID, nombre: equipo.Nombre, creadas: result.creadas.length });
      } catch (e) {
        resultados.push({ equipoId: equipo.ID, nombre: equipo.Nombre, creadas: 0, error: e.message });
      }
    });

    return resultados;
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // CRUD DE SESIONES
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Crea una sesión extra (fuera del patrón semanal) para un equipo.
   * @param {string} equipoId
   * @param {{ Fecha: string, HoraInicio: string, HoraFin: string, Notas?: string }} datos
   * @returns {Object} Sesión creada.
   */
  crearSesionExtra(equipoId, datos) {
    if (!datos.Fecha || !datos.HoraInicio || !datos.HoraFin) {
      throw new Error('Fecha, hora de inicio y hora de fin son obligatorios.');
    }
    Sesiones._validarFecha_(datos.Fecha);
    Sesiones._validarHora_(datos.HoraInicio);
    Sesiones._validarHora_(datos.HoraFin);

    const temporadaId = Sesiones._getTemporadaActivaId_();
    return appendRow(CONFIG.SHEETS.SESIONES, {
      ID_Equipo:    equipoId,
      ID_Temporada: temporadaId,
      ID_Horario:   null,
      Fecha:        datos.Fecha,
      HoraInicio:   datos.HoraInicio,
      HoraFin:      datos.HoraFin,
      EsExtra:      true,
      Cancelada:    false,
      Notas:        datos.Notas || '',
    });
  },

  /**
   * Elimina una sesión y en cascada todas sus asistencias.
   * @param {string} sesionId
   * @returns {boolean}
   */
  eliminarSesion(sesionId) {
    deleteWhere(CONFIG.SHEETS.ASIST_JUGADORES,    'ID_Sesion', sesionId);
    deleteWhere(CONFIG.SHEETS.ASIST_ENTRENADORES, 'ID_Sesion', sesionId);
    return deleteRow(CONFIG.SHEETS.SESIONES, sesionId);
  },

  /**
   * Cancela una sesión sin asistencia guardada. El canal de aviso se guarda después, con registrarAvisoCancelacion.
   * @param {string} sesionId
   * @param {string} motivo   - Uno de CONFIG.MOTIVOS_CANCELACION
   * @param {string} [detalle] - Texto libre opcional (se guarda en DetalleCancelacion)
   * @param {string} canceladoPor - Nombre de la identidad autenticada
   * @returns {Object} Sesión actualizada.
   */
  cancelarSesion(sesionId, motivo, detalle, canceladoPor) {
    if (!CONFIG.MOTIVOS_CANCELACION.includes(motivo)) throw new Error('Motivo de cancelación no válido.');
    const texto = Sesiones._detalleCancelacion_(detalle);
    const sesion = findById(CONFIG.SHEETS.SESIONES, sesionId);
    if (!sesion) throw new Error('Sesión no encontrada.');
    if (sesion.Cancelada === true || sesion.Cancelada === 'TRUE') throw new Error('La sesión ya está cancelada.');
    if (sesion.AsistenciaGuardada === true || sesion.AsistenciaGuardada === 'TRUE') {
      throw new Error('No se puede cancelar una sesión con asistencia guardada. Elimínala si fue un error.');
    }
    const cambios = { Cancelada: true, MotivoCancelacion: motivo, DetalleCancelacion: texto || null,
      FechaCancelacion: Asistencia._timestamp_(), CanceladoPor: canceladoPor || 'CB Baeza', CanalAvisoCancelacion: null };
    updateRow(CONFIG.SHEETS.SESIONES, sesionId, cambios);
    return { ...sesion, ...cambios };
  },

  /**
   * Guarda el canal de aviso de una sesión ya cancelada. Solo una vez; no reenvía si ya había un canal.
   * @param {string} sesionId
   * @param {string} canal - Uno de CONFIG.CANALES_AVISO_CANCELACION
   * @returns {Object} Sesión actualizada.
   */
  registrarAvisoCancelacion(sesionId, canal) {
    if (!CONFIG.CANALES_AVISO_CANCELACION.includes(canal)) throw new Error('Forma de aviso no válida.');
    const sesion = findById(CONFIG.SHEETS.SESIONES, sesionId);
    if (!sesion) throw new Error('Sesión no encontrada.');
    if (sesion.Cancelada !== true && sesion.Cancelada !== 'TRUE') throw new Error('La sesión no está cancelada.');
    if (sesion.CanalAvisoCancelacion) throw new Error('El aviso a las familias ya está registrado.');
    const cambios = { CanalAvisoCancelacion: canal };
    updateRow(CONFIG.SHEETS.SESIONES, sesionId, cambios);
    return { ...sesion, ...cambios };
  },

  reactivarSesion(sesionId) {
    const sesion = findById(CONFIG.SHEETS.SESIONES, sesionId);
    if (!sesion) throw new Error('Sesión no encontrada.');
    const cambios = { Cancelada: false, MotivoCancelacion: null, DetalleCancelacion: null, FechaCancelacion: null,
      CanceladoPor: null, CanalAvisoCancelacion: null };
    updateRow(CONFIG.SHEETS.SESIONES, sesionId, cambios);
    return { ...sesion, ...cambios };
  },

  /**
   * Jugadores previstos en una sesión, como los pinta el pase de lista: la plantilla activa del equipo
   * (principales y secundarios) y los invitados guardados en ella, sin los quitados de la lista (Excluido).
   * @param {Object} sesion
   * @returns {Object[]} Registros de Jugadores.
   */
  convocados(sesion) {
    const esVerdadero = valor => valor === true || valor === 'TRUE';
    const registros = findWhere(CONFIG.SHEETS.ASIST_JUGADORES, 'ID_Sesion', sesion.ID);
    const ids = new Set(findWhere(CONFIG.SHEETS.JUGADORES_EQUIPOS, 'ID_Equipo', sesion.ID_Equipo)
      .filter(r => esVerdadero(r.Activo)).map(r => String(r.ID_Jugador)));
    registros.filter(r => esVerdadero(r.EsInvitado)).forEach(r => ids.add(String(r.ID_Jugador)));
    registros.filter(r => esVerdadero(r.Excluido)).forEach(r => ids.delete(String(r.ID_Jugador)));
    return ids.size ? findWhereIn(CONFIG.SHEETS.JUGADORES, 'ID', [...ids]) : [];
  },

  // Detalle opcional de la cancelación en una sola línea (también va en la plantilla de WhatsApp, que no admite saltos).
  _detalleCancelacion_(detalle) {
    if (detalle === undefined || detalle === null) return '';
    if (typeof detalle !== 'string') throw new Error('Detalle de cancelación no válido.');
    const texto = detalle.replace(/\s+/g, ' ').trim();
    if (texto.length > CONFIG.MAX_DETALLE_CANCELACION) {
      throw new Error(`El detalle de la cancelación admite como máximo ${CONFIG.MAX_DETALLE_CANCELACION} caracteres.`);
    }
    return texto;
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // HELPERS PRIVADOS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Obtiene el ID de la temporada activa.
   * @returns {string}
   */
  _getTemporadaActivaId_() {
    const temporadas = getSheetData(CONFIG.SHEETS.TEMPORADAS);
    const activa = temporadas.find(t => t.Activa === true || t.Activa === 'TRUE');
    if (!activa) throw new Error('No hay ninguna temporada activa configurada.');
    return activa.ID;
  },

  /**
   * Devuelve el lunes de la semana actual como objeto Date (hora 00:00:00 local).
   * @returns {Date}
   */
  _getLunesSemanaActual_() {
    const hoy   = new Date();
    const diaSem = hoy.getDay(); // 0=Dom, 1=Lun, ..., 6=Sáb
    const diff   = diaSem === 0 ? -6 : 1 - diaSem; // Ajuste a lunes
    const lunes  = new Date(hoy);
    lunes.setDate(hoy.getDate() + diff);
    lunes.setHours(0, 0, 0, 0);
    return lunes;
  },

  /**
   * Suma N días a una fecha y devuelve un nuevo Date.
   * @param {Date} fecha
   * @param {number} dias
   * @returns {Date}
   */
  _sumarDias_(fecha, dias) {
    const resultado = new Date(fecha);
    resultado.setDate(resultado.getDate() + dias);
    return resultado;
  },

  /**
   * Formatea un Date como string YYYY-MM-DD.
   * @param {Date} date
   * @returns {string}
   */
  _formatDate_(date) {
    const y  = date.getFullYear();
    const m  = String(date.getMonth() + 1).padStart(2, '0');
    const d  = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  /**
   * Valida que la fecha tenga formato YYYY-MM-DD.
   * @param {string} fecha
   */
  _validarFecha_(fecha) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new Error(`Formato de fecha inválido: "${fecha}". Usa YYYY-MM-DD.`);
    }
  },

  /**
   * Valida que la hora tenga formato HH:MM.
   * @param {string} hora
   */
  _validarHora_(hora) {
    if (!/^\d{2}:\d{2}$/.test(hora)) {
      throw new Error(`Formato de hora inválido: "${hora}". Usa HH:MM.`);
    }
  },
};

// ── Función global para el trigger semanal ────────────────────────────────────
// Debe estar en el scope global (no dentro del objeto) para que Apps Script la reconozca.
function triggerGenerarSesiones() {
  try {
    const resultados = Sesiones.generarSesionesSemanaGlobal();
    Logger.log('Trigger semanal ejecutado: ' + JSON.stringify(resultados));
  } catch (e) {
    Logger.log('Error en trigger semanal: ' + e.message);
  }
}
