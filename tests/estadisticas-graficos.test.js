const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function elemento() {
  const clases = new Set(), atributos = new Map();
  return {
    style: {}, hidden: false, textContent: '',
    classList: {
      add: clase => clases.add(clase),
      remove: clase => clases.delete(clase),
      contains: clase => clases.has(clase)
    },
    setAttribute: (nombre, valor) => atributos.set(nombre, valor),
    getAttribute: nombre => atributos.get(nombre),
    removeAttribute: nombre => atributos.delete(nombre),
    getBoundingClientRect: () => ({ left: 80, right: 200, top: 100, bottom: 130, width: 120, height: 30 })
  };
}

function cliente() {
  const nodos = new Map();
  const document = {
    addEventListener() {},
    documentElement: { clientWidth: 800, clientHeight: 600 },
    getElementById: id => nodos.get(id) || null,
    createElement: elemento,
    body: { appendChild: nodo => nodos.set(nodo.id, nodo) }
  };
  const context = vm.createContext({ document, window: { addEventListener() {} }, requestAnimationFrame() {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8').replace(/^<script[^>]*>|<\/script>\s*$/g, ''), context);
  vm.runInContext('_statsInfoBoton = () => "<button>Información</button>"', context);
  return { context, document, app: vm.runInContext('App', context) };
}

function sinValoresInvalidos(html) {
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
  assert.doesNotMatch(html, /\bbase\b/i);
}

test('gráfico mensual conserva P/R/A, meses españoles y alternativa de datos', () => {
  const { context } = cliente();
  const html = context._statsMensual([
    { mes: '2026-09', P: 11, R: 2, A: 3, base: 16 },
    { mes: '2026-10', P: 7, R: 1, A: 4, base: 12 }
  ]);
  assert.match(html, /septiembre 2026: Presentes 11 · Retrasos 2 · Ausentes 3 · 16 registros/);
  assert.match(html, /octubre 2026: Presentes 7 · Retrasos 1 · Ausentes 4 · 12 registros/);
  assert.match(html, /stats-column-stack/);
  assert.match(html, /role="img" aria-label="Asistencia mensual/);
  assert.match(html, /<details>[\s\S]*Ver datos[\s\S]*Presentes[\s\S]*Retrasos[\s\S]*Ausentes[\s\S]*Registros/);
  sinValoresInvalidos(html);
});

test('gráficos por día y entrenador muestran etiquetas legibles y registros', () => {
  const { context } = cliente();
  const dia = context._statsPorDia([{ dia: 3, base: 10, asistenciaPct: 80 }]);
  assert.match(dia, /Miércoles: Asistencia 80% · 10 registros/);
  assert.match(dia, /stats-column-stack/);
  const entrenador = context._statsSerieMensual([{ mes: '2026-10', sesiones: 8, presentes: 6 }]);
  assert.match(entrenador, /octubre 2026: Presentes 6 · Sin presencia 2/);
  sinValoresInvalidos(dia + entrenador);
});

test('motivos apilan los conteos de ausencias y retrasos y codifican los nombres', () => {
  const { context } = cliente();
  const html = context._statsMotivos([{ motivo: 'Salud <urgente> & "aviso"', A: 3, R: 1 }]);
  assert.match(html, /width:75%;background:var\(--stats-coral\)/);
  assert.match(html, /width:25%;background:var\(--stats-gold\)/);
  assert.match(html, /3 ausencias · 4 incidencias en total/);
  assert.match(html, /1 retrasos · 4 incidencias en total/);
  assert.match(html, /Salud &lt;urgente&gt; &amp; &quot;aviso&quot;/);
  assert.match(html, /<details>[\s\S]*Ausencias[\s\S]*Retrasos/);
  sinValoresInvalidos(html);
});

test('pendientes vacíos muestran Todo al día y Registrar conserva equipo y sesión', () => {
  const { context, app } = cliente();
  assert.match(context._statsPendientes([], 'equipo-1'), /Todo al día/);
  assert.doesNotMatch(context._statsPendientes([], 'equipo-1'), /Registrar<\/button>/);
  app.cache.sesiones = [];
  app.cache.equipos = [{ ID: 'equipo-1', Nombre: 'Cadete' }];
  let abierta;
  app.views.sesiones.abrirSesion = id => { abierta = id; };
  const html = context._statsPendientes([{ sesionId: 'sesion-1', fecha: '2026-10-29', hora: '18:30' }], 'equipo-1');
  assert.match(html, /stats-pending-date/);
  assert.match(html, /18:30/);
  assert.match(html, /Registrar<\/button>/);
  const accion = html.match(/onclick="([^"]+)"/);
  assert.ok(accion);
  vm.runInContext(accion[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'), context);
  assert.equal(abierta, 'sesion-1');
  assert.equal(app.state.equipoSesionesId, 'equipo-1');
  assert.equal(app.state._equipoNombre, 'Cadete');
  sinValoresInvalidos(html);
});

test('donuts distinguen 0%, 100% y ausencia de incidencias sin valores inválidos', () => {
  const { context } = cliente();
  for (const pct of [0, 100]) {
    const html = context._statsJustificacion(pct);
    assert.match(html, new RegExp('>' + pct + '%</text>'));
    assert.match(html, /stroke-dasharray="100 0"/);
    assert.doesNotMatch(html, /Sin ausencias ni retrasos registrados/);
    sinValoresInvalidos(html);
  }
  const vacio = context._statsJustificacion(null);
  assert.match(vacio, /Sin ausencias ni retrasos registrados/);
  assert.doesNotMatch(vacio, /stats-donut-segment/);
  sinValoresInvalidos(vacio);
  const par = context._svgPie(6, 2, 2);
  assert.match(par, />80%<\/text>/);
  assert.match(par, /asistencia<\/text>/);
  assert.match(par, /Presentes: 6/);
  sinValoresInvalidos(par + context._svgPie(0, 0, 0));
});

test('gráficos de comparación, cobertura y distribución tienen alternativas accesibles', () => {
  const { context } = cliente();
  const comparacion = context._statsHorizontales([{ nombre: 'Cadete <A>', base: 20, asistenciaPct: 85 }], 'Comparación de equipos');
  assert.match(comparacion, /Cadete &lt;A&gt;/);
  assert.match(comparacion, /width:85%/);
  assert.match(comparacion, /20 registros/);
  const cobertura = context._statsCobertura({ cobertura: { conEntrenadorPct: 0, sustitutoPct: 100 }, refuerzosPct: null });
  assert.match(cobertura, /Con entrenador: 0%/);
  assert.match(cobertura, /Con sustituto: 100%/);
  const distribucion = context._htmlDistribucion({ alta: 6, media: 2, baja: 1, pocasSesiones: 3 });
  assert.match(distribucion, />12<\/text>/);
  assert.match(distribucion, /jugadores<\/text>/);
  for (const html of [comparacion, cobertura, distribucion]) {
    assert.match(html, /role="img" aria-label="/);
    assert.match(html, /<details>/);
    sinValoresInvalidos(html);
  }
});

test('tooltip ignora otras teclas y Enter/Espacio/Escape gestionan selección y foco', () => {
  const { context, document } = cliente();
  const anterior = elemento(), actual = elemento();
  anterior.classList.add('stats-selected');
  anterior.setAttribute('aria-pressed', 'true');
  const chart = { querySelectorAll: () => [anterior, actual].filter(el => el.classList.contains('stats-selected')), getBoundingClientRect: () => ({ left: 30, right: 350, top: 90, bottom: 400, width: 320, height: 310 }) };
  actual.closest = () => chart;
  actual.querySelector = () => ({ getBoundingClientRect: () => ({ left: 80, right: 200, top: 180, bottom: 380, width: 120, height: 200 }) });
  let prevenidos = 0;
  const tecla = key => ({ type: 'keydown', key, preventDefault() { prevenidos++; } });
  context._statsTooltip(actual, 'octubre: 5 presentes', tecla('ArrowRight'));
  assert.equal(prevenidos, 0);
  assert.equal(document.getElementById('stats-chart-tooltip'), null);
  context._statsTooltip(actual, 'octubre: 5 presentes', tecla('Enter'));
  const tip = document.getElementById('stats-chart-tooltip');
  assert.equal(prevenidos, 1);
  assert.equal(tip.hidden, false);
  assert.equal(tip.textContent, 'octubre: 5 presentes');
  assert.equal(actual.classList.contains('stats-selected'), true);
  assert.equal(actual.getAttribute('aria-pressed'), 'true');
  assert.equal(actual.getAttribute('aria-describedby'), 'stats-chart-tooltip');
  assert.equal(anterior.classList.contains('stats-selected'), false);
  assert.ok(parseFloat(tip.style.top) >= 186, 'tooltip stays below the plot top, not over the heading or legend');
  assert.ok(parseFloat(tip.style.left) >= 38, 'tooltip stays within the card');
  assert.equal(anterior.getAttribute('aria-pressed'), 'false');
  context._statsTooltip(actual, 'octubre: 2 retrasos', tecla(' '));
  assert.equal(prevenidos, 2);
  assert.equal(tip.textContent, 'octubre: 2 retrasos');
  context._statsTooltip(actual, 'octubre: 2 retrasos', tecla('Escape'));
  assert.equal(prevenidos, 3);
  assert.equal(tip.hidden, true);
  assert.equal(actual.classList.contains('stats-selected'), false);
  assert.equal(actual.getAttribute('aria-pressed'), 'false');
  assert.equal(actual.getAttribute('aria-describedby'), undefined);
  context._statsTooltip(actual, 'Detalle al enfocar', { type: 'focus' });
  assert.equal(tip.hidden, false);
  assert.equal(actual.classList.contains('stats-selected'), false);
  context._statsTooltip(actual, null, { type: 'blur' });
  assert.equal(tip.hidden, true);
});

test('las barras de un solo segmento no repiten etiquetas interiores y las pequeñas no se amontonan', () => {
  const { context } = cliente();
  const unico = context._statsMensual([{ mes: '2026-10', P: 2, R: 0, A: 0, base: 2 }]);
  assert.match(unico, /stats-column-value">2<\/span>/);
  assert.doesNotMatch(unico, /;color:[^"]+">2<\/span>/);
  const mixto = context._statsMensual([{ mes: '2026-10', P: 20, R: 1, A: 5, base: 26 }]);
  assert.match(mixto, /;color:[^"]+">20<\/span>/);
  assert.doesNotMatch(mixto, /;color:[^"]+">1<\/span>/);
});
