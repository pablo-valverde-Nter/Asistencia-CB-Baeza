// Cancelar entrenamiento: validación, firma del endpoint, convocados y avisos a las familias.
// MailApp, UrlFetchApp y PropertiesService son simulados: ningún aviso sale del proceso de test.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const AHORA = '2026-11-11 10:00';

function servidor({ propiedades = {}, correoFalla = () => false, whatsappCodigo = () => 200 } = {}) {
  const rows = {};
  const writes = [];
  const correos = [];
  const peticiones = [];
  const logs = [];
  const igual = (a, b) => String(a) === String(b);
  const context = vm.createContext({
    Auth: { requireEntrenadorOAdmin() {} },
    Logger: { log: mensaje => logs.push(String(mensaje)) },
    MailApp: {
      sendEmail(opciones) {
        if (correoFalla(opciones)) throw new Error('Cuota agotada para ' + opciones.to);
        correos.push(opciones);
      },
    },
    UrlFetchApp: {
      fetch(url, opciones) {
        const cuerpo = JSON.parse(opciones.payload);
        peticiones.push({ url, opciones, cuerpo });
        return { getResponseCode: () => whatsappCodigo(cuerpo.to) };
      },
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: clave => propiedades[clave] ?? null }) },
    getSheetData: table => rows[table] || [],
    findById: (table, id) => (rows[table] || []).find(row => igual(row.ID, id)) || null,
    findWhere: (table, field, value) => (rows[table] || []).filter(row => igual(row[field], value)),
    findWhereIn: (table, field, values) => (rows[table] || []).filter(row => values.map(String).includes(String(row[field]))),
    updateRow(table, id, changes) {
      writes.push({ op: 'update', table, id, changes });
      const row = (rows[table] || []).find(r => igual(r.ID, id));
      if (!row) return false;
      Object.assign(row, changes);
      return true;
    },
    appendRow(table, fields) { writes.push({ op: 'append', table, fields }); return { ID: 'nuevo', ...fields }; },
    deleteRow() { throw new Error('Borrado inesperado.'); },
  });
  for (const file of ['Config.gs', 'Asistencia.gs', 'Sesiones.gs', 'Notificaciones.gs', 'WhatsApp.gs', 'Code.gs']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
  }
  const api = vm.runInContext('({ CONFIG, Asistencia, Sesiones, Notificaciones, WhatsApp })', context);
  api.Asistencia._timestamp_ = () => AHORA;
  const T = api.CONFIG.SHEETS;
  rows[T.EQUIPOS] = [{ ID: 'e1', Nombre: 'Cadete Masculino' }];
  rows[T.SESIONES] = [{ ID: 's1', ID_Equipo: 'e1', Fecha: '2026-11-16', HoraInicio: '19:00', HoraFin: '20:30' }];
  rows[T.JUGADORES] = [];
  rows[T.JUGADORES_EQUIPOS] = [];
  rows[T.ASIST_JUGADORES] = [];
  const cancelar = (motivo, opciones) => {
    context.args = [motivo, opciones];
    return vm.runInContext("cancelarSesion({}, 's1', args[0], args[1])", context);
  };
  // Jugador ficticio de la plantilla de e1 (o de otro equipo con equipo: …).
  const jugador = (id, datos = {}, { equipo = 'e1', activo = true, tipo = 'Principal' } = {}) => {
    rows[T.JUGADORES].push({ ID: id, Nombre: 'Nombre ' + id, Apellidos: 'Apellido', ...datos });
    if (equipo) rows[T.JUGADORES_EQUIPOS].push({ ID: 'rel-' + id, ID_Jugador: id, ID_Equipo: equipo, Activo: activo, Tipo: tipo });
  };
  return { ...api, rows, writes, correos, peticiones, logs, cancelar, jugador, context };
}

const MOTIVO = 'Climatología';

test('motivo obligatorio y válido, detalle opcional de texto acotado: nada se escribe si falla', () => {
  const s = servidor();
  for (const motivo of [undefined, '', 'Inventado']) {
    assert.equal(s.cancelar(motivo).error, 'Motivo de cancelación no válido.');
  }
  assert.equal(s.cancelar(MOTIVO, { detalle: 42 }).error, 'Detalle de cancelación no válido.');
  assert.equal(s.cancelar(MOTIVO, { detalle: 'x'.repeat(301) }).error, 'El detalle de la cancelación admite como máximo 300 caracteres.');
  assert.equal(s.writes.length, 0);
});

