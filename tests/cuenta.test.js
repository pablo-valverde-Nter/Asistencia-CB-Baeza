const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

function servidor() {
  const rows = {
    Jugadores: [{ ID: 'j1', Nombre: 'Ana <Club>', Apellidos: 'Pérez', Usuario: 'ana', PIN: '1234', CodigoPadres: 'ABC123', Email: 'ana@example.com', EmailPadre1: 'familia@example.com', EmailPadre2: 'familia2@example.com' },
      { ID: 'j2', Usuario: 'otro', PIN: '4567' }],
    Entrenadores: [{ ID: 'e1', Nombre: 'Luis', Email: 'coach@example.com', PIN: '2345' },
      { ID: 'e2', Nombre: 'Admin', Email: 'admin@example.com', PIN: '1111', EsAdmin: true }],
    Administradores: [{ ID: 'a1', Email: 'admin@example.com', PIN: '3456', Activo: true }],
  };
  const writes = [], mails = [], cache = new Map(), logs = [];
  let ahora = Date.now();
  class Reloj extends Date { static now() { return ahora; } }
  const context = vm.createContext({
    Logger: { log: value => logs.push(value) },
    Date: Reloj,
    Utilities: {
      formatDate: () => '2026-10-29', getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (algorithm, value) => crypto.createHash(algorithm).update(value).digest(),
      base64Encode: value => Buffer.from(value).toString('base64'),
    },
    Session: { getScriptTimeZone: () => 'Europe/Madrid' },
    CacheService: { getScriptCache: () => ({
      get(key) { const item = cache.get(key); return item && item.expira > ahora ? item.value : null; },
      put: (key, value, ttl) => cache.set(key, { value, ttl, expira: ahora + ttl * 1000 }),
      remove: key => cache.delete(key),
    }) },
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
  const admin = { tipo: 'entrenador', email: 'admin@example.com', pin: '1111' };
  return { rows, writes, mails, cache, logs, jugador, entrenador, admin,
    avanzar: ms => { ahora += ms; },
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

test('admin con ficha entra y cambia el PIN de entrenador, que se copia a Administradores', () => {
  const s = servidor();
  assert.equal(s.call('opcionesRecuperacion', { ...s.admin, pin: '3456' }).success, false, 'el PIN administrativo antiguo ya no vale');
  const result = s.call('cambiarCredenciales', s.admin, { pinActual: '1111', pinNuevo: '7890' });
  assert.equal(result.success, true);
  assert.equal(result.auth.pin, '7890');
  assert.deepEqual([s.rows.Entrenadores[1].PIN, s.rows.Administradores[0].PIN], ['7890', '7890']);
  assert.equal(s.call('actualizarFotoPerfil', result.auth, '').success, true);
  assert.equal(s.call('actualizarFotoPerfil', s.admin, '').success, false);
});

test('el entrenador cambia PIN en Entrenadores y el admin sin ficha en Administradores', () => {
  const s = servidor();
  const entrenador = s.call('cambiarCredenciales', s.entrenador, { pinActual: '2345', pinNuevo: '7890' });
  assert.equal(entrenador.success, true);
  assert.deepEqual(s.writes.map(w => w.table), ['Entrenadores']);
  s.rows.Entrenadores = s.rows.Entrenadores.filter(row => row.ID !== 'e2');
  const admin = { ...s.admin, pin: '3456' };
  const result = s.call('cambiarCredenciales', admin, { pinActual: '3456', pinNuevo: '4321' });
  assert.equal(result.success, true);
  assert.deepEqual([s.writes.at(-1).table, s.rows.Administradores[0].PIN], ['Administradores', '4321']);
});

test('conceder admin a un entrenador no pide PIN y usa el suyo', () => {
  const s = servidor();
  s.rows.Administradores.push({ ID: 'a2', Email: 'coach@example.com', PIN: '0000', Activo: false });
  assert.equal(s.call('actualizarEntrenador', s.admin, 'e1', { EsAdmin: true }).success, true);
  assert.deepEqual(JSON.parse(JSON.stringify(s.rows.Administradores[1])), { ID: 'a2', Email: 'coach@example.com', PIN: '2345', Activo: true });
  assert.equal(s.call('opcionesRecuperacion', s.entrenador).success, true);
  assert.equal(s.call('opcionesRecuperacion', { ...s.entrenador, pin: '0000' }).success, false);
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
  assert.equal(s.call('actualizarFotoPerfil', { ...s.admin, pin: '3456' }, '').error, 'Tu cuenta de administración no tiene ficha de entrenador.');
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

test('avisos por email: la familia no puede cambiarlos aunque mande el campo; entrenador y admin sí y se guardan como booleano', () => {
  const s = servidor();
  s.rows.Jugadores[0].NotificarAusenciasPadre1 = true;
  for (const call of [
    () => s.call('actualizarMiPerfil', s.jugador, { Telefono: '600123456', NotificarAusenciasPadre1: false, NotificarAusenciasPadre2: false }, 'ABC123'),
    () => s.call('actualizarPerfilJugador', s.jugador, 'j1', { NotificarAusenciasPadre1: false }, 'ABC123'),
  ]) assert.equal(call().success, true);
  assert.equal(s.writes.some(w => 'NotificarAusenciasPadre1' in w.fields || 'NotificarAusenciasPadre2' in w.fields), false);
  assert.equal(s.rows.Jugadores[0].NotificarAusenciasPadre1, true);
  assert.equal(s.call('actualizarJugador', s.jugador, 'j1', { NotificarAusenciasPadre1: false }).success, false, 'el endpoint de staff rechaza a jugadores');

  assert.equal(s.call('actualizarJugador', s.entrenador, 'j1', { NotificarAusenciasPadre1: false, NotificarAusenciasPadre2: 'TRUE' }).success, true);
  assert.deepEqual(s.writes.at(-1), { table: 'Jugadores', id: 'j1', fields: { NotificarAusenciasPadre1: false, NotificarAusenciasPadre2: true } });
  assert.equal(s.call('actualizarPerfilJugador', s.admin, 'j1', { NotificarAusenciasPadre1: 'false' }).success, true);
  assert.deepEqual(s.writes.at(-1).fields, { NotificarAusenciasPadre1: false });
  assert.equal(s.rows.Jugadores[0].NotificarAusenciasPadre1, false);
});

test('opciones de recuperación enmascaradas por rol y sinCorreo', () => {
  const s = servidor();
  s.rows.Jugadores[0].NombrePadre1 = 'María';
  const destinos = s.call('opcionesRecuperacion', s.jugador).destinos;
  assert.deepEqual(Array.from(destinos, d => d.id), ['jugador', 'tutor1', 'tutor2']);
  assert.equal(destinos[1].etiqueta, 'Tutor 1 · María');
  assert.equal(destinos[2].etiqueta, 'Tutor 2');
  assert.equal(destinos[0].email, 'an***@ex***.com');
  assert.ok(destinos.every(d => !['ana@example.com', 'familia@example.com', 'familia2@example.com'].includes(d.email)));
  for (const rol of ['entrenador', 'admin']) {
    const opciones = s.call('opcionesRecuperacion', s[rol]);
    assert.equal(opciones.destinos.length, 1);
    assert.equal(opciones.destinos[0].id, 'cuenta');
    assert.notEqual(opciones.destinos[0].email, s[rol].email);
  }
  Object.assign(s.rows.Jugadores[0], { Email: '', EmailPadre1: '', EmailPadre2: '' });
  const result = s.call('opcionesRecuperacion', s.jugador);
  assert.equal(result.sinCorreo, true);
  assert.equal(result.error, 'No tienes ningún correo registrado. Contacta con tu entrenador.');
});

function codigoCorreo(s) {
  return s.mails.at(-1).body.match(/Código de verificación: (\d{6})/)[1];
}

test('recuperación envía solo al destino elegido, no devuelve código ni credenciales y limita solicitudes', () => {
  const s = servidor();
  assert.equal(s.call('solicitarCodigoRecuperacion', s.jugador, 'invalido').success, false);
  assert.equal(s.mails.length, 0);
  const result = s.call('solicitarCodigoRecuperacion', s.jugador, 'tutor2');
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { success: true, expiraEnMin: 10 });
  assert.equal(s.mails.length, 1);
  assert.equal(s.mails[0].to, 'familia2@example.com');
  assert.match(s.mails[0].body, /10 minutos/);
  assert.doesNotMatch(s.mails[0].body, /PIN: 1234|ABC123/);
  const codigo = codigoCorreo(s);
  const desafio = s.cache.get('recuperacion:jugador:j1');
  assert.equal(desafio.ttl, 600);
  assert.equal(JSON.parse(desafio.value).hash, crypto.createHash('sha256').update(codigo + ':recuperacion:jugador:j1').digest('base64'));
  assert.doesNotMatch(desafio.value, new RegExp('"codigo":"' + codigo + '"'));
  assert.equal(s.call('solicitarCodigoRecuperacion', s.jugador, 'jugador').error, 'Espera un minuto antes de pedir otro código.');
  assert.equal(s.logs.length, 0);
});

test('código correcto es de un uso y solo destinos de tutor recuperan código familiar', () => {
  for (const destino of ['jugador', 'tutor1', 'tutor2']) {
    const s = servidor();
    s.call('solicitarCodigoRecuperacion', s.jugador, destino);
    const codigo = codigoCorreo(s);
    const result = s.call('verificarCodigoRecuperacion', s.jugador, codigo);
    assert.equal(result.success, true);
    assert.equal(result.pin, '1234');
    assert.equal(result.codigoSeguridad, destino === 'jugador' ? undefined : 'ABC123');
    assert.equal(s.call('verificarCodigoRecuperacion', s.jugador, codigo).error, 'El código ha caducado o no existe. Solicita uno nuevo.');
  }
  for (const rol of ['admin', 'entrenador']) {
    const s = servidor();
    s.call('solicitarCodigoRecuperacion', s[rol], 'cuenta');
    assert.equal(s.mails[0].to, s[rol].email);
    const result = s.call('verificarCodigoRecuperacion', s[rol], codigoCorreo(s));
    assert.equal(result.pin, s[rol].pin);
    assert.equal(result.codigoSeguridad, undefined);
  }
});

test('cinco fallos eliminan el desafío y fallos anteriores conservan la caducidad', () => {
  const s = servidor();
  s.call('solicitarCodigoRecuperacion', s.jugador, 'tutor1');
  const codigo = codigoCorreo(s);
  const incorrecto = codigo === '999999' ? '888888' : '999999';
  s.avanzar(300000);
  for (let intento = 1; intento <= 5; intento++) {
    const result = s.call('verificarCodigoRecuperacion', s.jugador, incorrecto);
    assert.equal(result.error, intento === 5 ? 'Demasiados intentos. Solicita un código nuevo.' : 'Código incorrecto.');
    if (intento < 5) assert.equal(s.cache.get('recuperacion:jugador:j1').ttl, 300);
  }
  assert.equal(s.call('verificarCodigoRecuperacion', s.jugador, codigo).success, false);
});

test('caduca a diez minutos y una solicitud nueva reemplaza la anterior después de un minuto', () => {
  const s = servidor();
  s.call('solicitarCodigoRecuperacion', s.jugador, 'jugador');
  const previo = codigoCorreo(s);
  s.avanzar(60000);
  assert.equal(s.call('solicitarCodigoRecuperacion', s.jugador, 'tutor1').success, true);
  assert.equal(JSON.parse(s.cache.get('recuperacion:jugador:j1').value).destinoId, 'tutor1');
  const nuevo = codigoCorreo(s);
  if (nuevo !== previo) assert.equal(s.call('verificarCodigoRecuperacion', s.jugador, previo).error, 'Código incorrecto.');
  s.avanzar(600000);
  assert.equal(s.call('verificarCodigoRecuperacion', s.jugador, nuevo).error, 'El código ha caducado o no existe. Solicita uno nuevo.');
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
    ['cambiarCodigoSeguridad', ['ABC123', 'NEW123']], ['opcionesRecuperacion', []],
    ['solicitarCodigoRecuperacion', ['jugador']], ['verificarCodigoRecuperacion', ['123456']],
  ]) assert.equal(s.call(name, auth, ...args).success, false);
  assert.equal(s.writes.length, 0);
  assert.equal(s.mails.length, 0);
});

test('marcarBienvenidaVista: solo la cuenta de jugador marca su propia ficha con la hora del servidor', () => {
  const s = servidor();
  const res = s.call('marcarBienvenidaVista', s.jugador);
  assert.equal(res.success, true);
  assert.deepEqual(Object.keys(s.writes.at(-1).fields), ['BienvenidaVista']);
  assert.equal(s.writes.at(-1).id, 'j1');
  assert.match(s.rows.Jugadores[0].BienvenidaVista, /^\d{4}-\d{2}-\d{2}T/);
  const escrituras = s.writes.length;
  assert.equal(s.call('marcarBienvenidaVista', s.entrenador).success, false);
  assert.equal(s.call('marcarBienvenidaVista', s.admin).success, false);
  assert.equal(s.writes.length, escrituras);
});
