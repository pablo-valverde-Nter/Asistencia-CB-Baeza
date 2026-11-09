const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Inicio de la cuenta de jugador con elementos mínimos para pintar la vista.
function cliente() {
  const el = () => ({ innerHTML: '', textContent: '', classList: { add() {}, remove() {}, toggle() {} } });
  const fields = {};
  for (const id of ['perfil-jugador-avatar', 'perfil-jugador-nombre', 'perfil-jugador-equipo', 'perfil-racha', 'perfil-avisos',
    'perfil-incidencias', 'perfil-configuracion-aviso', 'perfil-stats', 'user-badge-avatar', 'user-badge-name', 'user-badge-role']) fields[id] = el();
  const document = { addEventListener() {}, getElementById: id => fields[id] || null, querySelectorAll: () => [] };
  const context = vm.createContext({ document, window: { addEventListener() {} }, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem() {} } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8').replace(/^<script[^>]*>|<\/script>\s*$/g, ''), context);
  const app = vm.runInContext('App', context);
  const llamadas = [];
  let respuesta = { success: true };
  context.server = (fn, ...args) => { llamadas.push([fn, ...args]); return Promise.resolve(respuesta); };
  app.state.auth = { tipo: 'jugador', usuario: 'ana', pin: '1234' };
  app.stats.recibirBootstrap = () => {};
  app._applyBootstrapData({
    contexto: { rol: 'jugador', jugador: { ID: 'j1', Nombre: 'Ana', Apellidos: 'Baeza', FechaNac: '2012-01-01', EmailPadre1: 'f@example.test', NombrePadre1: 'Luis', ApellidosPadre1: 'Baeza', TelefonoPadre1: '600000000' } },
    avisosJugador: [
      { ID: 'av1', ID_Jugador: 'j1', Mensaje: 'Se ha cambiado el horario de entrenamiento de Infantil <Mixto> y se ha quitado tu ausencia programada de los jueves de 19:00 a 20:00.' },
      { ID: 'av2', ID_Jugador: 'j1', Mensaje: 'Otro aviso' },
    ],
  });
  return { app, fields, llamadas, responder: res => { respuesta = res; } };
}

const esperar = () => new Promise(resolve => setTimeout(resolve, 30));

test('con avisos no leídos el inicio del jugador los muestra (escapados) hasta cerrarlos; cerrar llama a marcarAvisoLeido', async () => {
  const { app, fields, llamadas } = cliente();
  app.views['perfil-jugador'].render();
  const html = fields['perfil-avisos'].innerHTML;
  assert.equal((html.match(/class="player-notice"/g) || []).length, 2);
  assert.match(html, /Infantil &lt;Mixto&gt;.*jueves de 19:00 a 20:00/);
  assert.match(html, /aria-label="Cerrar aviso"/);
  assert.match(html, /onclick="App\.views\['perfil-jugador'\]\.cerrarAviso\(&quot;av1&quot;\)"/);

  // Repintar (p. ej. refresco realtime) no lo quita: solo cerrarlo.
  app.views['perfil-jugador'].render();
  assert.equal((fields['perfil-avisos'].innerHTML.match(/class="player-notice"/g) || []).length, 2);

  await app.views['perfil-jugador'].cerrarAviso('av1');
  await esperar();
  assert.deepEqual(JSON.parse(JSON.stringify(llamadas)), [['marcarAvisoLeido', 'av1']]);
  assert.deepEqual(app.state.avisosJugador.map(a => a.ID), ['av2']);
  assert.doesNotMatch(fields['perfil-avisos'].innerHTML, /av1/);
  assert.match(fields['perfil-avisos'].innerHTML, /Otro aviso/);
});

test('si el servidor rechaza cerrar el aviso, sigue visible', async () => {
  const { app, fields, llamadas, responder } = cliente();
  app.views['perfil-jugador'].render();
  responder({ success: false, error: 'Aviso no encontrado.' });
  await app.views['perfil-jugador'].cerrarAviso('av1');
  await esperar();
  assert.equal(llamadas.length, 1);
  assert.deepEqual(app.state.avisosJugador.map(a => a.ID), ['av1', 'av2']);
  assert.match(fields['perfil-avisos'].innerHTML, /cerrarAviso\(&quot;av1&quot;\)/);
});

test('sin avisos no se pinta ninguna tarjeta', () => {
  const { app, fields } = cliente();
  app.state.avisosJugador = [];
  app.views['perfil-jugador'].render();
  assert.equal(fields['perfil-avisos'].innerHTML, '');
});
