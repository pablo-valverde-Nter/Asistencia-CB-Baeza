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
  return { app, calls, frames, context, renderCount: () => renders };
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

test('rachas: seis niveles, mismo fuego tocable en héroe y mini, más capas y chispas al subir', () => {
  const { context } = cliente();
  vm.runInContext('_statsInfoBoton = titulo => "<button>Info " + titulo + "</button>"', context);
  for (const [n, nivel] of [[0, 0], [1, 1], [2, 1], [3, 2], [5, 2], [6, 3], [9, 3], [10, 4], [14, 4], [15, 5], [30, 5]]) {
    context.d = { rachaActual: n, mejorRacha: 31 };
    const hero = vm.runInContext('_statsRacha(d)', context);
    const mini = vm.runInContext('_statsMiniRacha(d.rachaActual)', context);
    assert.match(hero, new RegExp('stats-streak-tier-' + nivel));
    assert.match(mini, new RegExp('stats-streak-tier-' + nivel));
    assert.match(hero, new RegExp('stats-streak-count">' + n + '<span>sesiones seguidas'));
    assert.match(hero, /Récord: <strong>31<\/strong>/);
    assert.doesNotMatch(hero, /<details|stats-streak-message/);
    const fuego = vm.runInContext('_statsRachaFuego(d.rachaActual)', context);
    assert.ok(hero.includes(fuego) && mini.includes(fuego));
    assert.match(fuego, /^<button type="button"[^>]* data-racha="\d+" aria-label="[^"]+" onclick="[^"]*_statsRachaCelebrar\(this\)"/);
    assert.match(mini, new RegExp('aria-label="Racha actual: ' + n + ' sesiones seguidas"'));
    assert.equal((fuego.match(/stats-streak-layer/g) || []).length, 2 + (nivel >= 2) + (nivel >= 3));
    assert.equal((fuego.match(/class="stats-streak-spark"/g) || []).length, nivel === 5 ? 4 : nivel === 4 ? 2 : 0);
    assert.equal(hero.includes('Brasa de racha por encender'), n === 0);
    assert.doesNotMatch(hero, /\bbase\b/i);
  }
});

test('rachas: el motor real alimenta el héroe y el ranking privado', () => {
  const { datos, AHORA } = require('./fixtures/estadisticas-fixture');
  const { context } = cliente();
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/Config.gs'), 'utf8') + '\n' +
    fs.readFileSync(path.join(__dirname, '../src/Estadisticas.gs'), 'utf8') + '\nglobalThis.motor = Estadisticas;', context);
  const propio = context.motor.consultar(datos, { entidad: 'propio' }, { rol: 'jugador', jugadorId: 'jugador-bruno' }, AHORA).datos;
  context.d = propio.jugador;
  vm.runInContext('_statsInfoBoton = titulo => "<button>Info " + titulo + "</button>"', context);
  const hero = vm.runInContext('_statsRacha(d)', context);
  assert.match(hero, /stats-streak-tier-3/);
  assert.equal(propio.jugador.rachaActual, 6);
  assert.match(hero, /Info Racha actual/);
  assert.match(hero, /Info Mejor racha/);
  const yo = propio.equipo.ranking.find(fila => fila.esYo);
  assert.equal(yo.rachaActual, propio.jugador.rachaActual);
  assert.equal('alertas' in yo, false);
  assert.equal('motivos' in yo, false);
  context.nombre = '<img src=x onerror="alert(1)">&\'';
  assert.equal(vm.runInContext('_statsRachaTexto(nombre)', context), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;');
});

test('contactabilidad: segmentos excluyentes, ayudas, equipo y ficha accionable', () => {
  const { context } = cliente();
  context.contacto = { jugadoresActivos: 5, conEmailFamiliar: 2, conAvisosActivos: 1, conTelefono: 3,
    soloTelefono: 1, soloEmailPersonal: 1, sinContacto: 1,
    porEquipo: [{ equipoId: 'e1', nombre: 'Cadete <B>', activos: 5, conEmailFamiliar: 2, soloTelefono: 1, soloEmailPersonal: 1, sinContacto: 1 }],
    sinContactoLista: [{ jugadorId: 'j1', nombre: 'Ana', apellidos: 'Sin contacto', equipoNombre: 'Cadete <B>' }] };
  const html = vm.runInContext('_statsContactabilidad(contacto)', context);
  assert.match(html, /80%/);
  assert.match(html, /Solo email personal/);
  assert.match(html, /Cadete &lt;B&gt;/);
  assert.match(html, /Jugadores sin ningún contacto/);
  assert.match(html, /jugador-detalle/);
  assert.match(html, /aria-label="Solo teléfono: 1 de 5 jugadores" data-stats-tip="Solo teléfono" data-stats-tip-value="1 \(20%\)" data-stats-tip-sub="de 5 jugadores"/);
  assert.match(html, /Información sobre Avisos activos/);
  assert.equal(vm.runInContext('_statsContactoSegmentos(contacto).reduce((n,s) => n+s.n,0)', context), 5);
  context.contacto = { jugadoresActivos: 0, conEmailFamiliar: 0, conAvisosActivos: 0, conTelefono: 0, soloTelefono: 0, soloEmailPersonal: 0, sinContacto: 0, porEquipo: [], sinContactoLista: [] };
  assert.doesNotMatch(vm.runInContext('_statsContactabilidad(contacto)', context), /NaN|Infinity|undefined/);
});
