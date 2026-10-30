const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function elemento() {
  return { value: '', hidden: false, disabled: false, textContent: '', innerHTML: '', style: {}, dataset: {},
    classList: { _c: new Set(), add(c) { this._c.add(c); }, remove(c) { this._c.delete(c); }, contains(c) { return this._c.has(c); }, toggle(c, on) { on ? this._c.add(c) : this._c.delete(c); } },
    setAttribute() {}, focus() {}, querySelector: () => null };
}

function client({ rol = 'jugador', jugador = {}, guardado = { success: true } } = {}) {
  const els = {};
  const document = {
    addEventListener() {}, querySelectorAll: () => [], activeElement: null,
    getElementById: id => (els[id] ||= elemento()),
  };
  const notices = [], calls = [], servidor = [];
  const context = vm.createContext({
    document, window: { addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} },
    navigator: { userAgent: '' },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8').replace(/^<script[^>]*>|<\/script>\s*$/g, ''), context);
  const app = vm.runInContext('App', context);
  app.state.rol = rol;
  app.state.auth = { tipo: rol };
  app.state.jugador = rol === 'jugador' ? Object.assign({ ID: 'j1', Nombre: 'Ana', Apellidos: 'Baeza' }, jugador) : null;
  app.state.currentView = 'otra';
  app.operation.run = (_key, fn, args, success) => {
    calls.push({ fn, args: JSON.parse(JSON.stringify(args)) });
    if (!guardado.success) return Promise.reject(new Error(guardado.error));
    return Promise.resolve(success(guardado));
  };
  context.server = fn => { servidor.push(fn); return Promise.resolve({ success: true, bienvenidaVista: '2026-10-30T10:00:00.000Z' }); };
  context.showToast = (message, type) => notices.push({ message, type });
  const wizard = app.views.bienvenida;
  const set = (campo, value) => { document.getElementById('bienvenida-' + campo).value = value; };
  const abierto = () => !els['modal-bienvenida'].classList.contains('hidden');
  return { app, wizard, els, set, notices, calls, servidor, abierto };
}

test('solo se abre en la primera entrada de una cuenta de jugador', () => {
  const nuevo = client();
  assert.equal(nuevo.wizard.comprobar(), true);
  assert.equal(nuevo.wizard._paso, 'inicio');
  assert.equal(nuevo.abierto(), true);

  assert.equal(client({ jugador: { BienvenidaVista: '2026-10-01T09:00:00Z' } }).wizard.comprobar(), false, 'ya vista');
  assert.equal(client({ rol: 'entrenador' }).wizard.comprobar(), false, 'nunca a entrenadores ni admin');
});

test('cerrar con la X la marca como vista una sola vez y no vuelve a abrirse', async () => {
  const { app, wizard, servidor, abierto } = client();
  wizard.comprobar();
  wizard.cerrar();
  assert.equal(abierto(), false);
  assert.deepEqual(servidor, ['marcarBienvenidaVista']);
  await Promise.resolve();
  assert.ok(app.state.jugador.BienvenidaVista);
  wizard.cerrar();
  assert.equal(wizard.comprobar(), false);
  assert.deepEqual(servidor, ['marcarBienvenidaVista'], 'no repite la llamada');
});

test('omitirlo todo termina sin guardar ni pedir código, y la marca como vista', async () => {
  const { wizard, els, calls, servidor, abierto } = client({ jugador: { FechaNac: '2014-05-02', NombrePadre1: 'Eva' } });
  wizard.comprobar();
  wizard.continuar();
  assert.equal(wizard._paso, 'fecha');
  assert.equal(els['bienvenida-FechaNac'].value, '2014-05-02', 'prerrellenado');
  assert.equal(els['bienvenida-progress-text'].textContent, 'Paso 1 de 4');
  els['bienvenida-FechaNac'].value = '2015-01-01';
  wizard.omitir();
  assert.equal(els['bienvenida-FechaNac'].value, '2014-05-02', 'Omitir recupera el dato guardado');
  assert.equal(els['bienvenida-NombrePadre1'].value, 'Eva');
  wizard.omitir(); wizard.omitir();
  assert.equal(wizard._paso, 'resumen');
  assert.equal(els['bienvenida-codigo-grupo'].hidden, true);
  assert.equal(els['bienvenida-guardar'].textContent, 'Terminar');
  assert.equal(await wizard.guardar(), true);
  assert.equal(calls.length, 0);
  assert.deepEqual(servidor, ['marcarBienvenidaVista']);
  assert.equal(abierto(), false);
});

test('solo envía lo cambiado en pasos no omitidos, sin avisos por correo, y marca vista tras guardar', async () => {
  const { app, wizard, set, calls, servidor, notices } = client({ jugador: { NombrePadre1: 'Eva', TelefonoPadre1: '600000000', NotificarAusenciasPadre1: false } });
  wizard.comprobar();
  wizard.continuar();
  set('FechaNac', '2013-09-10'); wizard.continuar();
  set('EmailPadre1', 'eva@example.test'); wizard.continuar();
  set('NombrePadre2', 'Luis'); wizard.omitir();
  assert.equal(await wizard.guardar(), false, 'sin código no se guarda');
  assert.deepEqual(notices.pop(), { message: 'Introduce el código de seguridad de 6 caracteres', type: 'error' });
  set('codigo', 'abc123');
  assert.equal(await wizard.guardar(), true);
  assert.equal(calls[0].fn, 'actualizarMiPerfil');
  assert.deepEqual(calls[0].args, [{ FechaNac: '2013-09-10', EmailPadre1: 'eva@example.test' }, 'ABC123']);
  assert.equal(app.state.jugador.EmailPadre1, 'eva@example.test');
  assert.equal(app.state.jugador.NotificarAusenciasPadre1, false);
  assert.deepEqual(servidor, ['marcarBienvenidaVista']);
});

test('un dato no válido bloquea Continuar; si el servidor rechaza, el asistente sigue abierto y no se marca', async () => {
  const { wizard, set, notices, servidor, abierto } = client({ guardado: { success: false, error: 'Código de seguridad incorrecto.' } });
  wizard.comprobar();
  wizard.continuar();
  set('FechaNac', '2999-01-01');
  assert.equal(wizard.continuar(), false);
  assert.equal(wizard._paso, 'fecha');
  set('FechaNac', '2014-01-01'); wizard.continuar();
  set('TelefonoPadre1', '12');
  assert.equal(wizard.continuar(), false);
  assert.deepEqual(notices.pop(), { message: 'El teléfono del tutor 1 no es válido', type: 'error' });
  set('TelefonoPadre1', ''); wizard.continuar(); wizard.continuar();
  set('codigo', 'ZZZ999');
  assert.equal(await wizard.guardar(), false);
  assert.equal(abierto(), true);
  assert.deepEqual(servidor, []);
});

test('el resumen escapa lo escrito', () => {
  const { wizard, set, els } = client();
  wizard.comprobar();
  wizard.continuar(); wizard.continuar();
  set('NombrePadre1', '<img src=x onerror=alert(1)>');
  wizard.continuar(); wizard.continuar();
  assert.doesNotMatch(els['bienvenida-resumen'].innerHTML, /<img/);
  assert.match(els['bienvenida-resumen'].innerHTML, /&lt;img/);
});

test('reabierto desde Perfil empieza en la fecha y no vuelve a marcar', () => {
  const { wizard, servidor } = client({ jugador: { BienvenidaVista: '2026-10-01T09:00:00Z' } });
  wizard.abrir(true);
  assert.equal(wizard._paso, 'fecha');
  wizard.cerrar();
  assert.deepEqual(servidor, []);
});

test('Continuar solo aparece con datos (también los ya guardados); vacío queda solo Omitir', () => {
  const { wizard, set, els } = client({ jugador: { NombrePadre1: 'Eva' } });
  wizard.comprobar();
  wizard.continuar();
  const fecha = els['bienvenida-continuar-fecha'];
  assert.equal(fecha.hidden, true, 'vacío: solo Omitir');
  set('FechaNac', '2014-05-02'); wizard._actualizarBotones();
  assert.equal(fecha.hidden, false, 'al escribir aparece');
  set('FechaNac', ''); wizard._actualizarBotones();
  assert.equal(fecha.hidden, true, 'al vaciar desaparece');
  wizard.omitir();
  const tutor1 = els['bienvenida-continuar-tutor1'];
  assert.equal(tutor1.hidden, false, 'prerrellenado con el dato guardado');
  set('NombrePadre1', ''); wizard._actualizarBotones();
  assert.equal(tutor1.hidden, true);
  set('TelefonoPadre1', '600000000'); wizard.continuar();
  wizard.atras();
  assert.equal(tutor1.hidden, false, 'al volver a un paso con datos sigue visible');
});