test('el detalle se guarda en una línea y se borra al reactivar; sin detalle queda vacío', () => {
  const s = servidor();
  const res = s.cancelar(MOTIVO, { detalle: '  Pista\n  mojada,   recuperamos el jueves  ' });
  assert.equal(res.success, true);
  assert.equal(res.sesion.DetalleCancelacion, 'Pista mojada, recuperamos el jueves');
  assert.deepEqual({ ...s.writes[0].changes }, { Cancelada: true, MotivoCancelacion: MOTIVO, DetalleCancelacion: 'Pista mojada, recuperamos el jueves', FechaCancelacion: AHORA });
  const reactivada = s.Sesiones.reactivarSesion('s1');
  assert.equal(reactivada.DetalleCancelacion, null);
  assert.equal(reactivada.MotivoCancelacion, null);
  assert.equal(s.cancelar(MOTIVO, { detalle: '   ' }).sesion.DetalleCancelacion, null);
});

test('una sesión ya cancelada no se vuelve a cancelar (no repite avisos)', () => {
  const s = servidor();
  s.jugador('j1', { EmailPadre1: 'familia1@example.test' });
  assert.equal(s.cancelar(MOTIVO, { canal: 'correo' }).success, true);
  assert.equal(s.correos.length, 1);
  assert.equal(s.cancelar(MOTIVO, { canal: 'correo' }).error, 'La sesión ya está cancelada.');
  assert.equal(s.correos.length, 1);
  assert.equal(s.writes.length, 1);
});

test('la firma anterior (sin opciones) cancela sin avisar; un canal desconocido falla antes de escribir', () => {
  const s = servidor();
  s.jugador('j1', { TelefonoPadre1: '600111222', EmailPadre1: 'familia1@example.test' });
  assert.equal(s.cancelar(MOTIVO, { canal: 'sms' }).error, 'Forma de aviso no válida.');
  assert.equal(s.writes.length, 0);
  const res = s.cancelar(MOTIVO);
  assert.equal(res.success, true);
  assert.deepEqual(JSON.parse(JSON.stringify(res.notificacion)), { canal: 'ninguno' });
  assert.equal(s.correos.length + s.peticiones.length, 0);
});

test('convocados: plantilla activa (principal y secundaria) e invitados guardados, sin quitados ni bajas', () => {
  const s = servidor();
  const T = s.CONFIG.SHEETS;
  s.jugador('principal');
  s.jugador('secundario', {}, { tipo: 'Secundario' });
  s.jugador('baja', {}, { activo: false });
  s.jugador('otro-equipo', {}, { equipo: 'e2' });
  s.jugador('invitado', {}, { equipo: 'e2' });
  s.jugador('quitado');
  s.rows[T.ASIST_JUGADORES] = [
    { ID: 'a1', ID_Sesion: 's1', ID_Jugador: 'invitado', EsInvitado: true, Excluido: false },
    { ID: 'a2', ID_Sesion: 's1', ID_Jugador: 'quitado', Excluido: 'TRUE' },
    { ID: 'a3', ID_Sesion: 'otra', ID_Jugador: 'otro-equipo', EsInvitado: true },
  ];
  const ids = s.Sesiones.convocados(s.rows[T.SESIONES][0]).map(j => j.ID).sort();
  assert.deepEqual(ids, ['invitado', 'principal', 'secundario']);
});

