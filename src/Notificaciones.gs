/**
 * Notificaciones.gs
 * Envío de emails automáticos mediante MailApp.
 * NOTA: MailApp tiene una cuota de ~100 emails/día en cuentas de Google gratuitas
 * y ~1500/día en Google Workspace. Todas las funciones son internas.
 */

const Notificaciones = {

  // ══════════════════════════════════════════════════════════════════════════════
  // NOTIFICACIÓN A FAMILIA — cuando entrenador registra A o R
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Envía un email a los tutores del jugador cuando se registra una ausencia o retraso.
   * @param {Object} jugador   - Registro de Jugadores
   * @param {Object} sesion    - Registro de Sesiones
   * @param {Object} equipo    - Registro de Equipos
   * @param {string} estado    - 'A' | 'R'
   * @returns {boolean} true si se envió al menos un email
   */
  notificarAusenciaAFamilia(jugador, sesion, equipo, estado) {
    const destinatarios = [jugador.EmailPadre1, jugador.EmailPadre2]
      .filter(e => e && String(e).trim() && String(e).includes('@'));

    if (destinatarios.length === 0) return false;

    const tipoTexto = estado === CONFIG.ESTADOS_ASISTENCIA.AUSENTE ? 'ausencia' : 'retraso';
    const tipoCapt  = estado === CONFIG.ESTADOS_ASISTENCIA.AUSENTE ? 'Ausencia'  : 'Retraso';
    const diaNombre = CONFIG.DIAS_SEMANA[new Date(sesion.Fecha + 'T12:00:00').getDay() + 1] || sesion.Fecha;
    const fechaForm = Notificaciones._formatFecha(sesion.Fecha);

    const asunto = `CB Baeza — ${tipoCapt} de ${jugador.Nombre} ${jugador.Apellidos} (${fechaForm})`;

    const cuerpo = `Estimado/a tutor/a,

Le comunicamos que hoy se ha registrado una ${tipoTexto} de ${jugador.Nombre} ${jugador.Apellidos} en el entrenamiento del equipo ${equipo.Nombre}.

📅 Fecha: ${diaNombre}, ${fechaForm}
🕐 Hora: ${sesion.HoraInicio} – ${sesion.HoraFin}
🏀 Equipo: ${equipo.Nombre} (${equipo.Categoria} ${equipo.Modalidad})

Si desea justificar esta ${tipoTexto}, puede hacerlo accediendo a la aplicación con las credenciales de su hijo/a (usuario y PIN) y entrando en "Mis entrenamientos".

Un saludo,
CB Baeza — Gestión de Asistencia`;

    try {
      MailApp.sendEmail({
        to:      destinatarios.join(','),
        subject: asunto,
        body:    cuerpo,
      });
      return true;
    } catch (e) {
      Logger.log(`[Notificaciones] Error al enviar email a familia: ${e.message}`);
      return false;
    }
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // NOTIFICACIÓN A ENTRENADORES — cuando llega una justificación de padres
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Envía un email a los entrenadores del equipo cuando se justifica una incidencia.
   * @param {Object} jugador        - Registro de Jugadores
   * @param {Object} sesion         - Registro de Sesiones
   * @param {Object} equipo         - Registro de Equipos
   * @param {string} tipoIncidencia - 'Ausencia' | 'Retraso'
   * @param {string} motivo         - Categoría del motivo
   * @param {string} detalle        - Texto libre adicional
   * @param {string} mensaje        - Mensaje auto-generado
   * @returns {boolean}
   */
  notificarJustificacionAEntrenadores(jugador, sesion, equipo, tipoIncidencia, motivo, detalle, mensaje) {
    // Solo entrenadores con TipoRol=Entrenador (no Visores)
    const relaciones = findWhere(CONFIG.SHEETS.ENTRENADORES_EQUIPOS, 'ID_Equipo', equipo.ID)
      .filter(r => (r.Activo === true || r.Activo === 'TRUE') && r.TipoRol !== CONFIG.TIPOS_ROL_ENTRENADOR.VISOR);

    const entrenadorIds = relaciones.map(r => r.ID_Entrenador);
    const entrenadores  = findWhereIn(CONFIG.SHEETS.ENTRENADORES, 'ID', entrenadorIds);

    const destinatarios = entrenadores
      .map(e => String(e.Email || '').trim())
      .filter(e => e && e.includes('@'));

    if (destinatarios.length === 0) return false;

    const fechaForm = Notificaciones._formatFecha(sesion.Fecha);
    const asunto    = `CB Baeza — Justificación recibida: ${jugador.Nombre} ${jugador.Apellidos} (${fechaForm})`;

    const cuerpoDetalle = detalle ? `\nInformación adicional: ${detalle}` : '';
    const cuerpo = `Hola,

Se ha recibido una justificación de ${tipoIncidencia.toLowerCase()} para el siguiente entrenamiento:

👤 Jugador: ${jugador.Nombre} ${jugador.Apellidos}
📅 Sesión:  ${fechaForm}, ${sesion.HoraInicio} – ${sesion.HoraFin}
🏀 Equipo:  ${equipo.Nombre}
📋 Tipo:    ${tipoIncidencia}
📌 Motivo:  ${motivo}${cuerpoDetalle}

Mensaje generado:
"${mensaje}"

Puedes ver los detalles en la aplicación de gestión de asistencia.

CB Baeza — Gestión de Asistencia`;

    try {
      MailApp.sendEmail({
        to:      destinatarios.join(','),
        subject: asunto,
        body:    cuerpo,
      });
      return true;
    } catch (e) {
      Logger.log(`[Notificaciones] Error al enviar email a entrenadores: ${e.message}`);
      return false;
    }
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // GENERADOR DE MENSAJE AUTOMÁTICO
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Genera el texto de la justificación que se almacena en MensajeGenerado.
   */
  generarMensajeJustificacion(jugador, sesion, equipo, tipoIncidencia, motivo, detalle, horaIncorporacion) {
    const fechaForm   = Notificaciones._formatFecha(sesion.Fecha);
    const diaNombre   = CONFIG.DIAS_SEMANA[new Date(sesion.Fecha + 'T12:00:00').getDay() + 1] || '';
    const tipoTexto   = tipoIncidencia === 'Ausencia' ? 'una ausencia' : 'una llegada con retraso';
    const detalleText = detalle ? ` Información adicional: "${detalle}".` : '';
    const horaText    = horaIncorporacion ? ` Previsión de incorporación aproximada: ${horaIncorporacion}.` : '';

    return `Los padres/tutores de ${jugador.Nombre} ${jugador.Apellidos} han notificado ${tipoTexto} ` +
           `al entrenamiento del ${diaNombre} ${fechaForm} a las ${sesion.HoraInicio} ` +
           `del equipo ${equipo.Nombre}. Motivo: ${motivo}.${detalleText}${horaText}`;
  },

  // ── Helper ────────────────────────────────────────────────────────────────────
  _formatFecha(fechaStr) {
    if (!fechaStr) return '';
    const parts = String(fechaStr).split('-');
    if (parts.length !== 3) return fechaStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  },
};
