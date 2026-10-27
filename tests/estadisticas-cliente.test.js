const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function cliente() {
  const frames = [], calls = [];
  const context = vm.createContext({ document: { addEventListener() {} }, window: { addEventListener() {} }, requestAnimationFrame: fn => frames.push(fn) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8').replace(/^<script[^>]*>|<\/script>\s*$/g, ''), context);
  context.enviar = (fn, consulta) => new Promise(resolve => calls.push({ fn, consulta, resolve }));
  vm.runInContext('server = enviar', context);
  const app = vm.runInContext('App', context);
  app.state.auth = {}; app.state.rol = 'admin'; app.state.esAdmin = true; app.state.currentView = 'equipos';
  let renders = 0;
  app.navigate = () => renders++;
  return { app, calls, frames, renderCount: () => renders };
}
const filtro = { temporadaId: 't1', periodo: 'temporada' };
const resumen = { entidad: 'resumen', filtro, datos: { equipos: { e1: {}, e2: {} } } };
const equipo = id => ({ entidad: 'equipo', filtro, datos: { id, jugadores: [{ id: 'j1' }, { id: 'j2' }] } });
const tick = () => new Promise(resolve => setImmediate(resolve));

test('precarga equipos y club en un lote sin duplicar; jugadores solo al abrir el equipo', async () => {
  const { app, calls, frames } = cliente();
  app.stats.recibirBootstrap({ estadisticas: resumen });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fn, 'getEstadisticasLote');
  assert.deepEqual(Array.from(calls[0].consulta, c => c.entidad), ['equipo', 'equipo', 'club']);
  assert.equal(app.stats.detalle('equipo', 'e1').estado, 'cargando');
  assert.equal(calls.length, 1);
  calls[0].resolve({ success: true, resultados: [{ success: true, estadisticas: equipo('e1') }, { success: true, estadisticas: equipo('e2') }, { success: true, estadisticas: { entidad: 'club', filtro, datos: {} } }] });
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(app.stats.detalle('equipo', 'e1').estado, 'ok');
  assert.equal(app.stats.detalle('club').estado, 'ok');
  app.state.currentView = 'equipo-detalle'; app.state.detalleEquipoId = 'e1';
  app.stats.detalle('equipo', 'e1');
  app.stats.detalle('equipo', 'e1');
  assert.equal(calls.length, 2);
  assert.deepEqual(Array.from(calls[1].consulta, c => c.id), ['j1', 'j2']);
  assert.equal(frames.length, 1);
});

test('invalidar y bootstrap conservan detalles visibles y descartan respuestas antiguas', async () => {
  const { app, calls } = cliente();
  app.stats.recibirBootstrap({ estadisticas: resumen });
  calls[0].resolve({ success: true, resultados: [{ success: true, estadisticas: equipo('e1') }, { success: true, estadisticas: equipo('e2') }, { success: true, estadisticas: { entidad: 'club', filtro, datos: {} } }] });
  await tick();
  const anterior = app.stats.detalle('equipo', 'e1').data;
  const pending = app.stats.invalidar();
  assert.equal(app.stats.resumen, resumen);
  const entrada = app.stats.detalle('equipo', 'e1');
  assert.equal(entrada.data, anterior);
  assert.equal(entrada.estado, 'ok');
  assert.equal(entrada.refreshing, true);
  app.stats.recibirBootstrap({ estadisticas: resumen });
  assert.equal(app.stats.detalles[entrada.key].data, anterior);
  calls[2].resolve({ success: true, estadisticas: { ...equipo('e1'), datos: { id: 'stale' } } });
  calls[1].resolve({ success: true, estadisticas: { ...resumen, datos: { equipos: {} } } });
  await pending; await tick();
  assert.equal(app.stats.detalles[entrada.key].data, anterior);
  assert.equal(app.stats.resumen, resumen);
});

test('coalesce renders y respeta formularios modificados; propio no precarga', () => {
  const { app, calls, frames, renderCount } = cliente();
  app.state.rol = 'jugador'; app.state.esAdmin = false; app.state.currentView = 'mis-stats';
  const propio = { entidad: 'propio', filtro, datos: { jugador: {} } };
  app.stats.recibirBootstrap({ estadisticas: propio });
  app.stats._render(); app.stats._render();
  assert.equal(calls.length, 0);
  assert.equal(app.stats.resumen, propio);
  assert.equal(frames.length, 1);
  app.state._formIsDirty = true; frames.shift()();
  assert.equal(renderCount(), 0);
  app.state._formIsDirty = false; app.stats._render(); frames.shift()();
  assert.equal(renderCount(), 1);
});

test('los lotes respetan el máximo de 60 consultas y los errores conservan datos previos', async () => {
  const { app, calls } = cliente();
  const equipos = Object.fromEntries(Array.from({ length: 60 }, (_, i) => ['e' + i, {}]));
  app.stats.recibirBootstrap({ estadisticas: { ...resumen, datos: { equipos } } });
  assert.deepEqual(calls.map(c => c.consulta.length), [60, 1]);
  calls[0].resolve({ success: true, resultados: Array.from({ length: 60 }, (_, i) => ({ success: true, estadisticas: equipo('e' + i) })) });
  await tick();
  const anterior = app.stats.detalle('equipo', 'e0').data;
  app.stats._version++; app.stats._stale();
  const entrada = app.stats.detalle('equipo', 'e0');
  calls[2].resolve({ success: false, error: 'Sin conexión' });
  await tick();
  assert.equal(entrada.data, anterior);
  assert.equal(entrada.estado, 'ok');
  assert.equal(entrada.refreshing, false);
  assert.equal(entrada.error, 'Sin conexión');
});
