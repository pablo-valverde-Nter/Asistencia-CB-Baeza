const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function elemento() {
  return { value: '', hidden: false, disabled: false, readOnly: false, textContent: '', innerHTML: '', style: { setProperty() {} }, dataset: {},
    classList: { _c: new Set(), add(...c) { c.forEach(x => this._c.add(x)); }, remove(...c) { c.forEach(x => this._c.delete(x)); },
      contains(c) { return this._c.has(c); }, toggle(c, on) { (on === undefined ? !this._c.has(c) : on) ? this._c.add(c) : this._c.delete(c); } },
    setAttribute() {}, removeAttribute() {}, getAttribute: () => null, focus() {}, select() {}, querySelector: () => elemento(), querySelectorAll: () => [] };
}

const AVISOS = [
  { ID: 'av1', ID_Jugador: 'j1', Tipo: 'programacion-quitada', Mensaje: 'Infantil <Mixto> · Jueves 19:00–20:00' },
  { ID: 'av2', ID_Jugador: 'j1', Tipo: 'programacion-quitada', Mensaje: 'Infantil Mixto · Sábados 10:00–11:30' },
];

// Cuenta de jugador que entra por el formulario de login; el servidor devuelve el arranque con sus avisos no leídos.
async function entrar({ avisos = AVISOS, rol = 'jugador', bienvenidaVista = '2026-10-01T09:00:00Z' } = {}) {
  const els = {};
  const document = { addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, activeElement: null,
    documentElement: { style: { setProperty() {} }, dataset: {} }, getElementById: id => (els[id] ||= elemento()) };
  els['modal-bienvenida'] = elemento();
  els['modal-bienvenida'].classList.add('hidden');
  els['modal-aviso-club'] = elemento();
  els['modal-aviso-club'].classList.add('hidden');
  const context = vm.createContext({ document, window: { addEventListener() {} }, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, navigator: { userAgent: '' } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8').replace(/^<script[^>]*>|<\/script>\s*$/g, ''), context);
  const app = vm.runInContext('App', context);
  const llamadas = [], vistas = [], asistentes = [];
  let respuesta = { success: true };
  const arranque = {
    success: true,
    contexto: rol === 'jugador'
      ? { rol, jugador: { ID: 'j1', Nombre: 'Ana', Apellidos: 'Baeza', BienvenidaVista: bienvenidaVista } }
      : { rol, entrenador: { ID: 'e1', Nombre: 'Eva', Apellidos: 'Ruiz' } },
    avisosJugador: rol === 'jugador' ? avisos.map(a => ({ ...a })) : [],
  };
  context.server = (fn, ...args) => {
    if (fn === 'iniciarSesion') return Promise.resolve(arranque);
    if (fn === 'marcarBienvenidaVista') return Promise.resolve({ success: true });
    llamadas.push([fn, ...args]);
    return Promise.resolve(respuesta);
  };
  context.showToast = () => {};
  app.stats.recibirBootstrap = () => {};
  app.alertas.recibir = () => {};
  app.realtime.start = () => {};
  app.navigate = vista => { vistas.push(vista); app.state.currentView = vista; };
  app.views.programaciones.abrir = () => asistentes.push('programaciones');
  app.setLoginTipo(rol === 'jugador' ? 'jugador' : 'entrenador');
  document.getElementById(rol === 'jugador' ? 'login-usuario' : 'login-email').value = rol === 'jugador' ? 'ana' : 'eva@example.test';
  document.getElementById('login-pin').value = '1234';
  app.iniciarSesion();
  await esperar();
  const modal = els['modal-aviso-club'];
  return {
    app, els, llamadas, vistas, asistentes, aviso: app.views.avisoClub,
    visible: () => !modal.classList.contains('hidden'),
    cuerpo: () => els['aviso-club-cuerpo'].innerHTML,
    responder: res => { respuesta = res; },
  };
}

const esperar = () => new Promise(resolve => setTimeout(resolve, 30));

test('al entrar, el aviso sale en una tarjeta flotante corta con la línea del entrenamiento escapada', async () => {
  const { els, vistas, visible, cuerpo, llamadas } = await entrar();
  assert.deepEqual(vistas, ['perfil-jugador']);
  assert.equal(visible(), true);
  assert.match(cuerpo(), /<h4 id="aviso-club-titulo"[^>]*>Se ha quitado tu ausencia programada<\/h4>/);
  assert.match(cuerpo(), /<p class="aviso-club-linea" data-no-i18n>Infantil &lt;Mixto&gt; · Jueves 19:00–20:00<\/p>/);
  assert.doesNotMatch(cuerpo(), /<Mixto>/);
  assert.match(cuerpo(), /<p class="aviso-club-accion">Ha cambiado el horario\. Si la sigues necesitando, vuelve a programarla\.<\/p>/);
  assert.equal(els['aviso-club-programar'].hidden, false);
  assert.equal(els['aviso-club-contador'].textContent, '· 1/2');
  assert.deepEqual(llamadas, [], 'mostrarlo no lo marca como leído');
});

test('«Entendido» marca cada aviso como leído y pasa al siguiente; tras el último la tarjeta no vuelve', async () => {
  const { app, els, aviso, llamadas, visible, cuerpo } = await entrar();
  assert.equal(await aviso.entendido(), true);
  assert.deepEqual(JSON.parse(JSON.stringify(llamadas)), [['marcarAvisoLeido', 'av1']]);
  assert.deepEqual(app.state.avisosJugador.map(a => a.ID), ['av2']);
  assert.equal(visible(), true);
  assert.match(cuerpo(), /Infantil Mixto · Sábados 10:00–11:30/);
  assert.doesNotMatch(cuerpo(), /Jueves/);
  assert.equal(els['aviso-club-contador'].textContent, '· 2/2');

  assert.equal(await aviso.entendido(), true);
  assert.deepEqual(JSON.parse(JSON.stringify(llamadas)).map(l => l[1]), ['av1', 'av2']);
  assert.deepEqual(app.state.avisosJugador, []);
  assert.equal(visible(), false);
  assert.equal(aviso.comprobar(), false);
  assert.equal(visible(), false);
  assert.equal(await aviso.entendido(), false, 'sin aviso a la vista no llama al servidor');
  assert.equal(llamadas.length, 2);
});

test('si el servidor rechaza «Entendido», el mismo aviso sigue a la vista', async () => {
  const { app, aviso, llamadas, visible, cuerpo, responder } = await entrar();
  responder({ success: false, error: 'Aviso no encontrado.' });
  assert.equal(await aviso.entendido(), false);
  assert.equal(llamadas.length, 1);
  assert.deepEqual(app.state.avisosJugador.map(a => a.ID), ['av1', 'av2']);
  assert.equal(visible(), true);
  assert.match(cuerpo(), /Jueves 19:00–20:00/);
});

test('«Programar ausencia» lo marca leído y lleva a Entrenos; con el último aviso abre el asistente de programaciones', async () => {
  const dos = await entrar();
  assert.equal(await dos.aviso.programar(), true);
  assert.deepEqual(JSON.parse(JSON.stringify(dos.llamadas)), [['marcarAvisoLeido', 'av1']]);
  assert.deepEqual(dos.vistas, ['perfil-jugador', 'mis-entrenamientos']);
  assert.equal(dos.visible(), true, 'queda otro aviso: se muestra antes de programar');
  assert.deepEqual(dos.asistentes, []);

  const uno = await entrar({ avisos: AVISOS.slice(0, 1) });
  assert.equal(uno.els['aviso-club-contador'].textContent, '');
  assert.equal(await uno.aviso.programar(), true);
  assert.equal(uno.visible(), false);
  assert.deepEqual(uno.vistas, ['perfil-jugador', 'mis-entrenamientos']);
  assert.deepEqual(uno.asistentes, ['programaciones']);

  const rechazado = await entrar({ avisos: AVISOS.slice(0, 1) });
  rechazado.responder({ success: false, error: 'Aviso no encontrado.' });
  assert.equal(await rechazado.aviso.programar(), false);
  assert.deepEqual(rechazado.vistas, ['perfil-jugador']);
  assert.equal(rechazado.visible(), true);
});

test('con la bienvenida pendiente, el aviso espera a que se cierre', async () => {
  const { app, visible, cuerpo } = await entrar({ bienvenidaVista: null });
  assert.equal(visible(), false);
  app.views.bienvenida.cerrar();
  assert.equal(visible(), true);
  assert.match(cuerpo(), /Se ha quitado tu ausencia programada/);
});

test('un aviso de otro tipo muestra su mensaje sin la frase de acción ni «Programar ausencia»', async () => {
  const { els, cuerpo } = await entrar({ avisos: [{ ID: 'av9', ID_Jugador: 'j1', Tipo: 'otro', Mensaje: 'Mensaje <b>breve</b>' }] });
  assert.match(cuerpo(), />Tienes un aviso</);
  assert.match(cuerpo(), /Mensaje &lt;b&gt;breve&lt;\/b&gt;/);
  assert.doesNotMatch(cuerpo(), /aviso-club-accion/);
  assert.equal(els['aviso-club-programar'].hidden, true);
});

test('sin avisos, o con una cuenta del personal, no aparece la tarjeta', async () => {
  assert.equal((await entrar({ avisos: [] })).visible(), false);
  assert.equal((await entrar({ rol: 'entrenador' })).visible(), false);
});