test('el mensaje lleva equipo, día, fecha, hora, motivo y detalle; el cliente muestra y copia el mismo texto', () => {
  const s = servidor();
  const sesion = s.rows[s.CONFIG.SHEETS.SESIONES][0];
  const equipo = s.rows[s.CONFIG.SHEETS.EQUIPOS][0];
  const conDetalle = s.Notificaciones.mensajeCancelacion(sesion, equipo, MOTIVO, 'Pista mojada');
  assert.equal(conDetalle, 'CB Baeza: se cancela el entrenamiento de Cadete Masculino del lunes 16/11/2026 a las 19:00. Motivo: Climatología. Información adicional: Pista mojada.');
  assert.equal(s.Notificaciones.mensajeCancelacion(sesion, equipo, MOTIVO, '¿Recuperamos el jueves?'),
    'CB Baeza: se cancela el entrenamiento de Cadete Masculino del lunes 16/11/2026 a las 19:00. Motivo: Climatología. Información adicional: ¿Recuperamos el jueves?', 'sin punto doble');
  assert.equal(s.Notificaciones.mensajeCancelacion(sesion, equipo, 'Otro', ''), 'CB Baeza: se cancela el entrenamiento de Cadete Masculino del lunes 16/11/2026 a las 19:00. Motivo: Otro.');

  const document = { addEventListener() {}, querySelectorAll: () => [], getElementById: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} } }) };
  const cliente = vm.createContext({ document, window: { addEventListener() {} }, localStorage: { getItem: () => null, setItem() {} }, navigator: {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8').replace(/^<script[^>]*>|<\/script>\s*$/g, ''), cliente);
  const app = vm.runInContext('App', cliente);
  for (const [fecha, detalle] of [['2026-11-16', 'Pista mojada'], ['2026-11-16', 'Recuperamos el jueves.'], ['2026-11-18', ''], ['fecha-rara', '']]) {
    const otra = { ...sesion, Fecha: fecha };
    assert.equal(app.views.cancelarSesion.mensaje(otra, equipo, MOTIVO, detalle), s.Notificaciones.mensajeCancelacion(otra, equipo, MOTIVO, detalle));
  }
});

test('copiar devuelve el mensaje sin enviar nada', () => {
  const s = servidor();
  s.jugador('j1', { TelefonoPadre1: '600111222', EmailPadre1: 'familia1@example.test' });
  const n = s.cancelar(MOTIVO, { canal: 'copiar', detalle: 'Pista mojada' }).notificacion;
  assert.equal(n.canal, 'copiar');
  assert.match(n.mensaje, /Información adicional: Pista mojada\.$/);
  assert.equal(n.convocados, 1);
  assert.equal(s.correos.length + s.peticiones.length, 0);
});

test('correo: uno por familia a sus tutores, omite sin correo o con avisos desactivados y no repite a hermanos', () => {
  const s = servidor();
  s.jugador('ana', { EmailPadre1: 'madre@example.test', EmailPadre2: 'padre@example.test' });
  s.jugador('hermano', { EmailPadre1: 'madre@example.test' });
  s.jugador('adulto', { Email: 'adulto@example.test' });
  s.jugador('desactivado', { EmailPadre1: 'no-quiere@example.test', NotificarAusenciasPadre1: false, Email: 'propio@example.test' });
  s.jugador('sin-datos', { TelefonoPadre1: '600111222' });
  s.jugador('invalido', { EmailPadre1: 'no-es-un-correo' });
  const n = s.cancelar(MOTIVO, { canal: 'correo' }).notificacion;
  assert.deepEqual(s.correos.map(c => c.to), ['madre@example.test,padre@example.test', 'adulto@example.test']);
  assert.ok(s.correos.every(c => c.subject === 'CB Baeza — Entrenamiento cancelado: Cadete Masculino (16/11/2026)' && c.body.includes(n.mensaje)));
  assert.equal(n.convocados, 6);
  assert.equal(n.avisados, 3, 'el hermano cuenta como avisado: su familia ya recibió el correo');
  assert.equal(n.omitidos, 3);
  assert.equal(n.fallidos, 0);
});

test('correo: un envío fallido no impide el resto ni deja datos personales en el log', () => {
  const s = servidor({ correoFalla: ({ to }) => to === 'falla@example.test' });
  s.jugador('j1', { EmailPadre1: 'falla@example.test' });
  s.jugador('j2', { EmailPadre1: 'ok@example.test' });
  const res = s.cancelar(MOTIVO, { canal: 'correo' });
  assert.equal(res.success, true);
  assert.equal(res.sesion.Cancelada, true);
  assert.deepEqual(s.correos.map(c => c.to), ['ok@example.test']);
  assert.equal(res.notificacion.avisados, 1);
  assert.equal(res.notificacion.fallidos, 1);
  assert.ok(s.logs.length && s.logs.every(l => !l.includes('@')));
});

test('WhatsApp sin Cloud API: un enlace wa.me por número con el mensaje, sin enviar nada; sin teléfono se omite', () => {
  const s = servidor();
  s.jugador('ana', { NombrePadre1: 'Marta', ApellidosPadre1: 'Ruiz', TelefonoPadre1: '600 111 222', TelefonoPadre2: '+34 600-333-444' });
  s.jugador('hermano', { TelefonoPadre1: '0034600111222' });
  s.jugador('adulto', { Telefono: '611222333' });
  s.jugador('sin-telefono', { EmailPadre1: 'familia@example.test' });
  s.jugador('invalido', { TelefonoPadre1: '123' });
  const n = s.cancelar(MOTIVO, { canal: 'whatsapp', detalle: 'Pista mojada' }).notificacion;
  assert.equal(n.modo, 'enlaces');
  assert.equal(s.peticiones.length + s.correos.length, 0);
  assert.equal(n.avisados, 3);
  assert.equal(n.omitidos, 2);
  assert.equal(n.fallidos, 0);
  const texto = encodeURIComponent(n.mensaje);
  assert.deepEqual(JSON.parse(JSON.stringify(n.enlaces)), [
    { nombre: 'Marta Ruiz', jugadores: ['Nombre ana Apellido', 'Nombre hermano Apellido'], telefono: '+34600111222', url: 'https://wa.me/34600111222?text=' + texto },
    { nombre: '', jugadores: ['Nombre ana Apellido'], telefono: '+34600333444', url: 'https://wa.me/34600333444?text=' + texto },
    { nombre: 'Nombre adulto Apellido', jugadores: ['Nombre adulto Apellido'], telefono: '+34611222333', url: 'https://wa.me/34611222333?text=' + texto },
  ]);
});

test('WhatsApp con Cloud API: plantilla por número; un fallo vuelve como enlace y no cuenta como avisado', () => {
  const s = servidor({
    propiedades: { WHATSAPP_TOKEN: 'token-de-prueba', WHATSAPP_PHONE_ID: '1234567890' },
    whatsappCodigo: to => (to === '34600999888' ? 400 : 200),
  });
  s.jugador('ok', { TelefonoPadre1: '600111222' });
  s.jugador('falla', { TelefonoPadre1: '600999888' });
  s.jugador('sin-telefono');
  const n = s.cancelar(MOTIVO, { canal: 'whatsapp', detalle: 'Pista mojada' }).notificacion;
  assert.equal(n.modo, 'cloud-api');
  assert.equal(s.peticiones.length, 2);
  const [primera] = s.peticiones;
  assert.equal(primera.url, 'https://graph.facebook.com/v21.0/1234567890/messages');
  assert.equal(primera.opciones.headers.Authorization, 'Bearer token-de-prueba');
  assert.equal(primera.opciones.muteHttpExceptions, true);
  assert.deepEqual(primera.cuerpo, {
    messaging_product: 'whatsapp', to: '34600111222', type: 'template',
    template: { name: 'cancelacion_entrenamiento', language: { code: 'es' }, components: [{ type: 'body', parameters: [
      { type: 'text', text: 'Cadete Masculino' },
      { type: 'text', text: 'lunes 16/11/2026 a las 19:00' },
      { type: 'text', text: 'Climatología. Información adicional: Pista mojada.' },
    ] }] },
  });
  assert.equal(n.avisados, 1);
  assert.equal(n.fallidos, 1);
  assert.equal(n.omitidos, 1);
  assert.deepEqual([...n.enlaces.map(e => e.telefono)], ['+34600999888']);
  assert.ok(s.logs.every(l => !l.includes('600') && !l.includes('token')));
});

test('WhatsApp: plantilla e idioma configurables; sin teléfono o sin ID de número se usa el modo enlaces', () => {
  const conPlantilla = servidor({ propiedades: { WHATSAPP_TOKEN: 't', WHATSAPP_PHONE_ID: '1', WHATSAPP_TEMPLATE: 'aviso_club', WHATSAPP_TEMPLATE_LANG: 'es_ES' } });
  conPlantilla.jugador('j1', { TelefonoPadre1: '600111222' });
  conPlantilla.cancelar(MOTIVO, { canal: 'whatsapp' });
  assert.deepEqual(conPlantilla.peticiones[0].cuerpo.template.name, 'aviso_club');
  assert.deepEqual(conPlantilla.peticiones[0].cuerpo.template.language, { code: 'es_ES' });

  const incompleta = servidor({ propiedades: { WHATSAPP_TOKEN: 't' } });
  incompleta.jugador('j1', { TelefonoPadre1: '600111222' });
  assert.equal(incompleta.cancelar(MOTIVO, { canal: 'whatsapp' }).notificacion.modo, 'enlaces');
  assert.equal(incompleta.peticiones.length, 0);
});

test('si fallan los avisos la sesión queda cancelada y la respuesta lo explica', () => {
  const s = servidor();
  s.Sesiones.convocados = () => { throw new Error('Supabase caído'); };
  const res = s.cancelar(MOTIVO, { canal: 'correo' });
  assert.equal(res.success, true);
  assert.equal(res.sesion.Cancelada, true);
  assert.equal(res.notificacion.error, 'El entrenamiento se ha cancelado, pero no se pudieron preparar los avisos a las familias.');
});
