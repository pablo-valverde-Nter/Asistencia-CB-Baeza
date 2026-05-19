/**
 * Informes.gs
 * Generación de estadísticas y exportación a Google Sheets.
 * Todas las funciones son internas; se exponen al cliente a través de Code.gs.
 */

const Informes = {

  // ══════════════════════════════════════════════════════════════════════════════
  // ESTADÍSTICAS (para mostrar en la web)
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Devuelve las estadísticas de asistencia completas de un equipo en una temporada.
   * Incluye resumen global, detalle por jugador y detalle por entrenador.
   *
   * @param {string} equipoId
   * @param {string} temporadaId
   * @returns {{
   *   equipo: Object,
   *   totalSesiones: number,
   *   jugadores: Array<{ jugador: Object, presentes: number, ausentes: number, retrasos: number, porcentaje: number }>,
   *   entrenadores: Array<{ entrenador: Object, asistidas: number, total: number, porcentaje: number }>
   * }}
   */
  getEstadisticasEquipo(equipoId, temporadaId) {
    const equipo = findById(CONFIG.SHEETS.EQUIPOS, equipoId);
    if (!equipo) throw new Error(`Equipo no encontrado: ${equipoId}`);

    // Todas las sesiones del equipo en la temporada
    const sesiones = findWhere(CONFIG.SHEETS.SESIONES, 'ID_Equipo', equipoId)
      .filter(s => s.ID_Temporada === temporadaId)
      .sort((a, b) => a.Fecha.localeCompare(b.Fecha));

    const totalSesiones = sesiones.length;
    if (totalSesiones === 0) {
      return { equipo, totalSesiones: 0, jugadores: [], entrenadores: [] };
    }

    const sesionIds = new Set(sesiones.map(s => s.ID));

    // ── Estadísticas de jugadores ─────────────────────────────────────────────
    const registrosJug = getSheetData(CONFIG.SHEETS.ASIST_JUGADORES)
      .filter(r => sesionIds.has(r.ID_Sesion));

    // Agrupar por jugador
    const mapaJugadores = {};
    registrosJug.forEach(r => {
      if (!mapaJugadores[r.ID_Jugador]) {
        mapaJugadores[r.ID_Jugador] = { P: 0, A: 0, R: 0 };
      }
      const estado = r.Estado;
      if (estado === CONFIG.ESTADOS_ASISTENCIA.PRESENTE) mapaJugadores[r.ID_Jugador].P++;
      else if (estado === CONFIG.ESTADOS_ASISTENCIA.AUSENTE)  mapaJugadores[r.ID_Jugador].A++;
      else if (estado === CONFIG.ESTADOS_ASISTENCIA.RETRASO)  mapaJugadores[r.ID_Jugador].R++;
    });

    // Obtener todos los jugadores que han participado (equipo + invitados históricos)
    const todosJugadoresIds = Object.keys(mapaJugadores);
    const jugadoresEquipo   = Equipos.getJugadoresByEquipo(equipoId);
    const idsEquipo         = new Set(jugadoresEquipo.map(j => j.ID));

    // Añadir invitados históricos que no estén en el equipo actual
    const jugadoresExtra = findWhereIn(CONFIG.SHEETS.JUGADORES, 'ID',
      todosJugadoresIds.filter(id => !idsEquipo.has(id))
    );

    const todosJugadores = [...jugadoresEquipo, ...jugadoresExtra];

    const statsJugadores = todosJugadores
      .filter(j => mapaJugadores[j.ID]) // solo jugadores con algún registro
      .map(j => {
        const s = mapaJugadores[j.ID];
        const sesionesRegistradas = s.P + s.A + s.R;
        return {
          jugador:   j,
          presentes: s.P,
          ausentes:  s.A,
          retrasos:  s.R,
          porcentaje: Informes._calcularPorcentaje_(s.P + s.R, sesionesRegistradas),
        };
      })
      .sort((a, b) => b.porcentaje - a.porcentaje);

    // ── Estadísticas de entrenadores ──────────────────────────────────────────
    const registrosEnt = getSheetData(CONFIG.SHEETS.ASIST_ENTRENADORES)
      .filter(r => sesionIds.has(r.ID_Sesion));

    const mapaEntrenadores = {};
    registrosEnt.forEach(r => {
      if (!mapaEntrenadores[r.ID_Entrenador]) {
        mapaEntrenadores[r.ID_Entrenador] = { asistidas: 0, total: 0 };
      }
      mapaEntrenadores[r.ID_Entrenador].total++;
      if (r.Asistio === true || r.Asistio === 'TRUE') {
        mapaEntrenadores[r.ID_Entrenador].asistidas++;
      }
    });

    const entrenadoresEquipo = Equipos.getEntrenadoresByEquipo(equipoId);
    const idsEntEquipo       = new Set(entrenadoresEquipo.map(e => e.ID));
    const entrenadoresExtra  = findWhereIn(CONFIG.SHEETS.ENTRENADORES, 'ID',
      Object.keys(mapaEntrenadores).filter(id => !idsEntEquipo.has(id))
    );
    const todosEntrenadores = [...entrenadoresEquipo, ...entrenadoresExtra];

    const statsEntrenadores = todosEntrenadores
      .filter(e => mapaEntrenadores[e.ID])
      .map(e => {
        const s = mapaEntrenadores[e.ID];
        return {
          entrenador: e,
          asistidas:  s.asistidas,
          total:      s.total,
          porcentaje: Informes._calcularPorcentaje_(s.asistidas, s.total),
        };
      })
      .sort((a, b) => b.porcentaje - a.porcentaje);

    return {
      equipo,
      totalSesiones,
      sesiones,
      jugadores:    statsJugadores,
      entrenadores: statsEntrenadores,
    };
  },

  /**
   * Devuelve las estadísticas de asistencia de un jugador concreto
   * a lo largo de todos los equipos y temporadas.
   * @param {string} jugadorId
   * @param {string} [temporadaId] - Opcional; si se omite devuelve todos los registros.
   * @returns {{ jugador: Object, totalSesiones: number, presentes: number, ausentes: number, retrasos: number, porcentaje: number, detalle: Object[] }}
   */
  getEstadisticasJugador(jugadorId, temporadaId) {
    const jugador = findById(CONFIG.SHEETS.JUGADORES, jugadorId);
    if (!jugador) throw new Error(`Jugador no encontrado: ${jugadorId}`);

    let registros = findWhere(CONFIG.SHEETS.ASIST_JUGADORES, 'ID_Jugador', jugadorId);

    if (temporadaId) {
      // Filtrar por temporada cruzando con sesiones
      const sesionesTmp = findWhere(CONFIG.SHEETS.SESIONES, 'ID_Temporada', temporadaId);
      const sesionIds   = new Set(sesionesTmp.map(s => s.ID));
      registros = registros.filter(r => sesionIds.has(r.ID_Sesion));
    }

    const P = registros.filter(r => r.Estado === CONFIG.ESTADOS_ASISTENCIA.PRESENTE).length;
    const A = registros.filter(r => r.Estado === CONFIG.ESTADOS_ASISTENCIA.AUSENTE).length;
    const R = registros.filter(r => r.Estado === CONFIG.ESTADOS_ASISTENCIA.RETRASO).length;

    return {
      jugador,
      totalSesiones: registros.length,
      presentes:     P,
      ausentes:      A,
      retrasos:      R,
      porcentaje:    Informes._calcularPorcentaje_(P + R, registros.length),
      detalle:       registros,
    };
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // EXPORTACIÓN A GOOGLE SHEETS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Genera un nuevo Google Spreadsheet con el informe de asistencia de un equipo.
   * @param {string} equipoId
   * @param {string} temporadaId
   * @returns {string} URL del Spreadsheet generado.
   */
  exportarASheets(equipoId, temporadaId) {
    const stats = Informes.getEstadisticasEquipo(equipoId, temporadaId);
    const temporada = findById(CONFIG.SHEETS.TEMPORADAS, temporadaId);
    const nombreTemporada = temporada ? temporada.Nombre : temporadaId;

    const titulo = `Informe Asistencia — ${stats.equipo.Nombre} — ${nombreTemporada}`;
    const ss = SpreadsheetApp.create(titulo);

    // ── Hoja 1: Resumen por jugador ───────────────────────────────────────────
    const hResumen = ss.getSheets()[0];
    hResumen.setName('Resumen Jugadores');
    Informes._escribirResumenJugadores_(hResumen, stats);

    // ── Hoja 2: Resumen por entrenador ────────────────────────────────────────
    const hEntrenadores = ss.insertSheet('Resumen Entrenadores');
    Informes._escribirResumenEntrenadores_(hEntrenadores, stats);

    // ── Hoja 3: Detalle sesión × jugador ──────────────────────────────────────
    const hDetalle = ss.insertSheet('Detalle por Sesión');
    Informes._escribirDetalleSesiones_(hDetalle, stats);

    return ss.getUrl();
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // HELPERS DE ESCRITURA (privados)
  // ══════════════════════════════════════════════════════════════════════════════

  _escribirResumenJugadores_(sheet, stats) {
    const CABECERA_BG = '#1a237e';
    const cabeceras   = ['Jugador', 'Dorsal', 'Presentes', 'Retrasos', 'Ausentes', '% Asistencia'];

    // Título
    sheet.getRange(1, 1).setValue(`Equipo: ${stats.equipo.Nombre} — Total sesiones: ${stats.totalSesiones}`);
    sheet.getRange(1, 1, 1, cabeceras.length).merge().setFontWeight('bold').setFontSize(12);

    // Cabeceras
    const rCab = sheet.getRange(2, 1, 1, cabeceras.length);
    rCab.setValues([cabeceras]);
    rCab.setBackground(CABECERA_BG).setFontColor('#ffffff').setFontWeight('bold');

    // Datos
    const filas = stats.jugadores.map(s => [
      `${s.jugador.Apellidos}, ${s.jugador.Nombre}`,
      s.jugador.Dorsal || '',
      s.presentes,
      s.retrasos,
      s.ausentes,
      `${s.porcentaje}%`,
    ]);

    if (filas.length > 0) {
      const rDatos = sheet.getRange(3, 1, filas.length, cabeceras.length);
      rDatos.setValues(filas);

      // Colorear la columna de porcentaje según umbral
      filas.forEach((f, i) => {
        const pct = parseFloat(f[5]);
        const color = pct >= 80 ? '#c8e6c9' : pct >= 60 ? '#fff9c4' : '#ffcdd2';
        sheet.getRange(3 + i, 6).setBackground(color);
      });
    }

    sheet.setFrozenRows(2);
    sheet.autoResizeColumns(1, cabeceras.length);
  },

  _escribirResumenEntrenadores_(sheet, stats) {
    const CABECERA_BG = '#1a237e';
    const cabeceras   = ['Entrenador', 'Sesiones asistidas', 'Total sesiones', '% Asistencia'];

    sheet.getRange(1, 1).setValue(`Entrenadores — ${stats.equipo.Nombre}`);
    sheet.getRange(1, 1, 1, cabeceras.length).merge().setFontWeight('bold').setFontSize(12);

    const rCab = sheet.getRange(2, 1, 1, cabeceras.length);
    rCab.setValues([cabeceras]);
    rCab.setBackground(CABECERA_BG).setFontColor('#ffffff').setFontWeight('bold');

    const filas = stats.entrenadores.map(s => [
      `${s.entrenador.Apellidos}, ${s.entrenador.Nombre}`,
      s.asistidas,
      s.total,
      `${s.porcentaje}%`,
    ]);

    if (filas.length > 0) {
      sheet.getRange(3, 1, filas.length, cabeceras.length).setValues(filas);
    }

    sheet.setFrozenRows(2);
    sheet.autoResizeColumns(1, cabeceras.length);
  },

  _escribirDetalleSesiones_(sheet, stats) {
    if (stats.totalSesiones === 0 || stats.jugadores.length === 0) {
      sheet.getRange(1, 1).setValue('Sin datos para mostrar.');
      return;
    }

    const CABECERA_BG = '#1a237e';
    const sesiones    = stats.sesiones;

    // Cabecera: "Jugador" + una columna por sesión (fecha)
    const cabeceras = ['Jugador', 'Dorsal', ...sesiones.map(s => `${s.Fecha}\n${s.HoraInicio}`)];
    const rCab = sheet.getRange(1, 1, 1, cabeceras.length);
    rCab.setValues([cabeceras]);
    rCab.setBackground(CABECERA_BG).setFontColor('#ffffff').setFontWeight('bold').setWrap(true);

    // Obtener todos los registros de asistencia de estas sesiones
    const sesionIds = new Set(sesiones.map(s => s.ID));
    const registros = getSheetData(CONFIG.SHEETS.ASIST_JUGADORES)
      .filter(r => sesionIds.has(r.ID_Sesion));

    // Mapa: jugadorId → sesionId → estado
    const mapa = {};
    registros.forEach(r => {
      if (!mapa[r.ID_Jugador]) mapa[r.ID_Jugador] = {};
      mapa[r.ID_Jugador][r.ID_Sesion] = r.Estado;
    });

    // Filas de datos
    const filas = stats.jugadores.map(s => {
      const fila = [
        `${s.jugador.Apellidos}, ${s.jugador.Nombre}`,
        s.jugador.Dorsal || '',
      ];
      sesiones.forEach(ses => {
        fila.push(mapa[s.jugador.ID]?.[ses.ID] || '');
      });
      return fila;
    });

    if (filas.length > 0) {
      const rDatos = sheet.getRange(2, 1, filas.length, cabeceras.length);
      rDatos.setValues(filas);

      // Colorear celdas de estado
      filas.forEach((fila, fi) => {
        sesiones.forEach((ses, si) => {
          const estado = fila[2 + si];
          let color = '#ffffff';
          if (estado === 'P') color = '#c8e6c9';
          else if (estado === 'A') color = '#ffcdd2';
          else if (estado === 'R') color = '#fff9c4';
          sheet.getRange(2 + fi, 3 + si).setBackground(color);
        });
      });
    }

    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(2);
    sheet.autoResizeColumns(1, 2);
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // HELPERS DE CÁLCULO
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Calcula el porcentaje redondeado a 1 decimal. Devuelve 0 si total es 0.
   * @param {number} parte
   * @param {number} total
   * @returns {number}
   */
  _calcularPorcentaje_(parte, total) {
    if (!total || total === 0) return 0;
    return Math.round((parte / total) * 1000) / 10;
  },
};
