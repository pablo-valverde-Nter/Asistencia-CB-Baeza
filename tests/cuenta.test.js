const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function servidor() {
  const rows = {
    Jugadores: [{ ID: 'j1', Nombre: 'Ana <Club>', Apellidos: 'Pérez', Usuario: 'ana', PIN: '1234', CodigoPadres: 'ABC123', Email: 'ana@example.com', EmailPadre1: 'familia@example.com', EmailPadre2: 'familia2@example.com' },
      { ID: 'j2', Usuario: 'otro', PIN: '4567' }],
    Entrenadores: [{ ID: 'e1', Nombre: 'Luis', Email: 'coach@example.com', PIN: '2345' },
      { ID: 'e2', Nombre: 'Admin', Email: 'admin@example.com', PIN: '1111', EsAdmin: true }],
    Administradores: [{ ID: 'a1', Email: 'admin@example.com', PIN: '3456', Activo: true }],
  };
  const writes = [], mails = [], cache = new Map(), logs = [];
  const context = vm.createContext({
    Logger: { log: value => logs.push(value) },
    Utilities: { formatDate: () => '2026-10-29' },
    Session: { getScriptTimeZone: () => 'Europe/Madrid' },
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key), put: (key, value, ttl) => cache.set(key, { value, ttl }) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, hasLock: () => true, releaseLock() {} }) },
    MailApp: { sendEmail: mail => mails.push(mail) },
    getSheetData: table => rows[table] || [],
    findById: (table, id) => (rows[table] || []).find(row => row.ID === id),
    findWhere: (table, field, value) => (rows[table] || []).filter(row => row[field] === value),
    updateRow(table, id, fields) {
      writes.push({ table, id, fields: { ...fields } });
      const row = (rows[table] || []).find(row => row.ID === id);
      if (!row) return false;
      Object.assign(row, fields);
      return true;
    },
  });
  for (const file of ['Config.gs', 'Auth.gs', 'Equipos.gs', 'Notificaciones.gs', 'Code.gs']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
  }
  const jugador = { tipo: 'jugador', usuario: 'ana', pin: '1234' };
  const entrenador = { tipo: 'entrenador', email: 'coach@example.com', pin: '2345' };
  const admin = { tipo: 'entrenador', email: 'admin@example.com', pin: '3456' };
  return { rows, writes, mails, cache, logs, jugador, entrenador, admin,
    call(name, ...args) { return context[name](...args); } };
}

test('PIN actual incorrecto no escribe; cambiar usuario/PIN devuelve auth nuevo y exige unicidad', () => {
  const s = servidor();
  assert.equal(s.call('cambiarCredenciales', s.jugador, { pinActual: '9999', pinNuevo: '5678' }).success, false);
  assert.equal(s.call('cambiarCredenciales', s.jugador, { pinActual: '1234', usuarioNuevo: ' OTRO ' }).success, false);
  assert.equal(s.call('cambiarCredenciales', s.jugador, { pinActual: '1234', pinNuevo: '123' }).success, false);
  assert.equal(s.call('cambiarCredenciales', s.jugador, { pinActual: '1234', usuarioNuevo: '' }).success, false);
  assert.equal(s.writes.length, 0);
  const result = s.call('cambiarCredenciales', s.jugador, { pinActual: '1234', usuarioNuevo: ' AnaNueva ', pinNuevo: '5678' });
  assert.equal(result.success, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.auth)), { tipo: 'jugador', usuario: 'ananueva', pin: '5678' });
  assert.equal(s.rows.Jugadores[0].Usuario, 'ananueva');
  assert.equal(s.rows.Jugadores[0].PIN, '5678');
  assert.equal(s.call('actualizarFotoPerfil', result.auth, 'avatar:balon').success, true);
  assert.equal(s.call('actualizarFotoPerfil', s.jugador, 'avatar:balon').success, false);
});

