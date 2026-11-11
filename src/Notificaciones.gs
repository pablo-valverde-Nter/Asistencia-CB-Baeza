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
   * @param {string} detalle        - Texto libre adicional (nunca se envía con «Salud»)
   * @param {string} mensaje        - Mensaje auto-generado
   * @returns {boolean}
   */
  notificarJustificacionAEntrenadores(jugador, sesion, equipo, tipoIncidencia, motivo, detalle, mensaje, esProgramada) {
    const destinatarios = Notificaciones._emailsEntrenadoresEquipo_(equipo.ID);

    if (destinatarios.length === 0) return false;

    const fechaForm = Notificaciones._formatFecha(sesion.Fecha);
    const marca = esProgramada ? ' [Programada]' : '';
    const asunto    = `CB Baeza — Justificación${marca}: ${jugador.Nombre} ${jugador.Apellidos} (${fechaForm})`;

    // Datos de salud: el correo solo dice «Salud», nunca el detalle (aunque venga de un registro antiguo).
    motivo = motivoJustificacion_(motivo);
    detalle = detalleJustificacion_(motivo, detalle);
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
      .filter(r => r.Activo === true || r.Activo === 'TRUE');
    const entrenadores = findWhereIn(CONFIG.SHEETS.ENTRENADORES, 'ID', relaciones.map(r => r.ID_Entrenador));
    return entrenadores.map(e => String(e.Email || '').trim()).filter(e => e && e.includes('@'));
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // AVISO A FAMILIAS — cuando un entrenador cancela un entrenamiento
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Texto del aviso de cancelación. El cliente replica este texto en App.views.cancelarSesion.mensaje
   * para el resumen previo y para «Copiar mensaje».
   */
  mensajeCancelacion(sesion, equipo, motivo, detalle) {
    const dia = Notificaciones._diaSemana(sesion.Fecha).toLowerCase();
    const cuando = (dia ? dia + ' ' : '') + Notificaciones._formatFecha(sesion.Fecha) + ' a las ' + sesion.HoraInicio;
    return '❌ *Entrenamiento cancelado*\n🏀 Equipo ' + (equipo ? equipo.Nombre : 'tu equipo') +
      '\n📅 ' + cuando + '\n📝 Motivo: ' + motivo + (detalle ? '\n' + detalle : '') +
      '\n\nUn saludo,\n' + (String(sesion.CanceladoPor || '').trim() || 'CB Baeza');
  },

  /**
   * Correos de la familia de un jugador: los de los tutores con avisos activados y, si no hay ninguno,
   * el del propio jugador (adultos). El cliente replica esta regla para el recuento previo del correo.
   * @returns {{ valor: string, nombre: string }[]}
   */
  contactosFamilia(jugador) {
    const tutores = [1, 2].map(n => ({
      nombre: [jugador['NombrePadre' + n], jugador['ApellidosPadre' + n]].filter(Boolean).join(' '),
      email: jugador['EmailPadre' + n],
      activo: jugador['NotificarAusenciasPadre' + n] !== false && jugador['NotificarAusenciasPadre' + n] !== 'FALSE',
    }));
    const propio = { nombre: [jugador.Nombre, jugador.Apellidos].filter(Boolean).join(' '), email: jugador.Email };
    const valor = c => Notificaciones._email_(c.email);
    const conEmail = tutores.filter(c => valor(c));
    const elegidos = conEmail.length ? conEmail.filter(c => c.activo) : [propio].filter(c => valor(c));
    const vistos = new Set();
    return elegidos.map(c => ({ valor: valor(c), nombre: c.nombre }))
      .filter(c => !vistos.has(c.valor) && vistos.add(c.valor));
  },

  _email_(valor) {
    const email = String(valor || '').trim();
    return /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email) ? email : '';
  },

  /**
   * Avisa a las familias de una sesión ya cancelada. 'correo' envía un MailApp por familia;
   * 'whatsapp' y 'copiar' solo devuelven el mensaje (el entrenador lo copia y, en WhatsApp, abre wa.me/?text=).
   * @param {Object} sesion - Sesión cancelada (con MotivoCancelacion y DetalleCancelacion)
   * @param {string} canal  - Uno de CONFIG.CANALES_AVISO_CANCELACION
   * @returns {{ canal: string, mensaje?: string, convocados?: number, avisados?: number, omitidos?: number,
   *   omitidas?: Object[], fallidos?: number }}
   */
  avisarCancelacionAFamilias(sesion, canal) {
    if (canal === 'ninguno') return { canal: canal };
    const equipo = findById(CONFIG.SHEETS.EQUIPOS, sesion.ID_Equipo);
    const mensaje = Notificaciones.mensajeCancelacion(sesion, equipo, sesion.MotivoCancelacion, sesion.DetalleCancelacion);
    const resultado = { canal: canal, mensaje: mensaje };
    if (canal !== 'correo') return resultado;

    const jugadores = Sesiones.convocados(sesion);
    const familias = jugadores.map(j => ({
      jugador: [j.Nombre, j.Apellidos].filter(Boolean).join(' '),
      contactos: Notificaciones.contactosFamilia(j),
    }));
    resultado.convocados = jugadores.length;
    resultado.omitidas = familias.filter(f => !f.contactos.length).map(f => ({ jugador: f.jugador }));
    resultado.omitidos = resultado.omitidas.length;
    return Object.assign(resultado, Notificaciones._avisarCancelacionPorCorreo_(familias.filter(f => f.contactos.length), sesion, equipo, mensaje));
  },

  // Un correo por familia (sus direcciones en «Para»): ninguna familia ve las direcciones de las demás.
  _avisarCancelacionPorCorreo_(familias, sesion, equipo, mensaje) {
    const enviados = new Set();
    let avisados = 0, fallidos = 0;
    const asunto = `CB Baeza — Entrenamiento cancelado: ${equipo ? equipo.Nombre : 'tu equipo'} (${Notificaciones._formatFecha(sesion.Fecha)})`;
    const cuerpo = mensaje;
    const textoHtml = cuerpo.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
      .replace('*Entrenamiento cancelado*', '<strong>Entrenamiento cancelado</strong>').replace(/\n/g, '<br>');
    const html = '<div style="background:#F7F7F8;padding:24px;font-family:Arial,sans-serif;color:#1A1A1A">' +
      '<div style="max-width:520px;margin:auto;background:#FFFFFF;border:1px solid #E5E5E5;border-top:4px solid #4A148C;border-radius:10px;padding:24px;line-height:1.6">' +
      textoHtml + '</div></div>';
    familias.forEach(f => {
      const pendientes = f.contactos.map(c => c.valor).filter(email => !enviados.has(email));
      if (!pendientes.length) { avisados++; return; } // un hermano ya lo envió a estas direcciones
      try {
        MailApp.sendEmail({ to: pendientes.join(','), subject: asunto, body: cuerpo, htmlBody: html });
        pendientes.forEach(email => enviados.add(email));
        avisados++;
      } catch (e) {
        Logger.log('[Notificaciones] No se pudo enviar un aviso de cancelación por correo.');
        fallidos++;
      }
    });
    return { avisados: avisados, fallidos: fallidos };
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // GENERADOR DE MENSAJE AUTOMÁTICO
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Genera el texto de la justificación que se almacena en MensajeGenerado.
   * El cliente replica este texto en App.views.justificacion.mensaje para el resumen previo al envío.
   */
  generarMensajeJustificacion(jugador, sesion, equipo, tipoIncidencia, motivo, detalle, horaIncorporacion, minutosRetraso) {
    motivo = motivoJustificacion_(motivo);
    detalle = detalleJustificacion_(motivo, detalle);
    const fechaForm   = Notificaciones._formatFecha(sesion.Fecha);
    const diaNombre   = Notificaciones._diaSemana(sesion.Fecha);
    const tipoTexto   = tipoIncidencia === 'Ausencia' ? 'una ausencia' : 'una llegada con retraso';
    const detalleText = detalle ? ` Información adicional: "${detalle}".` : '';
    const minutosText = minutosRetraso ? ` Llegará con unos ${minutosRetraso} minutos de retraso.` : '';
    const horaText    = horaIncorporacion ? ` Previsión de incorporación aproximada: ${horaIncorporacion}.` : '';

    return `Los padres/tutores de ${jugador.Nombre} ${jugador.Apellidos} han notificado ${tipoTexto} ` +
           `al entrenamiento del ${diaNombre} ${fechaForm} a las ${sesion.HoraInicio} ` +
           `del equipo ${equipo.Nombre}. Motivo: ${motivo}.${minutosText}${detalleText}${horaText}`;
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
