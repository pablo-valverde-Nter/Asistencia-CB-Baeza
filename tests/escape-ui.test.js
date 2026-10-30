const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function client(fields = {}) {
  const document = { addEventListener() {}, getElementById: id => fields[id] || null, querySelectorAll: () => [] };
  const context = vm.createContext({ document, window: { addEventListener() {} }, localStorage: { getItem: () => null, setItem() {} } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8').replace(/^<script[^>]*>|<\/script>\s*$/g, ''), context);
  return { app: vm.runInContext('App', context), context };
}

const MALICIOSO = 'O\'Brien "<img src=x onerror=alert(1)>" & co';

// Ejecuta el onclick tal como lo haría el navegador: decodifica las entidades del atributo y lo evalúa como JS.
function ejecutarOnclick(context, html) {
  const atributo = html.match(/onclick="([^"]*)"/)[1];
  const js = atributo.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  vm.runInContext(js, context);
}

test('_esc escapa HTML de verdad, también comillas simples y dobles', () => {
  const { context } = client();
  assert.equal(context._esc(MALICIOSO), 'O&#39;Brien &quot;&lt;img src=x onerror=alert(1)&gt;&quot; &amp; co');
  assert.equal(context._esc(null), '');
  assert.equal(context._esc(0), '0');
});

test('nombres con HTML se pintan como texto y los onclick reciben el valor original', () => {
  const { app, context } = client();
  const llamadas = [];
  app.views['equipo-detalle'].cargar = (...args) => llamadas.push(args);
  const boton = context._statsEquipoBoton('eq-1', MALICIOSO, { tipo: 'jugador', id: "j'1" });
  assert.doesNotMatch(boton, /<img/);
  assert.match(boton, />O&#39;Brien &quot;&lt;img/);
  ejecutarOnclick(context, boton);
  assert.deepEqual(JSON.parse(JSON.stringify(llamadas)), [['eq-1', { tipo: 'jugador', id: "j'1" }]]);

  const jugador = { ID: 'j-1', Nombre: MALICIOSO, Apellidos: '<b>Baeza</b>', Email: '' };
  const item = app.views.sesion._htmlBuscadorItem(jugador);
  assert.doesNotMatch(item, /<img|<b>/);
  let elegido = null;
  app.views.sesion._seleccionar = valor => { elegido = valor; };
  ejecutarOnclick(context, item);
  assert.equal(elegido.Nombre, MALICIOSO);
});

test('listas del formulario de equipo y cabecera de ficha no inyectan HTML de nombres', () => {
  const fields = { 'eq-ents-lista': {}, 'eq-jugs-lista': {}, 'jugador-detalle-contenido': {} };
  const { app } = client(fields);
  app.state.formEntrenadores = [{ ID: 'e1', Nombre: MALICIOSO, Apellidos: 'X' }];
  app.state.formJugadores = [{ ID: 'j1', Nombre: MALICIOSO, Apellidos: 'Y', Dorsal: '<i>7</i>', Tipo: 'Principal' }];
  app.views['equipo-form']._renderListas();
  for (const id of ['eq-ents-lista', 'eq-jugs-lista']) {
    assert.doesNotMatch(fields[id].innerHTML, /<img|<i>/, id);
    assert.match(fields[id].innerHTML, /O&#39;Brien &quot;&lt;img/, id);
  }
  app.state.rol = 'entrenador';
  app.cache.jugadores = [{ ID: 'j1', Nombre: MALICIOSO, Apellidos: 'Y', FechaNac: '<script>' }];
  app.state.detalleJugadorId = 'j1';
  app.views['jugador-detalle'].render();
  assert.doesNotMatch(fields['jugador-detalle-contenido'].innerHTML, /<img|<script>/);
});
