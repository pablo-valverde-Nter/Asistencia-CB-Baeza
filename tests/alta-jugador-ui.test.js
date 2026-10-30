const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function elemento() {
  return { value: '', checked: false, hidden: false, disabled: false, textContent: '', innerHTML: '', style: {}, dataset: {},
    classList: { _c: new Set(), add(c) { this._c.add(c); }, remove(c) { this._c.delete(c); }, contains(c) { return this._c.has(c); }, toggle(c, on) { on ? this._c.add(c) : this._c.delete(c); } },
    setAttribute() {}, removeAttribute() {}, focus() { this.focused = true; }, querySelector: () => null };
}

function client({ clipboard, execCommand = true, userAgent = 'Mozilla/5.0 (X11; Linux x86_64)' } = {}) {
  const els = {}, appended = [];
  const document = {
    addEventListener() {}, querySelectorAll: () => [], activeElement: null,
    getElementById: id => (els[id] ||= Object.assign(elemento(), { id })),
    createElement: () => Object.assign(elemento(), { select() {} }),
    body: { appendChild: n => appended.push(n), removeChild() {} },
    execCommand: cmd => { document.copiado = appended.at(-1).value; return cmd === 'copy' && execCommand; },
  };
  const opened = [], notices = [], calls = [];
  const context = vm.createContext({
    document, window: { addEventListener() {}, open: (url, target) => { opened.push(url); return url.startsWith('whatsapp:') ? null : {}; } },
    localStorage: { getItem: () => null, setItem() {} },
    navigator: { userAgent, clipboard },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8').replace(/^<script[^>]*>|<\/script>\s*$/g, ''), context);
  const app = vm.runInContext('App', context);
  app.state.rol = 'entrenador';
  app.state.currentView = 'jugadores-admin';
  app.cache.jugadores = [{ ID: 'j0', Nombre: 'Ana', Apellidos: 'Baeza' }];
  app.views['jugadores-admin'].render = () => {};
  app.operation.run = (_key, fn, args, success) => {
    calls.push({ fn, args: JSON.parse(JSON.stringify(args)) });
    return Promise.resolve(success({ success: true, jugador: { ID: 'nuevo', Nombre: 'Luis', Apellidos: 'Pérez', Usuario: 'lperez', PIN: '4821', CodigoPadres: 'XK29PQ' } }));
  };
  context.showToast = (message, type) => notices.push({ message, type });
  const wizard = app.views.altaJugador;
  const set = (id, value) => { els[id] = els[id] || elemento(); els[id].value = value; };
  return { app, wizard, els, set, notices, calls, opened, document };
}

test('el nombre y los apellidos son obligatorios: error en línea bajo el campo vacío, foco y se limpia al escribir', () => {
  const { wizard, set, els, notices } = client();
  wizard.abrir(false);
  set('alta-nombre', '   ');
  set('alta-apellidos', 'Pérez');
  assert.equal(wizard.continuar(), false);
  assert.equal(wizard._paso, 'nombre');
  assert.equal(els['alta-nombre-error'].hidden, false);
  assert.equal(els['alta-apellidos-error'].hidden, true);
  assert.ok(els['alta-nombre'].focused);
  assert.equal(notices.length, 0, 'el error es en línea, sin toast');
  wizard.omitir();
  assert.equal(wizard._paso, 'nombre', 'el paso del nombre no se puede omitir');
  set('alta-nombre', 'Luis');
  wizard._limpiarError(els['alta-nombre']);
  assert.equal(els['alta-nombre-error'].hidden, true);
  assert.equal(wizard.continuar(), true);
  assert.equal(wizard._paso, 'dorsal');
});

test('dorsal, datos y familiares se omiten: los campos omitidos no se guardan', async () => {
  const { wizard, set, calls, els } = client();
  wizard.abrir(false);
  set('alta-nombre', 'Luis'); set('alta-apellidos', 'Pérez');
  wizard.continuar();
  set('alta-dorsal', '7');
  wizard.omitir();
  assert.equal(wizard._paso, 'datos');
  set('alta-email', 'no-es-un-email');
  assert.equal(wizard.continuar(), false, 'un email inválido bloquea Continuar');
  wizard.omitir();
  assert.equal(wizard._paso, 'familia');
  wizard.alternarFamiliar(1);
  set('alta-p1-nombre', 'Marta'); set('alta-p1-email', 'marta@example.test');
  wizard.omitir();
  assert.equal(wizard._paso, 'completar');
  assert.equal(els['alta-familiar-1'].hidden, true, 'Omitir deselecciona los familiares');
  assert.match(els['alta-resumen'].innerHTML, /No se enviarán avisos de ausencia/);
  assert.equal(await wizard.guardar(), true);
  const datos = calls[0].args[0];
  assert.equal(calls[0].fn, 'crearJugador');
  assert.equal(datos.Nombre, 'Luis'); assert.equal(datos.Apellidos, 'Pérez');
  assert.equal(datos.Dorsal, ''); assert.equal(datos.Email, ''); assert.equal(datos.NombrePadre1, ''); assert.equal(datos.EmailPadre1, '');
  assert.equal(wizard._paso, 'credenciales');
});

test('solo se envían los familiares elegidos y Atrás conserva lo escrito', async () => {
  const { wizard, set, calls } = client();
  wizard.abrir(false);
  set('alta-nombre', 'Luis'); set('alta-apellidos', 'Pérez');
  wizard.continuar(); set('alta-dorsal', '9'); wizard.continuar(); wizard.continuar();
  wizard.alternarFamiliar(2);
  set('alta-p2-nombre', 'Jose'); set('alta-p2-email', 'jose@example.test');
  set('alta-p1-nombre', 'Oculto');
  wizard.atras();
  assert.equal(wizard._paso, 'datos');
  wizard.continuar(); wizard.continuar();
  await wizard.guardar();
  const datos = calls[0].args[0];
  assert.equal(datos.Dorsal, '9');
  assert.equal(datos.NombrePadre1, '', 'el familiar no elegido no se envía');
  assert.equal(datos.NombrePadre2, 'Jose'); assert.equal(datos.EmailPadre2, 'jose@example.test');
});

test('el texto copiado tiene exactamente usuario, PIN y código de padres', async () => {
  const escritos = [];
  const { wizard, set, notices, opened } = client({ clipboard: { writeText: t => { escritos.push(t); return Promise.resolve(); } } });
  wizard.abrir(false);
  set('alta-nombre', 'Luis'); set('alta-apellidos', 'Pérez');
  await wizard.guardar();
  const esperado = 'Usuario: lperez\nPIN: 4821\nCódigo de padres: XK29PQ';
  assert.equal(await wizard.copiar(), true);
  assert.equal(escritos[0], esperado);
  assert.equal(await wizard.whatsapp(), true);
  assert.equal(escritos[1], esperado);
  assert.deepEqual(opened, ['https://wa.me/'], 'escritorio abre wa.me sin número');
  assert.deepEqual(notices.pop(), { message: 'Mensaje copiado, pégalo en el chat', type: 'success' });
});

test('si la Clipboard API falla se copia con el respaldo; en móvil se intenta whatsapp://', async () => {
  const { wizard, set, document, opened } = client({ clipboard: { writeText: () => Promise.reject(new Error('denegado')) }, userAgent: 'Mozilla/5.0 (Linux; Android 14)' });
  wizard.abrir(false);
  set('alta-nombre', 'Luis'); set('alta-apellidos', 'Pérez');
  await wizard.guardar();
  assert.equal(await wizard.whatsapp(), true);
  assert.equal(document.copiado, 'Usuario: lperez\nPIN: 4821\nCódigo de padres: XK29PQ');
  assert.deepEqual(opened, ['whatsapp://', 'https://wa.me/'], 'si la app no se abre, usa wa.me');
});

test('los datos mostrados se escapan', async () => {
  const { app, wizard, set, els } = client();
  app.operation.run = (_k, _fn, _args, success) => Promise.resolve(success({ success: true, jugador: { ID: 'x', Nombre: '<b>', Apellidos: 'y', Usuario: '"><img src=x>', PIN: '1', CodigoPadres: 'C' } }));
  wizard.abrir(false);
  set('alta-nombre', '<script>'); set('alta-apellidos', 'Pérez');
  wizard.continuar(); wizard.continuar(); wizard.continuar(); wizard.continuar();
  assert.doesNotMatch(els['alta-resumen'].innerHTML, /<script>/);
  await wizard.guardar();
  assert.doesNotMatch(els['alta-credenciales'].innerHTML, /"><img/);
});
