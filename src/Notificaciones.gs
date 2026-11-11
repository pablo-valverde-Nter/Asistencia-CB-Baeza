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
    const partes = Notificaciones._partesCancelacion_(sesion, equipo, motivo, detalle);
    return `CB Baeza: se cancela el entrenamiento de ${partes[0]} del ${partes[1]}. Motivo: ${partes[2]}`;
  },

  // [equipo, cuándo, motivo con detalle]: las variables {{1}}–{{3}} de la plantilla de WhatsApp y las piezas del mensaje.
  // El motivo lleva su punto final; el detalle no se cierra con otro si ya termina en puntuación.
  _partesCancelacion_(sesion, equipo, motivo, detalle) {
    const dia = Notificaciones._diaSemana(sesion.Fecha).toLowerCase();
    const cuando = (dia ? dia + ' ' : '') + Notificaciones._formatFecha(sesion.Fecha) + ' a las ' + sesion.HoraInicio;
    const extra = detalle ? ` Información adicional: ${detalle}${/[.!?…]$/.test(detalle) ? '' : '.'}` : '';
    return [equipo ? equipo.Nombre : 'tu equipo', cuando, `${motivo}.${extra}`];
  },

  /**
   * Contactos de la familia de un jugador para un canal: los de los tutores y, si no hay ninguno registrado,
   * los del propio jugador (adultos). En correo se respeta «Avisos por correo desactivados» de cada tutor.
   * El cliente replica esta regla en App.views.cancelarSesion._contactos para el recuento previo.
   * @returns {{ valor: string, nombre: string }[]}
   */
  contactosFamilia(jugador, canal) {
    const tutores = [1, 2].map(n => ({
      nombre: [jugador['NombrePadre' + n], jugador['ApellidosPadre' + n]].filter(Boolean).join(' '),
      telefono: jugador['TelefonoPadre' + n],
      email: jugador['EmailPadre' + n],
      activo: jugador['NotificarAusenciasPadre' + n] !== false && jugador['NotificarAusenciasPadre' + n] !== 'FALSE',
    }));
    const propio = { nombre: [jugador.Nombre, jugador.Apellidos].filter(Boolean).join(' '), telefono: jugador.Telefono, email: jugador.Email, activo: true };
    const valor = canal === 'whatsapp' ? c => WhatsApp.numero(c.telefono) : c => Notificaciones._email_(c.email);
    const deTutores = tutores.filter(c => valor(c));
    const elegidos = deTutores.length ? deTutores.filter(c => canal === 'whatsapp' || c.activo) : [propio].filter(c => valor(c));
    const vistos = new Set();
    return elegidos.map(c => ({ valor: valor(c), nombre: c.nombre }))
      .filter(c => !vistos.has(c.valor) && vistos.add(c.valor));
  },

  _email_(valor) {
    const email = String(valor || '').trim();
    return /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email) ? email : '';
  },

  /**
   * Avisa a las familias de los convocados de una sesión ya cancelada por el canal elegido.
   * Quien no tiene teléfono (WhatsApp) o correo (Correo) se omite sin afectar al resto. 'copiar' no envía nada:
   * devuelve el mensaje para que el entrenador lo pegue donde quiera.
   * @param {Object} sesion - Sesión cancelada (con MotivoCancelacion y DetalleCancelacion)
   * @param {string} canal  - Uno de CONFIG.CANALES_AVISO_CANCELACION
   * @returns {{ canal: string, mensaje?: string, convocados?: number, avisados?: number, omitidos?: number,
   *   fallidos?: number, modo?: string, enlaces?: Object[] }}
   */
  avisarCancelacionAFamilias(sesion, canal) {
    if (canal === 'ninguno') return { canal: canal };
    const equipo = findById(CONFIG.SHEETS.EQUIPOS, sesion.ID_Equipo);
    const mensaje = Notificaciones.mensajeCancelacion(sesion, equipo, sesion.MotivoCancelacion, sesion.DetalleCancelacion);
    const jugadores = Sesiones.convocados(sesion);
    const resultado = { canal: canal, mensaje: mensaje, convocados: jugadores.length, avisados: 0, omitidos: 0, fallidos: 0 };
    if (canal === 'copiar') return resultado;

    const familias = jugadores.map(j => ({
      jugador: [j.Nombre, j.Apellidos].filter(Boolean).join(' '),
      contactos: Notificaciones.contactosFamilia(j, canal),
    }));
    resultado.omitidos = familias.filter(f => !f.contactos.length).length;
    const conContacto = familias.filter(f => f.contactos.length);
    if (canal === 'correo') return Object.assign(resultado, Notificaciones._avisarCancelacionPorCorreo_(conContacto, sesion, equipo, mensaje));

    // WhatsApp: un aviso por número; los hermanos con el mismo número comparten aviso.
    const destinos = [], porNumero = {};
    conContacto.forEach((f, i) => f.contactos.forEach(c => {
      if (!porNumero[c.valor]) destinos.push(porNumero[c.valor] = { telefono: c.valor, nombre: c.nombre, jugadores: [], familias: [] });
      porNumero[c.valor].jugadores.push(f.jugador);
      porNumero[c.valor].familias.push(i);
    }));
    const parametros = Notificaciones._partesCancelacion_(sesion, equipo, sesion.MotivoCancelacion, sesion.DetalleCancelacion);
    const envio = WhatsApp.avisar(destinos, mensaje, parametros);
    // Una familia cuenta como avisada si al menos uno de sus números recibió el aviso (o tiene su enlace).
    const avisadas = new Set();
    envio.enviados.forEach(d => d.familias.forEach(i => avisadas.add(i)));
    const sinAviso = new Set();
    envio.fallidos.forEach(d => d.familias.forEach(i => { if (!avisadas.has(i)) sinAviso.add(i); }));
    const enlace = d => ({ nombre: d.nombre, jugadores: d.jugadores, telefono: d.telefono, url: d.url });
    return Object.assign(resultado, {
      modo: envio.modo,
      avisados: avisadas.size,
      fallidos: sinAviso.size,
      enlaces: (envio.modo === 'enlaces' ? envio.enviados : envio.fallidos).map(enlace),
    });
  },

  // Un correo por familia (sus direcciones en «Para»): ninguna familia ve las direcciones de las demás.
  _avisarCancelacionPorCorreo_(familias, sesion, equipo, mensaje) {
    const enviados = new Set();
    let avisados = 0, fallidos = 0;
    const asunto = `CB Baeza — Entrenamiento cancelado: ${equipo ? equipo.Nombre : 'tu equipo'} (${Notificaciones._formatFecha(sesion.Fecha)})`;
    const cuerpo = `Hola,\n\n${mensaje}\n\nUn saludo,\nCB Baeza — Gestión de Asistencia`;
    familias.forEach(f => {
      const pendientes = f.contactos.map(c => c.valor).filter(email => !enviados.has(email));
      if (!pendientes.length) { avisados++; return; } // un hermano ya lo envió a estas direcciones
      try {
        MailApp.sendEmail({ to: pendientes.join(','), subject: asunto, body: cuerpo });
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
