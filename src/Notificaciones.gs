/**
 * Notificaciones.gs
 * Envío de emails automáticos mediante MailApp.
 * NOTA: MailApp tiene una cuota de ~100 emails/día en cuentas de Google gratuitas
 * y ~1500/día en Google Workspace. Todas las funciones son internas.
 */

const Notificaciones = {

  enviarCodigoRecuperacion_(email, codigo) {
    const cuerpo = 'CB Baeza — Gestión de Asistencia\n\n' +
      'Has solicitado recuperar tus credenciales.\n\nCódigo de verificación: ' + codigo +
      '\n\nEs válido durante 10 minutos. Escribe este número en la aplicación para recuperar tu PIN o código de seguridad.' +
      '\n\nNo compartas este número. Si no has solicitado la recuperación, ignora este correo.';
    MailApp.sendEmail({
      to: email,
      subject: 'CB Baeza — Código de recuperación',
      body: cuerpo,
      htmlBody: cuerpo.split('\n\n').map(parrafo => '<p>' + parrafo.replace(/\n/g, '<br>') + '</p>').join(''),
    });
  },

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
    const destinatarios = [
      { email: jugador.EmailPadre1, activo: jugador.NotificarAusenciasPadre1 },
      { email: jugador.EmailPadre2, activo: jugador.NotificarAusenciasPadre2 },
    ].filter(contacto => contacto.activo !== false && contacto.activo !== 'FALSE')
      .map(contacto => contacto.email)
      .filter(e => e && String(e).trim() && String(e).includes('@'));

    if (destinatarios.length === 0) return false;

    const tipoTexto = estado === CONFIG.ESTADOS_ASISTENCIA.AUSENTE ? 'ausencia' : 'retraso';
    const tipoCapt  = estado === CONFIG.ESTADOS_ASISTENCIA.AUSENTE ? 'Ausencia'  : 'Retraso';
    const diaNombre = Notificaciones._diaSemana(sesion.Fecha) || sesion.Fecha;
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
  notificarJustificacionAEntrenadores(jugador, sesion, equipo, tipoIncidencia, motivo, detalle, mensaje, esProgramada) {
    const destinatarios = Notificaciones._emailsEntrenadoresEquipo_(equipo.ID);

    if (destinatarios.length === 0) return false;

    const fechaForm = Notificaciones._formatFecha(sesion.Fecha);
    const marca = esProgramada ? ' [Programada]' : '';
    const asunto    = `CB Baeza — Justificación${marca}: ${jugador.Nombre} ${jugador.Apellidos} (${fechaForm})`;

    const cuerpoDetalle = detalle ? `\nInformación adicional: ${detalle}` : '';
    const cuerpo = `Hola,

Se ha recibido una justificación${esProgramada ? ' programada' : ''} de ${tipoIncidencia.toLowerCase()} para el siguiente entrenamiento:

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

  notificarCancelacionJustificacionAEntrenadores(jugador, sesion, equipo) {
    const destinatarios = Notificaciones._emailsEntrenadoresEquipo_(equipo.ID);
    if (!destinatarios.length) return false;

    const fechaForm = Notificaciones._formatFecha(sesion.Fecha);
    try {
      MailApp.sendEmail({
        to: destinatarios.join(','),
        subject: `CB Baeza — Justificación anulada: ${jugador.Nombre} ${jugador.Apellidos} (${fechaForm})`,
        body: `Hola,\n\nLa familia de ${jugador.Nombre} ${jugador.Apellidos} ha eliminado su justificación para la sesión del ${fechaForm} (${sesion.HoraInicio}–${sesion.HoraFin}) del equipo ${equipo.Nombre}.\n\nConsulta la asistencia actualizada en la aplicación.\n\nCB Baeza — Gestión de Asistencia`,
      });
      return true;
    } catch (error) {
      Logger.log(`[Notificaciones] Error al notificar anulación: ${error.message}`);
      return false;
    }
  },

  _emailsEntrenadoresEquipo_(equipoId) {
    const relaciones = findWhere(CONFIG.SHEETS.ENTRENADORES_EQUIPOS, 'ID_Equipo', equipoId)
      .filter(r => (r.Activo === true || r.Activo === 'TRUE') && r.TipoRol !== CONFIG.TIPOS_ROL_ENTRENADOR.VISOR);
    const entrenadores = findWhereIn(CONFIG.SHEETS.ENTRENADORES, 'ID', relaciones.map(r => r.ID_Entrenador));
    return entrenadores.map(e => String(e.Email || '').trim()).filter(e => e && e.includes('@'));
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // GENERADOR DE MENSAJE AUTOMÁTICO
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Genera el texto de la justificación que se almacena en MensajeGenerado.
   */
  generarMensajeJustificacion(jugador, sesion, equipo, tipoIncidencia, motivo, detalle, horaIncorporacion) {
    const fechaForm   = Notificaciones._formatFecha(sesion.Fecha);
    const diaNombre   = Notificaciones._diaSemana(sesion.Fecha);
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

  _diaSemana(fechaStr) {
    const parts = String(fechaStr || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(part => !Number.isInteger(part))) return '';
    const dia = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay() || 7;
    return CONFIG.DIAS_SEMANA[dia] || '';
  },
};
