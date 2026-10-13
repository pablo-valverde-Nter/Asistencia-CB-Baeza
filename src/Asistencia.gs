/**
 * Asistencia.gs
 * Registro y consulta de asistencia de jugadores y entrenadores por sesión.
 * Todas las funciones son internas; se exponen al cliente a través de Code.gs.
 */

const Asistencia = {

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

    // ── Jugadores: cargar una vez las asistencias de la sesión ────────────────
    const asistenciasJugadores = findWhere(CONFIG.SHEETS.ASIST_JUGADORES, 'ID_Sesion', sesionId);
    const asistenciaJugadorPorId = new Map(
      asistenciasJugadores.map(row => [String(row.ID_Jugador), row])
    );

    const asistenciasEntrenadores = findWhere(CONFIG.SHEETS.ASIST_ENTRENADORES, 'ID_Sesion', sesionId);
    const asistenciaEntrenadorPorId = new Map(
      asistenciasEntrenadores.map(row => [String(row.ID_Entrenador), row])
    );
    const jugadoresEquipo = new Set(findWhere(CONFIG.SHEETS.JUGADORES_EQUIPOS, 'ID_Equipo', sesion.ID_Equipo)
      .filter(row => row.Activo === true || row.Activo === 'TRUE').map(row => String(row.ID_Jugador)));
    const entrenadoresEquipo = new Set(findWhere(CONFIG.SHEETS.ENTRENADORES_EQUIPOS, 'ID_Equipo', sesion.ID_Equipo)
      .filter(row => row.Activo === true || row.Activo === 'TRUE').map(row => String(row.ID_Entrenador)));
    const excluidosJugadores = [...new Set(asistencias.excluidosJugadores || [])];
    const excluidosEntrenadores = [...new Set(asistencias.excluidosEntrenadores || [])];
    excluidosJugadores.forEach(id => {
      const actual = asistenciaJugadorPorId.get(String(id));
        if (!jugadoresEquipo.has(String(id)) &&
          !(actual && (actual.EsInvitado === true || actual.EsInvitado === 'TRUE')) &&
          !(!actual && findById(CONFIG.SHEETS.JUGADORES, id))) {
        throw new Error('Solo se puede quitar un jugador del equipo o invitado a esta sesión.');
      }
      if (actual && (actual.TieneJustificacion === true || actual.TieneJustificacion === 'TRUE')) {
        throw new Error('No se puede quitar un jugador con una justificación activa.');
      }
      if ((asistencias.jugadores || []).some(item => String(item.jugadorId) === String(id))) {
        throw new Error('Un jugador no puede estar incluido y excluido a la vez.');
      }
    });
    excluidosEntrenadores.forEach(id => {
      const actual = asistenciaEntrenadorPorId.get(String(id));
        if (!entrenadoresEquipo.has(String(id)) &&
          !(actual && (actual.EsInvitado === true || actual.EsInvitado === 'TRUE')) &&
          !(!actual && findById(CONFIG.SHEETS.ENTRENADORES, id))) {
        throw new Error('Solo se puede quitar un entrenador del equipo o invitado a esta sesión.');
      }
      if ((asistencias.entrenadores || []).some(item => String(item.entrenadorId) === String(id))) {
        throw new Error('Un entrenador no puede estar incluido y excluido a la vez.');
      }
    });

    let jugadoresGuardados = 0;
    (asistencias.jugadores || []).forEach(item => {
      if (!item.jugadorId) return;
      const asistenciaExistente = asistenciaJugadorPorId.get(String(item.jugadorId));
      if (!item.estado || !estadosValidos.has(item.estado)) {
        if (asistenciaExistente && asistenciaExistente.Excluido === true) {
          updateRow(CONFIG.SHEETS.ASIST_JUGADORES, asistenciaExistente.ID, { Excluido: false });
        }
        return;
      }
      if (asistenciaExistente) {
        const cambios = {
          Estado: item.estado,
          EsInvitado: item.esInvitado || false,
          Excluido: false,
          FechaRegistro: timestamp,
        };
        if (item.limpiarJustif) Object.assign(cambios, {
          TieneJustificacion: false,
          TipoJustificacion: null,
          MotivoCategoria: null,
          MotivoDetalle: null,
          FechaJustificacion: null,
          JustificadoPor: null,
          MensajeGenerado: null,
          NotificadoEntrenador: false,
        });
        updateRow(CONFIG.SHEETS.ASIST_JUGADORES, asistenciaExistente.ID, cambios);
      } else {
        appendRow(CONFIG.SHEETS.ASIST_JUGADORES, {
          ID_Sesion:     sesionId,
          ID_Jugador:    item.jugadorId,
          Estado:        item.estado,
          EsInvitado:    item.esInvitado || false,
          Excluido:      false,
          FechaRegistro: timestamp,
        });
      }
      jugadoresGuardados++;
    });

    // ── Entrenadores: cargar una vez las asistencias de la sesión ─────────────
    let entrenadoresGuardados = 0;
    (asistencias.entrenadores || []).forEach(item => {
      if (!item.entrenadorId || item.asistio === undefined) return;
      const asistenciaExistente = asistenciaEntrenadorPorId.get(String(item.entrenadorId));
      if (asistenciaExistente) {
        updateRow(CONFIG.SHEETS.ASIST_ENTRENADORES, asistenciaExistente.ID, {
          Asistio: item.asistio,
          EsInvitado: item.esInvitado || false,
          Excluido: false,
          FechaRegistro: timestamp,
        });
      } else {
        appendRow(CONFIG.SHEETS.ASIST_ENTRENADORES, {
          ID_Sesion:     sesionId,
          ID_Entrenador: item.entrenadorId,
          Asistio:       item.asistio,
          EsInvitado:    item.esInvitado || false,
          Excluido:      false,
          FechaRegistro: timestamp,
        });
      }
      entrenadoresGuardados++;
    });

    excluidosJugadores.forEach(id => {
      const actual = asistenciaJugadorPorId.get(String(id));
      if (!jugadoresEquipo.has(String(id))) {
        if (actual) deleteRow(CONFIG.SHEETS.ASIST_JUGADORES, actual.ID);
      } else if (actual) {
        updateRow(CONFIG.SHEETS.ASIST_JUGADORES, actual.ID, { Estado: null, Excluido: true });
      } else {
        appendRow(CONFIG.SHEETS.ASIST_JUGADORES, {
          ID_Sesion: sesionId, ID_Jugador: id, EsInvitado: false, Excluido: true, FechaRegistro: timestamp,
        });
      }
    });
    excluidosEntrenadores.forEach(id => {
      const actual = asistenciaEntrenadorPorId.get(String(id));
      if (!entrenadoresEquipo.has(String(id))) {
        if (actual) deleteRow(CONFIG.SHEETS.ASIST_ENTRENADORES, actual.ID);
      } else if (actual) {
        updateRow(CONFIG.SHEETS.ASIST_ENTRENADORES, actual.ID, { Asistio: null, Excluido: true });
      } else {
        appendRow(CONFIG.SHEETS.ASIST_ENTRENADORES, {
          ID_Sesion: sesionId, ID_Entrenador: id, EsInvitado: false, Excluido: true, FechaRegistro: timestamp,
        });
      }
    });

    // Marcar la sesión como guardada para que persista entre reinicios
    updateRow(CONFIG.SHEETS.SESIONES, sesionId, { AsistenciaGuardada: true });

    // ── Enviar notificaciones a familias para A y R ───────────────────────────
    const equipo = findById(CONFIG.SHEETS.EQUIPOS, sesion.ID_Equipo);
    (asistencias.jugadores || []).forEach(item => {
      if (!item.jugadorId || !estadosValidos.has(item.estado)) return;
      const estado = item.estado;
      if (estado !== CONFIG.ESTADOS_ASISTENCIA.AUSENTE && estado !== CONFIG.ESTADOS_ASISTENCIA.RETRASO) return;
      try {
        const jugador = findById(CONFIG.SHEETS.JUGADORES, item.jugadorId);
        if (jugador && (jugador.EmailPadre1 || jugador.EmailPadre2)) {
          Notificaciones.notificarAusenciaAFamilia(jugador, sesion, equipo, estado);
        }
      } catch (eNotif) {
        Logger.log(`[guardarAsistenciaCompleta] Error enviando email a familia: ${eNotif.message}`);
      }
    });

    return {
      success:               true,
      jugadoresGuardados:    jugadoresGuardados,
      entrenadoresGuardados: entrenadoresGuardados,
    };
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // JUSTIFICACIONES DE AUSENCIA / RETRASO
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Registra una justificación de ausencia o retraso enviada por los padres.
   * Requiere que CodigoPadres sea correcto para autorizar la acción.
   *
   * @param {string} sesionId
   * @param {string} jugadorId
   * @param {string} codigoPadres     - Código de 6 caracteres del jugador
   * @param {string} tipoIncidencia   - 'Ausencia' | 'Retraso'
   * @param {string} motivo           - Categoría del motivo (ver CONFIG.MOTIVOS_JUSTIFICACION)
   * @param {string} detalle          - Texto libre adicional (puede ser vacío)
   * @param {string} [horaIncorporacion] - Solo para Retraso: hora prevista "HH:MM"
   * @returns {{ success: boolean, registro?: Object, error?: string }}
   */
  registrarJustificacion(sesionId, jugadorId, codigoPadres, tipoIncidencia, motivo, detalle, horaIncorporacion) {
    // Validar código de padres
    if (!Auth.verificarCodigoPadres(jugadorId, codigoPadres)) {
      throw new Error('El código de autorización no es correcto.');
    }

    // Verificar que existe un registro de asistencia
    const registros = findWhere(CONFIG.SHEETS.ASIST_JUGADORES, 'ID_Sesion', sesionId)
      .filter(r => r.ID_Jugador === jugadorId);
    if (registros.some(r => r.Excluido === true || r.Excluido === 'TRUE')) {
      throw new Error('Este jugador no participa en esta sesión.');
    }

    const sesion  = findById(CONFIG.SHEETS.SESIONES, sesionId);
    if (!sesion) throw new Error('Sesión no encontrada.');

    const jugador = findById(CONFIG.SHEETS.JUGADORES, jugadorId);
    if (!jugador) throw new Error('Jugador no encontrado.');

    const equipo  = findById(CONFIG.SHEETS.EQUIPOS, sesion.ID_Equipo);

    // Para sesiones futuras (notificación previa) se puede no tener registro aún
    // En ese caso se crea con el estado correspondiente
    const hoy     = new Date().toISOString().split('T')[0];
    const estado  = tipoIncidencia === 'Ausencia' ? CONFIG.ESTADOS_ASISTENCIA.AUSENTE : CONFIG.ESTADOS_ASISTENCIA.RETRASO;
    const timestamp = Asistencia._timestamp_();

    const mensaje = Notificaciones.generarMensajeJustificacion(
      jugador, sesion, equipo, tipoIncidencia, motivo, detalle, horaIncorporacion || ''
    );

    const camposJustificacion = {
      TieneJustificacion:   true,
      TipoJustificacion:    tipoIncidencia,
      MotivoCategoria:      motivo,
      MotivoDetalle:        detalle || '',
      FechaJustificacion:   timestamp,
      JustificadoPor:       'padre',
      MensajeGenerado:      mensaje,
      NotificadoEntrenador: false,
      EsProgramada:         false,
    };

    // Pre-justificación: en sesiones futuras no fijar Estado (el entrenador lo marcará después)
    const esFutura = sesion.Fecha > hoy;
    let registro;
    if (registros.length > 0) {
      // Registro existente: actualizar justificación.
      // En sesiones futuras no tocar el Estado (la asistencia real aún no ha ocurrido).
      const updates = esFutura
        ? { ...camposJustificacion }
        : { Estado: estado, ...camposJustificacion };
      updateRow(CONFIG.SHEETS.ASIST_JUGADORES, registros[0].ID, updates);
      registro = { ...registros[0], ...updates };
    } else {
      // Sin registro previo.
      // Para sesiones futuras: pre-justificación sin Estado.
      // Para sesiones pasadas: crear registro con el Estado inferido del tipo de incidencia.
      const camposBase = {
        ID_Sesion:     sesionId,
        ID_Jugador:    jugadorId,
        EsInvitado:    false,
        Excluido:      false,
        FechaRegistro: timestamp,
        ...camposJustificacion,
      };
      if (!esFutura) camposBase.Estado = estado;
      registro = appendRow(CONFIG.SHEETS.ASIST_JUGADORES, camposBase);
    }

    // Notificar a entrenadores del equipo
    try {
      const enviado = Notificaciones.notificarJustificacionAEntrenadores(
        jugador, sesion, equipo, tipoIncidencia, motivo, detalle, mensaje
      );
      if (enviado) {
        updateRow(CONFIG.SHEETS.ASIST_JUGADORES, registro.ID, { NotificadoEntrenador: true });
        registro.NotificadoEntrenador = true;
      }
    } catch (eNotif) {
      Logger.log(`[registrarJustificacion] Error email: ${eNotif.message}`);
    }

    return { success: true, registro: registro };
  },

  eliminarJustificacion(sesionId, jugadorId, codigoPadres) {
    if (!Auth.verificarCodigoPadres(jugadorId, codigoPadres)) {
      throw new Error('El código de autorización no es correcto.');
    }
    const registro = findWhere(CONFIG.SHEETS.ASIST_JUGADORES, 'ID_Sesion', sesionId)
      .find(r => r.ID_Jugador === jugadorId && (r.TieneJustificacion === true || r.TieneJustificacion === 'TRUE'));
    if (!registro || registro.JustificadoPor !== 'padre') {
      throw new Error('No hay una justificación de la familia para eliminar.');
    }

    if (!registro.Estado) {
      deleteRow(CONFIG.SHEETS.ASIST_JUGADORES, registro.ID);
      Asistencia._notificarCancelacion_(sesionId, jugadorId);
      return { success: true, eliminado: true };
    }

    const cambios = {
      TieneJustificacion: false,
      TipoJustificacion: null,
      MotivoCategoria: null,
      MotivoDetalle: null,
      FechaJustificacion: null,
      JustificadoPor: null,
      MensajeGenerado: null,
      NotificadoEntrenador: false,
    };
    updateRow(CONFIG.SHEETS.ASIST_JUGADORES, registro.ID, cambios);
    Asistencia._notificarCancelacion_(sesionId, jugadorId);
    return { success: true, registro: { ...registro, ...cambios } };
  },

  _notificarCancelacion_(sesionId, jugadorId) {
    try {
      const sesion = findById(CONFIG.SHEETS.SESIONES, sesionId);
      const jugador = findById(CONFIG.SHEETS.JUGADORES, jugadorId);
      const equipo = sesion && findById(CONFIG.SHEETS.EQUIPOS, sesion.ID_Equipo);
      if (sesion && jugador && equipo) {
        Notificaciones.notificarCancelacionJustificacionAEntrenadores(jugador, sesion, equipo);
      }
    } catch (error) {
      Logger.log(`[eliminarJustificacion] Error email: ${error.message}`);
    }
  },

  getProgramacionesJugador(jugadorId) {
    return findWhere(CONFIG.SHEETS.PROGRAMACIONES_JUSTIFICACIONES, 'ID_Jugador', jugadorId)
      .sort((a, b) => String(a.ID_Horario || '').localeCompare(String(b.ID_Horario || '')));
  },

  crearProgramacion(jugadorId, codigoPadres, datos) {
    if (!Auth.verificarCodigoPadres(jugadorId, codigoPadres)) {
      throw new Error('El código de autorización no es correcto.');
    }
    const jugador = findById(CONFIG.SHEETS.JUGADORES, jugadorId);
    const horario = findById(CONFIG.SHEETS.HORARIOS, datos && datos.idHorario);
    if (!jugador || !horario) throw new Error('No se encontró el jugador o el entrenamiento semanal.');
    if (!Asistencia._jugadorPerteneceAEquipo_(jugadorId, horario.ID_Equipo)) {
      throw new Error('El jugador no pertenece a ese equipo.');
    }
    Asistencia._validarProgramacion_(datos);
    const timestamp = Asistencia._timestamp_();
    return appendRow(CONFIG.SHEETS.PROGRAMACIONES_JUSTIFICACIONES, {
      ID_Jugador: jugadorId,
      ID_Equipo: horario.ID_Equipo,
      ID_Horario: horario.ID,
      TipoIncidencia: datos.tipoIncidencia,
      MotivoCategoria: datos.motivo,
      MotivoDetalle: datos.detalle || '',
      HoraIncorporacion: datos.horaIncorporacion || '',
      Activo: true,
      FechaCreacion: timestamp,
      FechaActualizacion: timestamp,
    });
  },

  actualizarProgramacion(programacionId, jugadorId, codigoPadres, datos) {
    if (!Auth.verificarCodigoPadres(jugadorId, codigoPadres)) {
      throw new Error('El código de autorización no es correcto.');
    }
    const actual = findById(CONFIG.SHEETS.PROGRAMACIONES_JUSTIFICACIONES, programacionId);
    if (!actual || actual.ID_Jugador !== jugadorId) throw new Error('Programación no encontrada.');
    const horario = findById(CONFIG.SHEETS.HORARIOS, datos && datos.idHorario);
    if (!horario || !Asistencia._jugadorPerteneceAEquipo_(jugadorId, horario.ID_Equipo)) {
      throw new Error('El entrenamiento semanal no es válido para este jugador.');
    }
    Asistencia._validarProgramacion_(datos);
    const cambios = {
      ID_Equipo: horario.ID_Equipo,
      ID_Horario: horario.ID,
      TipoIncidencia: datos.tipoIncidencia,
      MotivoCategoria: datos.motivo,
      MotivoDetalle: datos.detalle || '',
      HoraIncorporacion: datos.horaIncorporacion || '',
      Activo: datos.activo !== false,
      FechaActualizacion: Asistencia._timestamp_(),
    };
    updateRow(CONFIG.SHEETS.PROGRAMACIONES_JUSTIFICACIONES, programacionId, cambios);
    return { ...actual, ...cambios };
  },

  eliminarProgramacion(programacionId, jugadorId, codigoPadres) {
    if (!Auth.verificarCodigoPadres(jugadorId, codigoPadres)) {
      throw new Error('El código de autorización no es correcto.');
    }
    const actual = findById(CONFIG.SHEETS.PROGRAMACIONES_JUSTIFICACIONES, programacionId);
    if (!actual || actual.ID_Jugador !== jugadorId) throw new Error('Programación no encontrada.');
    return deleteRow(CONFIG.SHEETS.PROGRAMACIONES_JUSTIFICACIONES, programacionId);
  },

  aplicarProgramacionesSesion(sesion) {
    if (!sesion || sesion.EsExtra === true || sesion.EsExtra === 'TRUE') return 0;
    const horarios = findWhere(CONFIG.SHEETS.HORARIOS, 'ID_Equipo', sesion.ID_Equipo);
    const horario = horarios.find(h => (sesion.ID_Horario && h.ID === sesion.ID_Horario) ||
      (!sesion.ID_Horario && h.HoraInicio === sesion.HoraInicio && h.HoraFin === sesion.HoraFin));
    if (!horario) return 0;
    const reglas = findWhere(CONFIG.SHEETS.PROGRAMACIONES_JUSTIFICACIONES, 'ID_Horario', horario.ID)
      .filter(r => r.Activo === true || r.Activo === 'TRUE');
    let aplicadas = 0;
    reglas.forEach(regla => {
      if (!Asistencia._jugadorPerteneceAEquipo_(regla.ID_Jugador, sesion.ID_Equipo)) return;
      const existentes = findWhere(CONFIG.SHEETS.ASIST_JUGADORES, 'ID_Sesion', sesion.ID)
        .filter(r => r.ID_Jugador === regla.ID_Jugador);
      const jugador = findById(CONFIG.SHEETS.JUGADORES, regla.ID_Jugador);
      const equipo = findById(CONFIG.SHEETS.EQUIPOS, sesion.ID_Equipo);
      if (!jugador || !equipo || existentes.some(r => r.TieneJustificacion === true || r.TieneJustificacion === 'TRUE')) return;
      const mensaje = Notificaciones.generarMensajeJustificacion(
        jugador, sesion, equipo, regla.TipoIncidencia, regla.MotivoCategoria, regla.MotivoDetalle, regla.HoraIncorporacion
      );
      const cambios = {
        TieneJustificacion: true, TipoJustificacion: regla.TipoIncidencia,
        MotivoCategoria: regla.MotivoCategoria, MotivoDetalle: regla.MotivoDetalle || '',
        FechaJustificacion: Asistencia._timestamp_(), JustificadoPor: 'programacion',
        MensajeGenerado: mensaje, NotificadoEntrenador: false, EsProgramada: true,
      };
      let registro;
      if (existentes.length) {
        updateRow(CONFIG.SHEETS.ASIST_JUGADORES, existentes[0].ID, cambios);
        registro = { ...existentes[0], ...cambios };
      } else {
        registro = appendRow(CONFIG.SHEETS.ASIST_JUGADORES, {
          ID_Sesion: sesion.ID, ID_Jugador: regla.ID_Jugador, EsInvitado: false,
          Excluido: false, FechaRegistro: Asistencia._timestamp_(), ...cambios,
        });
      }
      const enviado = Notificaciones.notificarJustificacionAEntrenadores(
        jugador, sesion, equipo, regla.TipoIncidencia, regla.MotivoCategoria, regla.MotivoDetalle, mensaje, true
      );
      if (enviado) updateRow(CONFIG.SHEETS.ASIST_JUGADORES, registro.ID, { NotificadoEntrenador: true });
      aplicadas++;
    });
    return aplicadas;
  },

  _jugadorPerteneceAEquipo_(jugadorId, equipoId) {
    return findWhere(CONFIG.SHEETS.JUGADORES_EQUIPOS, 'ID_Jugador', jugadorId)
      .some(r => r.ID_Equipo === equipoId && (r.Activo === true || r.Activo === 'TRUE'));
  },

  _validarProgramacion_(datos) {
    if (!datos || !['Ausencia', 'Retraso'].includes(datos.tipoIncidencia)) throw new Error('Tipo de incidencia no válido.');
    if (!datos.motivo) throw new Error('Selecciona un motivo.');
    if (datos.tipoIncidencia === 'Retraso' && datos.horaIncorporacion && !/^\d{2}:\d{2}$/.test(datos.horaIncorporacion)) {
      throw new Error('La hora de incorporación no es válida.');
    }
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