test('admin cambia PIN en Administradores y el entrenador en Entrenadores', () => {
  for (const rol of ['admin', 'entrenador']) {
    const s = servidor();
    const result = s.call('cambiarCredenciales', s[rol], { pinActual: s[rol].pin, pinNuevo: '7890' });
    assert.equal(result.success, true);
    assert.equal(result.auth.pin, '7890');
    assert.equal(s.writes[0].table, rol === 'admin' ? 'Administradores' : 'Entrenadores');
    assert.equal(s.call('actualizarFotoPerfil', result.auth, '').success, true);
    if (rol === 'admin') {
      assert.equal(s.call('actualizarEntrenador', result.auth, 'e2', { Nombre: 'Nuevo nombre' }).success, true);
      assert.equal(s.rows.Administradores[0].PIN, '7890');
    }
  }
});

test('código de seguridad requiere antiguo y seis caracteres alfanuméricos; normaliza mayúsculas', () => {
  const s = servidor();
  assert.equal(s.call('cambiarCodigoSeguridad', s.jugador, 'XXXXXX', 'NEW123').success, false);
  for (const codigo of ['12345', '1234567', 'AB!123', '      ']) {
    assert.equal(s.call('cambiarCodigoSeguridad', s.jugador, 'ABC123', codigo).success, false);
  }
  assert.equal(s.call('cambiarCodigoSeguridad', s.entrenador, 'ABC123', 'NEW123').success, false);
  assert.equal(s.writes.length, 0);
  assert.equal(s.call('cambiarCodigoSeguridad', s.jugador, 'abc123', ' new123 ').success, true);
  assert.equal(s.rows.Jugadores[0].CodigoPadres, 'NEW123');
});

test('foto valida prefijo, tamaño y slug, y permite avatar, JPEG y eliminación para ambos perfiles', () => {
  const s = servidor();
  for (const foto of ['https://example.com/a.jpg', 'data:image/png;base64,YQ==', 'data:image/jpeg;base64,', 'data:image/jpeg;base64,!', 'avatar:Mayuscula', 'avatar:', 'avatar:' + 'a'.repeat(33), 'data:image/jpeg;base64,' + 'A'.repeat(16000), null]) {
    assert.equal(s.call('actualizarFotoPerfil', s.jugador, foto).success, false, String(foto).slice(0, 60));
  }
  assert.equal(s.writes.length, 0);
  for (const [auth, table] of [[s.jugador, 'Jugadores'], [s.entrenador, 'Entrenadores']]) {
    for (const foto of ['avatar:balon-1', 'data:image/jpeg;base64,/9j/2Q==', '']) {
      const result = s.call('actualizarFotoPerfil', auth, foto);
      assert.equal(result.success, true);
      assert.equal(result.fotoURL, foto);
      assert.equal(s.writes.at(-1).table, table);
      assert.equal(s.writes.at(-1).fields.FotoURL, foto);
    }
  }
  s.rows.Entrenadores = s.rows.Entrenadores.filter(row => row.ID !== 'e2');
  assert.equal(s.call('actualizarFotoPerfil', s.admin, '').error, 'Tu cuenta de administración no tiene ficha de entrenador.');
});

test('perfil jugador conserva autorización familiar; perfil entrenador solo actualiza datos personales', () => {
  const s = servidor();
  assert.equal(s.call('actualizarMiPerfil', s.jugador, { Telefono: '600123456' }, 'mal').success, false);
  assert.equal(s.writes.length, 0);
  assert.equal(s.call('actualizarMiPerfil', s.jugador, { Telefono: '600123456', PIN: '0000', Nombre: 'No' }, 'ABC123').success, true);
  assert.deepEqual(s.writes.at(-1).fields, { Telefono: '600123456' });
  assert.equal(s.call('actualizarMiPerfil', s.entrenador, { Nombre: 'Luis nuevo', EsAdmin: true, Email: 'hack@example.com', PIN: '0000' }).success, true);
  assert.deepEqual(s.writes.at(-1).fields, { Nombre: 'Luis nuevo' });
  assert.equal(s.rows.Entrenadores[0].PIN, '2345');
  assert.equal(s.writes.some(w => w.table === 'Administradores'), false);
});

