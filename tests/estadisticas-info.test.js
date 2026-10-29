const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function cliente() {
  const context = vm.createContext({ document: { addEventListener() {} }, window: { addEventListener() {} }, requestAnimationFrame() {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8').replace(/^<script[^>]*>|<\/script>\s*$/g, ''), context);
  const app = vm.runInContext('App', context), modals = [], toasts = [];
  app.openModal = (title, html) => modals.push({ title, html });
  context.showToast = (message, type) => toasts.push({ message, type });
  app.cache.jugadores = []; app.cache.entrenadores = [];
  app.state.currentView = 'mis-stats';
  app.stats.filtro = { temporadaId: 't1', periodo: 'temporada' };
  app.stats.resumen = { temporadas: [{ ID: 't1', Nombre: '2026-2027', Activa: true }, { ID: 't0', Nombre: '2025-2026', Activa: false }], filtro: { temporadaId: 't1', temporadaNombre: '2026-2027', periodo: 'temporada', periodos: ['temporada', '4s', 'mes'], desde: '2026-09-01', hasta: '2026-10-29' } };
  return { context, app, modals, toasts, run: source => vm.runInContext(source, context) };
}

test('cada métrica tiene significado y cálculo explícitos, sin cálculo genérico para títulos desconocidos', () => {
  const { run, modals } = cliente();
  const keys = Array.from(run('Object.keys(_statsMetricas)'));
  for (const key of ['asistencia', 'puntualidad', 'registros', 'rachaActual', 'mejorRacha', 'tendencia', 'computables', 'canceladas', 'pendientes', 'horasProgramadas', 'mediaAsistentes', 'plantilla', 'distribucion', 'motivos', 'justificacion', 'antelacion', 'dia', 'mes', 'semana', 'cobertura', 'suplencias', 'refuerzos', 'latencia', 'minutosRetraso', 'carga', 'extras', 'presenciaEntrenador', 'horasEntrenador', 'sustituciones', 'cubre', 'contactabilidad', 'categorias', 'cancelaciones', 'recientes', 'ranking', 'logros', 'alertas', 'comparativa']) assert.ok(keys.includes(key), key);
  for (const key of keys) {
    run(`_statsInfo(${JSON.stringify(key)})`);
    const html = modals.at(-1).html;
    assert.match(html, /Qué significa/); assert.match(html, /Cómo se calcula/);
    assert.doesNotMatch(html, /\bbase\b/i);
  }
  run("_statsInfo('asistencia|puntualidad|tendencia')");
  assert.match(modals.at(-1).html, /Se suman presentes y retrasos/);
  assert.match(modals.at(-1).html, /De las veces que vino, llegó a su hora/);
  assert.match(modals.at(-1).html, /Una ausencia justificada sigue contando como ausencia/);
  assert.match(modals.at(-1).html, /últimos 28 días/);
  assert.match(modals.at(-1).html, /al menos 4 registros/);
  assert.equal(run("_statsInfoBoton('Métrica no registrada')"), '');
  const before = modals.length; run("_statsInfo('desconocida')"); assert.equal(modals.length, before);
});

test('títulos dinámicos y compuestos enlazan a las fórmulas correctas y detienen el clic de la tarjeta', () => {
  const { run } = cliente();
  for (const title of ['P/A/R · 6 sesiones registradas', 'Últimas 12 sesiones', 'Asistencia mes a mes', 'Evolución semanal de la asistencia del equipo', 'Comparativa de equipos', 'Motivos y justificaciones', 'Registro', 'Avisos y motivos', 'Antelación de avisos', 'Latencia de registro']) {
    const html = run(`_statsInfoBoton(${JSON.stringify(title)})`);
    assert.match(html, /Información sobre /, title); assert.match(html, /event\.stopPropagation\(\)/);
  }
  const html = run(`_statsInfoBoton('X" onfocus="alert(1)', 'asistencia')`);
  assert.match(html, /X&quot; onfocus=&quot;alert\(1\)/);
  assert.doesNotMatch(html, /aria-label="[^"]*" onfocus=/);
});

test('selector de temporada, segmentos y fechas humanas mantienen las opciones permitidas', () => {
  const { app, run, modals, context } = cliente();
  let html = run('_htmlFiltroStats()');
  assert.match(html, /stats-season-pill/); assert.match(html, /_statsTemporadas\(\)/);
  assert.equal((html.match(/aria-pressed=/g) || []).length, 3);
  assert.match(html, /1 sept? 2026 — 29 oct 2026/);
  assert.doesNotMatch(html, /<select/);
  run('_statsTemporadas()'); html = modals.at(-1).html;
  assert.match(html, /stats-season-active">Activa/); assert.match(html, /stats-season-option is-selected/);
  assert.match(html, /2025-2026/);
  const properties = [], pressed = [], filters = [];
  const buttons = [0, 1, 2].map(n => ({ setAttribute: (name, value) => pressed.push([n, name, value]) }));
  const group = { style: { setProperty: (...args) => properties.push(args) }, querySelectorAll: () => buttons };
  buttons.forEach(b => { b.parentElement = group; });
  app.stats.setFiltro = value => filters.push(value); context.boton = buttons[1];
  run("_statsPeriodo(boton,'4s')");
  assert.deepEqual(properties, [['--stats-selected', 1]]); assert.equal(filters[0].periodo, '4s');
  assert.ok(pressed.some(p => p[0] === 1 && p[2] === 'true'));
  app.stats.resumen.filtro.periodos = ['temporada'];
  assert.equal((run('_htmlFiltroStats()').match(/aria-pressed=/g) || []).length, 1);
});

test('normaliza teléfonos españoles y ofrece llamada, WhatsApp y email propios y familiares', () => {
  const { app, run, modals } = cliente();
  app.cache.jugadores = [{ ID: 'j1', Nombre: 'Ana', Apellidos: 'Pérez', Telefono: '612 345 678', Email: 'ana@example.com', NombrePadre1: 'Luis', TelefonoPadre1: '0034 622 334 455', EmailPadre1: 'luis@example.com', NombrePadre2: 'María', TelefonoPadre2: '+34 (633) 445-566', EmailPadre2: 'maria@example.com' }];
  run("_statsContacto('jugador','j1')");
  const html = modals.at(-1).html;
  for (const number of ['34612345678', '34622334455', '34633445566']) {
    assert.ok(html.includes('https://wa.me/' + number)); assert.ok(html.includes('tel:+' + number));
  }
  for (const email of ['ana', 'luis', 'maria']) assert.ok(html.includes('mailto:' + email + '%40example.com'));
  assert.match(html, /Familiar 1/); assert.match(html, /Familiar 2/); assert.match(html, /rel="noopener noreferrer"/);
  app.cache.entrenadores = [{ ID: 'e1', Nombre: 'Coach', Telefono: '644556677', Email: 'coach@example.com' }];
  run("_statsContacto('entrenador','e1')");
  assert.match(modals.at(-1).html, /Entrenador/); assert.doesNotMatch(modals.at(-1).html, /Familiar/);
});

test('contactos codifican HTML y no crean enlaces peligrosos ni abren una ficha inexistente', () => {
  const { app, run, modals, toasts } = cliente();
  app.cache.jugadores = [{ ID: 'j1', Nombre: '<img src=x onerror=alert(1)>', Telefono: '" onclick="alert(1)', Email: 'x" onclick="alert(1)@example.com' }];
  run("_statsContacto('jugador','j1')");
  const html = modals.at(-1).html;
  assert.match(html, /stats-contact-muted/); assert.doesNotMatch(html, /<img|href="tel:|href="mailto:|https:\/\/wa.me/);
  const before = modals.length; run("_statsContacto('jugador','ausente')");
  assert.equal(modals.length, before); assert.equal(toasts.at(-1).type, 'error');
});

test('las fichas no duplican títulos ni nombres familiares vacíos y la tendencia usa palabras', () => {
  const { app, run, modals } = cliente();
  run("_statsInfo('rachaActual')");
  assert.doesNotMatch(modals.at(-1).html, /<h3>/);
  assert.match(run('_htmlTendencia(0)'), /Estable/);
  assert.match(run('_htmlTendencia(3)'), /▲ 3 puntos/);
  assert.match(run('_htmlTendencia(-5)'), /▼ 5 puntos/);
  assert.doesNotMatch(run('_htmlTendencia(3)'), /\bpp\b/);
  app.cache.jugadores = [{ ID: 'j1', Nombre: 'Ana', EmailPadre1: 'familia@example.com' }];
  run("_statsContacto('jugador','j1')");
  const html = modals.at(-1).html;
  assert.equal((html.match(/stats-contact-kind">Familiar 1/g) || []).length, 1);
  assert.doesNotMatch(html, /<h3>Familiar 1<\/h3>/);
  assert.match(html, /stats-contact-muted/);
});
