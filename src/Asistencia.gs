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

    let jugadoresGuardados = 0;
    (asistencias.jugadores || []).forEach(item => {
      if (!item.jugadorId || !item.estado || !estadosValidos.has(item.estado)) return;
      const asistenciaExistente = asistenciaJugadorPorId.get(String(item.jugadorId));
      if (asistenciaExistente) {
        updateRow(CONFIG.SHEETS.ASIST_JUGADORES, asistenciaExistente.ID, {
          Estado: item.estado,
          EsInvitado: item.esInvitado || false,
          FechaRegistro: timestamp,
        });
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

    // ── Entrenadores: cargar una vez las asistencias de la sesión ─────────────
    const asistenciasEntrenadores = findWhere(CONFIG.SHEETS.ASIST_ENTRENADORES, 'ID_Sesion', sesionId);
    const asistenciaEntrenadorPorId = new Map(
      asistenciasEntrenadores.map(row => [String(row.ID_Entrenador), row])
    );

    let entrenadoresGuardados = 0;
    (asistencias.entrenadores || []).forEach(item => {
      if (!item.entrenadorId || item.asistio === undefined) return;
      const asistenciaExistente = asistenciaEntrenadorPorId.get(String(item.entrenadorId));
      if (asistenciaExistente) {
        updateRow(CONFIG.SHEETS.ASIST_ENTRENADORES, asistenciaExistente.ID, {
          Asistio: item.asistio,
          EsInvitado: item.esInvitado || false,
          FechaRegistro: timestamp,
        });
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

    // Marcar la sesión como guardada para que persista entre reinicios
    updateRow(CONFIG.SHEETS.SESIONES, sesionId, { AsistenciaGuardada: true });

    // ── Enviar notificaciones a familias para A y R ───────────────────────────
    const equipo = findById(CONFIG.SHEETS.EQUIPOS, sesion.ID_Equipo);
    (asistencias.jugadores || []).forEach(item => {
      if (!item.jugadorId) return;
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
