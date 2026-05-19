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

  /**
   * Devuelve las sesiones de un equipo en un rango de fechas (ambas inclusive).
   * @param {string} equipoId
   * @param {string} fechaDesde - YYYY-MM-DD
   * @param {string} fechaHasta - YYYY-MM-DD
   * @returns {Object[]}
   */
  getSesionesByRango(equipoId, fechaDesde, fechaHasta) {
    return Sesiones.getSesionesByEquipo(equipoId)
      .filter(s => s.Fecha >= fechaDesde && s.Fecha <= fechaHasta);
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
        Fecha:       fechaStr,
        HoraInicio:  h.HoraInicio,
        HoraFin:     h.HoraFin,
        EsExtra:     false,
        Notas:       '',
      });
      creadas.push(sesion);
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
      Fecha:        datos.Fecha,
      HoraInicio:   datos.HoraInicio,
      HoraFin:      datos.HoraFin,
      EsExtra:      true,
      Notas:        datos.Notas || '',
    });
  },

  /**
   * Actualiza fecha, horas o notas de una sesión existente.
   * @param {string} sesionId
   * @param {{ Fecha?, HoraInicio?, HoraFin?, Notas? }} datos
   * @returns {boolean}
   */
  actualizarSesion(sesionId, datos) {
    const campos = {};
    if (datos.Fecha)      { Sesiones._validarFecha_(datos.Fecha); campos.Fecha = datos.Fecha; }
    if (datos.HoraInicio) { Sesiones._validarHora_(datos.HoraInicio); campos.HoraInicio = datos.HoraInicio; }
    if (datos.HoraFin)    { Sesiones._validarHora_(datos.HoraFin);    campos.HoraFin    = datos.HoraFin;    }
    if (datos.Notas !== undefined) campos.Notas = datos.Notas;
    return updateRow(CONFIG.SHEETS.SESIONES, sesionId, campos);
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

  // ══════════════════════════════════════════════════════════════════════════════
  // TRIGGERS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Instala un trigger semanal (lunes a las 6:00) para generar sesiones automáticamente.
   * Ejecutar una sola vez desde el editor de Apps Script.
   */
  instalarTriggerSemanal() {
    // Eliminar triggers previos del mismo tipo para evitar duplicados
    ScriptApp.getProjectTriggers()
      .filter(t => t.getHandlerFunction() === 'triggerGenerarSesiones')
      .forEach(t => ScriptApp.deleteTrigger(t));

    ScriptApp.newTrigger('triggerGenerarSesiones')
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.MONDAY)
      .atHour(6)
      .create();

    Logger.log('✅ Trigger semanal instalado: lunes a las 6:00');
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
