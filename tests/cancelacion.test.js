// Cancelar entrenamiento: validación, cancelación primero y aviso después.
// MailApp es simulado: ningún aviso sale del proceso de test.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const AHORA = '2026-11-11 10:00';

function servidor({ correoFalla = () => false } = {}) {
  const rows = {};
  const writes = [];
  const correos = [];
  const logs = [];
  const igual = (a, b) => String(a) === String(b);
  const context = vm.createContext({
    Auth: { requireEntrenadorOAdmin() {}, getEntrenadorActual: () => ({ Nombre: 'Ana', Apellidos: 'Pérez' }) },
    Logger: { log: mensaje => logs.push(String(mensaje)) },
    MailApp: {
      sendEmail(opciones) {
        if (correoFalla(opciones)) throw new Error('Cuota agotada para ' + opciones.to);
        correos.push(opciones);
      },
    },
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
  for (const file of ['Config.gs', 'Asistencia.gs', 'Sesiones.gs', 'Notificaciones.gs', 'Code.gs']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
  }
  const api = vm.runInContext('({ CONFIG, Asistencia, Sesiones, Notificaciones })', context);
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
  const avisar = canal => {
    context.canal = canal;
    return vm.runInContext("avisarCancelacion({}, 's1', canal)", context);
  };
  const jugador = (id, datos = {}, { equipo = 'e1', activo = true, tipo = 'Principal' } = {}) => {
    rows[T.JUGADORES].push({ ID: id, Nombre: 'Nombre ' + id, Apellidos: 'Apellido', ...datos });
    if (equipo) rows[T.JUGADORES_EQUIPOS].push({ ID: 'rel-' + id, ID_Jugador: id, ID_Equipo: equipo, Activo: activo, Tipo: tipo });
  };
  return { ...api, rows, writes, correos, logs, cancelar, avisar, jugador, context };
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

test('el detalle se guarda en una línea y se borra al reactivar; el canal queda vacío hasta avisar', () => {
  const s = servidor();
  const res = s.cancelar(MOTIVO, { detalle: '  Pista\n  mojada,   recuperamos el jueves  ' });
  assert.equal(res.success, true);
  assert.equal(res.sesion.DetalleCancelacion, 'Pista mojada, recuperamos el jueves');
  assert.equal(res.notificacion, undefined);
  assert.deepEqual({ ...s.writes[0].changes }, { Cancelada: true, MotivoCancelacion: MOTIVO, DetalleCancelacion: 'Pista mojada, recuperamos el jueves', FechaCancelacion: AHORA, CanceladoPor: 'Ana Pérez', CanalAvisoCancelacion: null });
  const reactivada = s.Sesiones.reactivarSesion('s1');
  assert.equal(reactivada.DetalleCancelacion, null);
  assert.equal(reactivada.MotivoCancelacion, null);
  assert.equal(s.cancelar(MOTIVO, { detalle: '   ' }).sesion.DetalleCancelacion, null);
});

test('una sesión ya cancelada no se vuelve a cancelar; avisar no se puede repetir', () => {
  const s = servidor();
  s.jugador('j1', { EmailPadre1: 'familia1@example.test' });
  assert.equal(s.cancelar(MOTIVO).success, true);
  assert.equal(s.correos.length, 0);
  assert.equal(s.avisar('correo').success, true);
  assert.equal(s.correos.length, 1);
  assert.equal(s.cancelar(MOTIVO).error, 'La sesión ya está cancelada.');
  assert.equal(s.avisar('correo').error, 'El aviso a las familias ya está registrado.');
  assert.equal(s.correos.length, 1);
  assert.equal(s.writes.length, 2);
});

test('cancelar no avisa; un canal desconocido o una sesión activa fallan en avisar sin escribir', () => {
  const s = servidor();
  s.jugador('j1', { TelefonoPadre1: '600111222', EmailPadre1: 'familia1@example.test' });
  assert.equal(s.avisar('correo').error, 'La sesión no está cancelada.');
  assert.equal(s.writes.length, 0);
  const res = s.cancelar(MOTIVO);
  assert.equal(res.success, true);
  assert.equal(res.notificacion, undefined);
  assert.equal(res.sesion.CanalAvisoCancelacion, null);
  assert.equal(s.avisar('sms').error, 'Forma de aviso no válida.');
  assert.equal(s.writes.length, 1);
  assert.equal(s.correos.length, 0);
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

test('el mensaje exacto lleva equipo, fecha, motivo y firma; cliente y servidor coinciden', () => {
  const s = servidor();
  const sesion = s.rows[s.CONFIG.SHEETS.SESIONES][0];
  const equipo = s.rows[s.CONFIG.SHEETS.EQUIPOS][0];
  sesion.CanceladoPor = 'Ana Pérez';
  const conDetalle = s.Notificaciones.mensajeCancelacion(sesion, equipo, MOTIVO, 'Pista mojada');
  assert.equal(conDetalle, '❌ *Entrenamiento cancelado*\n🏀 Equipo Cadete Masculino\n📅 lunes 16/11/2026 a las 19:00\n📝 Motivo: Climatología\nPista mojada\n\nUn saludo,\nAna Pérez');
  assert.equal(s.Notificaciones.mensajeCancelacion(sesion, equipo, 'Otro', ''),
    '❌ *Entrenamiento cancelado*\n🏀 Equipo Cadete Masculino\n📅 lunes 16/11/2026 a las 19:00\n📝 Motivo: Otro\n\nUn saludo,\nAna Pérez');
  for (const firma of [null, '   ']) {
    assert.ok(s.Notificaciones.mensajeCancelacion({ ...sesion, CanceladoPor: firma }, equipo, MOTIVO, '').endsWith('\nUn saludo,\nCB Baeza'));
  }

  const document = { addEventListener() {}, querySelectorAll: () => [], getElementById: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} } }) };
  const cliente = vm.createContext({ document, window: { addEventListener() {} }, localStorage: { getItem: () => null, setItem() {} }, navigator: {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8').replace(/^<script[^>]*>|<\/script>\s*$/g, ''), cliente);
  const app = vm.runInContext('App', cliente);
  for (const [fecha, detalle, firma] of [['2026-11-16', 'Pista mojada', 'Ana Pérez'], ['2026-11-16', 'Recuperamos el jueves.', ' Ana Pérez '], ['2026-11-18', '', null], ['fecha-rara', '', '  ']]) {
    const otra = { ...sesion, Fecha: fecha, CanceladoPor: firma };
    assert.equal(app.views.cancelarSesion.mensaje(otra, equipo, MOTIVO, detalle), s.Notificaciones.mensajeCancelacion(otra, equipo, MOTIVO, detalle));
  }
});

test('copiar y WhatsApp solo devuelven el mensaje, sin enviar nada', () => {
  const s = servidor();
  s.jugador('j1', { TelefonoPadre1: '600111222', EmailPadre1: 'familia1@example.test' });
  assert.equal(s.cancelar(MOTIVO, { detalle: 'Pista mojada' }).success, true);
  for (const canal of ['copiar', 'whatsapp']) {
    const otra = servidor();
    otra.jugador('j1', { TelefonoPadre1: '600111222', EmailPadre1: 'familia1@example.test' });
    otra.cancelar(MOTIVO, { detalle: 'Pista mojada' });
    const n = otra.avisar(canal).notificacion;
    assert.equal(n.canal, canal);
    assert.ok(n.mensaje.endsWith('\nPista mojada\n\nUn saludo,\nAna Pérez'));
    assert.equal(n.enlaces, undefined);
    assert.equal(n.convocados, undefined);
    assert.equal(otra.correos.length, 0);
  }
});

test('correo: uno por familia a sus tutores, omite sin correo o con avisos desactivados y no repite a hermanos', () => {
  const s = servidor();
  s.jugador('ana', { EmailPadre1: 'madre@example.test', EmailPadre2: 'padre@example.test' });
  s.jugador('hermano', { EmailPadre1: 'madre@example.test' });
  s.jugador('adulto', { Email: 'adulto@example.test' });
  s.jugador('desactivado', { EmailPadre1: 'no-quiere@example.test', NotificarAusenciasPadre1: false, Email: 'propio@example.test' });
  s.jugador('sin-datos', { TelefonoPadre1: '600111222' });
  s.jugador('invalido', { EmailPadre1: 'no-es-un-correo' });
  s.cancelar(MOTIVO);
  const n = s.avisar('correo').notificacion;
  assert.deepEqual(s.correos.map(c => c.to), ['madre@example.test,padre@example.test', 'adulto@example.test']);
  assert.ok(s.correos.every(c => c.subject === 'CB Baeza — Entrenamiento cancelado: Cadete Masculino (16/11/2026)' && c.body === n.mensaje && c.htmlBody.includes('<strong>Entrenamiento cancelado</strong>')));
  assert.ok(s.correos.every(c => !c.body.includes('@') && !c.htmlBody.includes('@')));
  assert.equal(n.convocados, 6);
  assert.equal(n.avisados, 3, 'el hermano cuenta como avisado: su familia ya recibió el correo');
  assert.equal(n.omitidos, 3);
  assert.equal(n.fallidos, 0);
});

test('correo HTML escapa equipo, detalle y firma, manteniendo los mismos datos en texto plano', () => {
  const s = servidor();
  s.jugador('j1', { EmailPadre1: 'familia@example.test' });
  s.rows[s.CONFIG.SHEETS.EQUIPOS][0].Nombre = 'Equipo <A> & "B"';
  const sesion = s.rows[s.CONFIG.SHEETS.SESIONES][0];
  Object.assign(sesion, { MotivoCancelacion: MOTIVO, DetalleCancelacion: 'Texto <script> & "algo"', CanceladoPor: "Ana O'Neil", Cancelada: true });
  const n = s.Notificaciones.avisarCancelacionAFamilias(sesion, 'correo');
  const correo = s.correos[0];
  assert.equal(correo.body, n.mensaje);
  assert.ok(correo.body.includes('Equipo <A> & "B"'));
  assert.ok(correo.body.includes('Texto <script> & "algo"'));
  assert.ok(correo.body.endsWith("Un saludo,\nAna O'Neil"));
  assert.ok(correo.htmlBody.includes('Equipo &lt;A&gt; &amp; &quot;B&quot;'));
  assert.ok(correo.htmlBody.includes('Texto &lt;script&gt; &amp; &quot;algo&quot;'));
  assert.ok(correo.htmlBody.includes('Ana O&#39;Neil'));
  assert.ok(!correo.htmlBody.includes('<script>'));
});

test('correo: un envío fallido no impide el resto ni deja datos personales en el log', () => {
  const s = servidor({ correoFalla: ({ to }) => to === 'falla@example.test' });
  s.jugador('j1', { EmailPadre1: 'falla@example.test' });
  s.jugador('j2', { EmailPadre1: 'ok@example.test' });
  assert.equal(s.cancelar(MOTIVO).success, true);
  const res = s.avisar('correo');
  assert.equal(res.success, true);
  assert.equal(res.sesion.Cancelada, true);
  assert.deepEqual(s.correos.map(c => c.to), ['ok@example.test']);
  assert.equal(res.notificacion.avisados, 1);
  assert.equal(res.notificacion.fallidos, 1);
  assert.ok(s.logs.length && s.logs.every(l => !l.includes('@')));
});

test('si fallan los avisos la sesión sigue cancelada, el canal queda guardado y la respuesta lo explica', () => {
  const s = servidor();
  assert.equal(s.cancelar(MOTIVO).success, true);
  s.Sesiones.convocados = () => { throw new Error('Supabase caído'); };
  const res = s.avisar('correo');
  assert.equal(res.success, true);
  assert.equal(res.sesion.Cancelada, true);
  assert.equal(res.sesion.CanalAvisoCancelacion, 'correo');
  assert.equal(res.notificacion.error, 'La cancelación se ha guardado, pero no se pudieron completar los avisos a las familias.');
});
