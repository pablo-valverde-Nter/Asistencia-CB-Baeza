/**
 * Asistencia.gs
 * Registro y consulta de asistencia de jugadores y entrenadores por sesión.
 * Todas las funciones son internas; se exponen al cliente a través de Code.gs.
 */

const Asistencia = {

  // ══════════════════════════════════════════════════════════════════════════════
  // CONSULTA DE SESIÓN
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Devuelve todos los datos necesarios para renderizar el formulario de asistencia:
   * - Datos de la sesión
   * - Lista de jugadores del equipo con su estado actual (P/A/R o null)
   * - Lista de entrenadores del equipo con su estado actual
   *
   * @param {string} sesionId
   * @returns {{
   *   sesion: Object,
   *   jugadores: Array<{jugador: Object, estado: string|null, esInvitado: boolean}>,
   *   entrenadores: Array<{entrenador: Object, asistio: boolean|null, esInvitado: boolean}>
   * }}
   */
  getAsistenciaSesion(sesionId) {
    const sesion = findById(CONFIG.SHEETS.SESIONES, sesionId);
    if (!sesion) throw new Error(`Sesión no encontrada: ${sesionId}`);

    // ── Jugadores ─────────────────────────────────────────────────────────────
    const jugadoresEquipo = Equipos.getJugadoresByEquipo(sesion.ID_Equipo);
    const registrosJugadores = findWhere(CONFIG.SHEETS.ASIST_JUGADORES, 'ID_Sesion', sesionId);

    // Mapa: jugadorId → registro de asistencia
    const mapaAsistJug = {};
    registrosJugadores.forEach(r => { mapaAsistJug[r.ID_Jugador] = r; });

    // Jugadores del equipo + invitados ya registrados que no estén en el equipo
    const idsEquipo = new Set(jugadoresEquipo.map(j => j.ID));
    const jugadoresInvitados = registrosJugadores
      .filter(r => (r.EsInvitado === true || r.EsInvitado === 'TRUE') && !idsEquipo.has(r.ID_Jugador))
      .map(r => {
        const jugador = findById(CONFIG.SHEETS.JUGADORES, r.ID_Jugador);
        return jugador ? { ...jugador, Tipo: 'Invitado' } : null;
      })
      .filter(Boolean);

    const todosJugadores = [...jugadoresEquipo, ...jugadoresInvitados];

    const jugadoresConEstado = todosJugadores.map(j => {
      const reg = mapaAsistJug[j.ID];
      return {
        jugador:    j,
        estado:     reg ? reg.Estado : null,
        esInvitado: reg ? (reg.EsInvitado === true || reg.EsInvitado === 'TRUE') : false,
      };
    });

    // ── Entrenadores ──────────────────────────────────────────────────────────
    const entrenadoresEquipo = Equipos.getEntrenadoresByEquipo(sesion.ID_Equipo);
    const registrosEntrenadores = findWhere(CONFIG.SHEETS.ASIST_ENTRENADORES, 'ID_Sesion', sesionId);

    const mapaAsistEnt = {};
    registrosEntrenadores.forEach(r => { mapaAsistEnt[r.ID_Entrenador] = r; });

    const idsEntEquipo = new Set(entrenadoresEquipo.map(e => e.ID));
    const entrenadoresInvitados = registrosEntrenadores
      .filter(r => (r.EsInvitado === true || r.EsInvitado === 'TRUE') && !idsEntEquipo.has(r.ID_Entrenador))
      .map(r => findById(CONFIG.SHEETS.ENTRENADORES, r.ID_Entrenador))
      .filter(Boolean);

    const todosEntrenadores = [...entrenadoresEquipo, ...entrenadoresInvitados];

    const entrenadoresConEstado = todosEntrenadores.map(e => {
      const reg = mapaAsistEnt[e.ID];
      return {
        entrenador: e,
        asistio:    reg ? (reg.Asistio === true || reg.Asistio === 'TRUE') : null,
        esInvitado: reg ? (reg.EsInvitado === true || reg.EsInvitado === 'TRUE') : false,
      };
    });

    return {
      sesion:       sesion,
      jugadores:    jugadoresConEstado,
      entrenadores: entrenadoresConEstado,
    };
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // REGISTRO INDIVIDUAL
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Registra o actualiza la asistencia de un jugador en una sesión (upsert).
   * @param {string} sesionId
   * @param {string} jugadorId
   * @param {string} estado - 'P' | 'A' | 'R'
   * @param {boolean} [esInvitado=false]
   * @returns {Object} Registro creado o actualizado.
   */
  registrarAsistenciaJugador(sesionId, jugadorId, estado, esInvitado = false) {
    const estadosValidos = Object.values(CONFIG.ESTADOS_ASISTENCIA);
    if (!estadosValidos.includes(estado)) {
      throw new Error(`Estado inválido: "${estado}". Usa P, A o R.`);
    }

    const existentes = findWhere(CONFIG.SHEETS.ASIST_JUGADORES, 'ID_Sesion', sesionId)
      .filter(r => r.ID_Jugador === jugadorId);

    const timestamp = Asistencia._timestamp_();

    if (existentes.length > 0) {
      updateRow(CONFIG.SHEETS.ASIST_JUGADORES, existentes[0].ID, {
        Estado:        estado,
        EsInvitado:    esInvitado,
        FechaRegistro: timestamp,
      });
      return { ...existentes[0], Estado: estado, FechaRegistro: timestamp };
    }

    return appendRow(CONFIG.SHEETS.ASIST_JUGADORES, {
      ID_Sesion:     sesionId,
      ID_Jugador:    jugadorId,
      Estado:        estado,
      EsInvitado:    esInvitado,
      FechaRegistro: timestamp,
    });
  },

  /**
   * Registra o actualiza la asistencia de un entrenador en una sesión (upsert).
   * @param {string} sesionId
   * @param {string} entrenadorId
   * @param {boolean} asistio
   * @param {boolean} [esInvitado=false]
   * @returns {Object} Registro creado o actualizado.
   */
  registrarAsistenciaEntrenador(sesionId, entrenadorId, asistio, esInvitado = false) {
    const existentes = findWhere(CONFIG.SHEETS.ASIST_ENTRENADORES, 'ID_Sesion', sesionId)
      .filter(r => r.ID_Entrenador === entrenadorId);

    const timestamp = Asistencia._timestamp_();

    if (existentes.length > 0) {
      updateRow(CONFIG.SHEETS.ASIST_ENTRENADORES, existentes[0].ID, {
        Asistio:       asistio,
        EsInvitado:    esInvitado,
        FechaRegistro: timestamp,
      });
      return { ...existentes[0], Asistio: asistio, FechaRegistro: timestamp };
    }

    return appendRow(CONFIG.SHEETS.ASIST_ENTRENADORES, {
      ID_Sesion:     sesionId,
      ID_Entrenador: entrenadorId,
      Asistio:       asistio,
      EsInvitado:    esInvitado,
      FechaRegistro: timestamp,
    });
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // GUARDADO EN BLOQUE (llamada principal del formulario)
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Guarda la asistencia completa de una sesión en una sola llamada al servidor.
   * Es la función principal que usa el formulario de asistencia rápida.
   *
   * @param {string} sesionId
   * @param {{
   *   jugadores:    Array<{ jugadorId: string, estado: string, esInvitado?: boolean }>,
   *   entrenadores: Array<{ entrenadorId: string, asistio: boolean, esInvitado?: boolean }>
   * }} asistencias
   * @returns {{ success: boolean, jugadoresGuardados: number, entrenadoresGuardados: number }}
   */
  guardarAsistenciaCompleta(sesionId, asistencias) {
    const sesion = findById(CONFIG.SHEETS.SESIONES, sesionId);
    if (!sesion) throw new Error(`Sesión no encontrada: ${sesionId}`);

    const timestamp        = Asistencia._timestamp_();
    const estadosValidos   = new Set(Object.values(CONFIG.ESTADOS_ASISTENCIA));

    // ── Jugadores: leer la hoja UNA SOLA VEZ ─────────────────────────────────
    const jugSheet = getSheet_(CONFIG.SHEETS.ASIST_JUGADORES);
    const jugData  = jugSheet.getDataRange().getValues();
    const jugHdrs  = jugData[0];
    const jSesCol  = jugHdrs.indexOf('ID_Sesion');
    const jJugCol  = jugHdrs.indexOf('ID_Jugador');
    const jEstCol  = jugHdrs.indexOf('Estado')        + 1;
    const jInvCol  = jugHdrs.indexOf('EsInvitado')    + 1;
    const jTsCol   = jugHdrs.indexOf('FechaRegistro') + 1;

    // Mapa: jugadorId → número de fila en hoja (1-based)
    const jugRowMap = {};
    for (let i = 1; i < jugData.length; i++) {
      if (String(jugData[i][jSesCol]) === String(sesionId)) {
        jugRowMap[String(jugData[i][jJugCol])] = i + 1;
      }
    }

    let jugadoresGuardados = 0;
    (asistencias.jugadores || []).forEach(item => {
      if (!item.jugadorId || !item.estado || !estadosValidos.has(item.estado)) return;
      const rowNum = jugRowMap[item.jugadorId];
      if (rowNum) {
        // Actualizar la fila completa en un único setValue por columna — hoja ya leída
        jugSheet.getRange(rowNum, jEstCol).setValue(item.estado);
        jugSheet.getRange(rowNum, jInvCol).setValue(item.esInvitado || false);
        jugSheet.getRange(rowNum, jTsCol ).setValue(timestamp);
      } else {
        appendRow(CONFIG.SHEETS.ASIST_JUGADORES, {
          ID_Sesion:     sesionId,
          ID_Jugador:    item.jugadorId,
          Estado:        item.estado,
          EsInvitado:    item.esInvitado || false,
          FechaRegistro: timestamp,
        });
      }
      jugadoresGuardados++;
    });

    // ── Entrenadores: leer la hoja UNA SOLA VEZ ──────────────────────────────
    const entSheet  = getSheet_(CONFIG.SHEETS.ASIST_ENTRENADORES);
    const entData   = entSheet.getDataRange().getValues();
    const entHdrs   = entData[0];
    const eSesCol   = entHdrs.indexOf('ID_Sesion');
    const eEntCol   = entHdrs.indexOf('ID_Entrenador');
    const eAsiCol   = entHdrs.indexOf('Asistio')        + 1;
    const eInvCol   = entHdrs.indexOf('EsInvitado')     + 1;
    const eTsCol    = entHdrs.indexOf('FechaRegistro')  + 1;

    const entRowMap = {};
    for (let i = 1; i < entData.length; i++) {
      if (String(entData[i][eSesCol]) === String(sesionId)) {
        entRowMap[String(entData[i][eEntCol])] = i + 1;
      }
    }

    let entrenadoresGuardados = 0;
    (asistencias.entrenadores || []).forEach(item => {
      if (!item.entrenadorId || item.asistio === undefined) return;
      const rowNum = entRowMap[item.entrenadorId];
      if (rowNum) {
        entSheet.getRange(rowNum, eAsiCol).setValue(item.asistio);
        entSheet.getRange(rowNum, eInvCol).setValue(item.esInvitado || false);
        entSheet.getRange(rowNum, eTsCol ).setValue(timestamp);
      } else {
        appendRow(CONFIG.SHEETS.ASIST_ENTRENADORES, {
          ID_Sesion:     sesionId,
          ID_Entrenador: item.entrenadorId,
          Asistio:       item.asistio,
          EsInvitado:    item.esInvitado || false,
          FechaRegistro: timestamp,
        });
      }
      entrenadoresGuardados++;
    });

    // Marcar la sesión como guardada en la hoja para que persista entre reinicios
    updateRow(CONFIG.SHEETS.SESIONES, sesionId, { AsistenciaGuardada: true });

    return {
      success:               true,
      jugadoresGuardados:    jugadoresGuardados,
      entrenadoresGuardados: entrenadoresGuardados,
    };
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // CONSULTAS HISTÓRICAS (usadas por Informes.gs)
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Devuelve todos los registros de asistencia de jugadores para un equipo
   * en un rango de fechas, cruzando con las sesiones.
   * @param {string} equipoId
   * @param {string} fechaDesde - YYYY-MM-DD
   * @param {string} fechaHasta - YYYY-MM-DD
   * @returns {Object[]} Registros enriquecidos con datos de sesión y jugador.
   */
  getHistoricoJugadores(equipoId, fechaDesde, fechaHasta) {
    const sesiones = Sesiones.getSesionesByRango(equipoId, fechaDesde, fechaHasta);
    if (sesiones.length === 0) return [];

    const sesionIds = new Set(sesiones.map(s => s.ID));
    const mapasSesiones = {};
    sesiones.forEach(s => { mapasSesiones[s.ID] = s; });

    const registros = getSheetData(CONFIG.SHEETS.ASIST_JUGADORES)
      .filter(r => sesionIds.has(r.ID_Sesion));

    return registros.map(r => ({
      ...r,
      sesion: mapasSesiones[r.ID_Sesion] || null,
    }));
  },

  /**
   * Devuelve todos los registros de asistencia de entrenadores para un equipo
   * en un rango de fechas.
   * @param {string} equipoId
   * @param {string} fechaDesde - YYYY-MM-DD
   * @param {string} fechaHasta - YYYY-MM-DD
   * @returns {Object[]}
   */
  getHistoricoEntrenadores(equipoId, fechaDesde, fechaHasta) {
    const sesiones = Sesiones.getSesionesByRango(equipoId, fechaDesde, fechaHasta);
    if (sesiones.length === 0) return [];

    const sesionIds = new Set(sesiones.map(s => s.ID));
    const mapasSesiones = {};
    sesiones.forEach(s => { mapasSesiones[s.ID] = s; });

    const registros = getSheetData(CONFIG.SHEETS.ASIST_ENTRENADORES)
      .filter(r => sesionIds.has(r.ID_Sesion));

    return registros.map(r => ({
      ...r,
      sesion: mapasSesiones[r.ID_Sesion] || null,
    }));
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // HELPERS PRIVADOS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Devuelve el timestamp actual como string "YYYY-MM-DD HH:MM".
   * @returns {string}
   */
  _timestamp_() {
    const now = new Date();
    const fecha = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    const hora = [
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
    ].join(':');
    return `${fecha} ${hora}`;
  },
};