test('recordatorio separa correo familiar con código y correo del jugador sin código; limita diez minutos', () => {
  const s = servidor();
  const result = s.call('enviarRecordatorioCredenciales', s.jugador);
  assert.equal(result.success, true);
  assert.equal(result.destinatarios, 3);
  for (const mail of s.mails) {
    assert.match(mail.body, /CB Baeza/);
    assert.match(mail.body, /Usuario: ana/);
    assert.match(mail.body, /PIN: 1234/);
    assert.match(mail.body, /No compartas/);
    assert.match(mail.htmlBody, /Ana &lt;Club&gt;/);
    if (mail.to === 'ana@example.com') {
      assert.doesNotMatch(mail.body + mail.htmlBody, /ABC123/);
    } else assert.match(mail.body, /Código de seguridad: ABC123/);
  }
  assert.equal(s.call('enviarRecordatorioCredenciales', s.jugador).error, 'Ya se ha enviado un correo hace poco. Inténtalo más tarde.');
  assert.equal(s.mails.length, 3);
  assert.equal([...s.cache.values()][0].ttl, 600);
  assert.equal(s.logs.length, 0);
});

test('sinCorreo no envía y recordatorios del personal usan su PIN de acceso real', () => {
  const s = servidor();
  Object.assign(s.rows.Jugadores[0], { Email: '', EmailPadre1: '', EmailPadre2: '' });
  const result = s.call('enviarRecordatorioCredenciales', s.jugador);
  assert.equal(result.success, false);
  assert.equal(result.sinCorreo, true);
  assert.equal(result.error, 'No hay ningún correo registrado. Contacta con tu entrenador.');
  assert.equal(s.mails.length, 0);
  assert.equal(s.cache.size, 0);
  assert.equal(s.call('enviarRecordatorioCredenciales', s.admin).success, true);
  assert.match(s.mails[0].body, /PIN: 3456/);
  assert.doesNotMatch(s.mails[0].body, /PIN: 1111|Código de seguridad:/);
  assert.equal(s.call('enviarRecordatorioCredenciales', s.entrenador).success, true);
  assert.match(s.mails[1].body, /PIN: 2345/);
});

test('actualizarEntrenador rechaza PIN falso, escalada y cambios de Email/PIN propios sin escribir', () => {
  const s = servidor();
  for (const auth of [{ ...s.entrenador, pin: '0000' }, { ...s.admin, pin: '0000' }]) {
    assert.equal(s.call('actualizarEntrenador', auth, 'e1', { Nombre: 'Intruso' }).success, false);
  }
  for (const campos of [{ EsAdmin: true }, { PIN: '0000' }, { Email: 'hack@example.com' }]) {
    assert.equal(s.call('actualizarEntrenador', s.entrenador, 'e1', campos).success, false);
  }
  assert.equal(s.writes.length, 0);
  assert.equal(s.call('actualizarEntrenador', s.entrenador, 'e1', { Nombre: 'Luis nuevo' }).success, true);
  assert.equal(s.writes.length, 1);
});

test('todos los endpoints de cuenta rechazan credenciales falsas antes de escribir o enviar', () => {
  const s = servidor();
  const auth = { ...s.jugador, pin: '0000' };
  for (const [name, args] of [
    ['actualizarFotoPerfil', ['']], ['actualizarMiPerfil', [{ Telefono: '1' }, 'ABC123']],
    ['cambiarCredenciales', [{ pinActual: '1234', pinNuevo: '9876' }]],
    ['cambiarCodigoSeguridad', ['ABC123', 'NEW123']], ['enviarRecordatorioCredenciales', []],
  ]) assert.equal(s.call(name, auth, ...args).success, false);
  assert.equal(s.writes.length, 0);
  assert.equal(s.mails.length, 0);
});
