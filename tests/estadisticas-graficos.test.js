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
  const nodos = new Map(), oyentes = {};
  const document = {
    addEventListener(tipo, fn) { oyentes[tipo] = fn; },
    documentElement: { clientWidth: 800, clientHeight: 600 },
    getElementById: id => nodos.get(id) || null,
    createElement: elemento,
    body: { appendChild: nodo => nodos.set(nodo.id, nodo) }
  };
  const context = vm.createContext({ document, window: { addEventListener() {} }, requestAnimationFrame() {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8').replace(/^<script[^>]*>|<\/script>\s*$/g, ''), context);
  vm.runInContext('_statsInfoBoton = () => "<button>Información</button>"', context);
  return { context, document, oyentes, app: vm.runInContext('App', context) };
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
  const chart = { querySelectorAll: () => [anterior, actual].filter(el => el.classList.contains('stats-selected')) };
  actual.closest = () => chart;
  actual.dataset = { statsTip: 'Octubre', statsTipValue: '85%', statsTipSub: '12 registros' };
  let prevenidos = 0;
  const tecla = key => ({ type: 'keydown', key, preventDefault() { prevenidos++; } });
  context._statsTooltip(actual, true, tecla('ArrowRight'));
  assert.equal(prevenidos, 0);
  assert.equal(document.getElementById('stats-chart-tooltip'), null);
  context._statsTooltip(actual, true, tecla('Enter'));
  const tip = document.getElementById('stats-chart-tooltip');
  assert.equal(prevenidos, 1);
  assert.equal(tip.hidden, false);
  assert.equal(tip.innerHTML, '<span class="stats-tip-main"><span class="stats-tip-label">Octubre</span><strong class="stats-tip-value">85%</strong></span><span class="stats-tip-sub">12 registros</span>');
  assert.equal(actual.classList.contains('stats-selected'), true);
  assert.equal(actual.getAttribute('aria-pressed'), 'true');
  assert.equal(actual.getAttribute('aria-describedby'), 'stats-chart-tooltip');
  assert.equal(anterior.classList.contains('stats-selected'), false);
  assert.equal(anterior.getAttribute('aria-pressed'), 'false');
  context._statsTooltip(actual, ['Octubre', '2 retrasos'], tecla(' '));
  assert.equal(prevenidos, 2);
  assert.match(tip.innerHTML, /2 retrasos/);
  assert.doesNotMatch(tip.innerHTML, /stats-tip-sub/);
  context._statsTooltip(actual, true, tecla('Escape'));
  assert.equal(prevenidos, 3);
  assert.equal(tip.hidden, true);
  assert.equal(actual.classList.contains('stats-selected'), false);
  assert.equal(actual.getAttribute('aria-pressed'), 'false');
  assert.equal(actual.getAttribute('aria-describedby'), undefined);
  context._statsTooltip(actual, true, { type: 'focus' });
  assert.equal(tip.hidden, false);
  assert.equal(actual.classList.contains('stats-selected'), false);
  context._statsTooltip(actual, null, { type: 'blur' });
  assert.equal(tip.hidden, true);
});

test('tooltip compacto se coloca junto al punto, cambia de lado y se ajusta a los bordes', () => {
  const { context, document } = cliente();
  const punto = elemento();
  punto.closest = () => ({ querySelectorAll: () => [] });
  // Con teclado: centrado sobre el elemento (80–200 × 100–130) y encima, a 10 px.
  context._statsTooltip(punto, ['12 oct', '85%'], { type: 'focus' });
  const tip = document.getElementById('stats-chart-tooltip');
  tip.getBoundingClientRect = () => ({ width: 100, height: 40 });
  context._statsTooltip(punto, ['12 oct', '85%'], { type: 'focus' });
  assert.deepEqual([tip.style.left, tip.style.top, tip.classList.contains('is-below')], ['90px', '50px', false]);
  // Con el dedo: se ancla al punto tocado aunque el elemento sea grande.
  punto.getBoundingClientRect = () => ({ left: 0, right: 800, top: 300, bottom: 500, width: 800, height: 200 });
  context._statsTooltip(punto, ['Presentes', '42 (68%)'], { type: 'click', clientX: 400, clientY: 420 });
  assert.deepEqual([tip.style.left, tip.style.top], ['350px', '370px']);
  // Sin sitio arriba: debajo del elemento; pegado al borde derecho sin salirse.
  punto.getBoundingClientRect = () => ({ left: 760, right: 798, top: 20, bottom: 40, width: 38, height: 20 });
  context._statsTooltip(punto, ['Dom', '90%'], { type: 'focus' });
  assert.deepEqual([tip.style.left, tip.style.top, tip.classList.contains('is-below')], ['692px', '50px', true]);
  // El texto se escapa.
  context._statsTooltip(punto, ['<b>x</b>', '1'], { type: 'focus' });
  assert.match(tip.innerHTML, /&lt;b&gt;x&lt;\/b&gt;/);
});

test('tocar fuera de la gráfica cierra el detalle y quita la selección', () => {
  const { context, document, oyentes } = cliente();
  const punto = elemento();
  punto.closest = () => ({ querySelectorAll: () => [] });
  context._statsTooltip(punto, ['12 oct', '85%'], { type: 'click', clientX: 100, clientY: 110 });
  const tip = document.getElementById('stats-chart-tooltip');
  oyentes.pointerdown({ target: { closest: () => punto } });
  assert.equal(tip.hidden, false);
  oyentes.pointerdown({ target: { closest: () => null } });
  assert.equal(tip.hidden, true);
  assert.equal(punto.classList.contains('stats-selected'), false);
  assert.equal(punto.getAttribute('aria-pressed'), 'false');
});

test('todas las gráficas muestran etiqueta y valor cortos y conservan la descripción completa accesible', () => {
  const { context } = cliente();
  const atributos = html => [...html.matchAll(/aria-label="([^"]*)" data-stats-tip="([^"]*)"(?: data-stats-tip-value="([^"]*)")?(?: data-stats-tip-sub="([^"]*)")?/g)]
    .map(m => ({ aria: m[1], tip: m[2], valor: m[3], sub: m[4] }));
  const pie = atributos(context._svgPie(6, 3, 1));
  assert.deepEqual(pie[0], { aria: 'Presentes: 6 · 60% del total', tip: 'Presentes', valor: '6 (60%)', sub: undefined });
  const semanal = context._svgSerie([{ semana: '2026-10-12', asistenciaPct: 85, base: 13, P: 10, R: 1, A: 2 }], 'Asistencia semanal');
  assert.doesNotMatch(semanal, /<title>/, 'sin tooltip nativo duplicado');
  const punto = atributos(semanal)[0];
  assert.match(punto.tip, /^Semana del 12 oct/);
  assert.deepEqual([punto.valor, punto.sub], ['85%', '13 registros']);
  assert.match(punto.aria, /10 presentes, 1 retrasos, 2 ausencias/);
  const mensual = atributos(context._statsMensual([{ mes: '2026-10', P: 7, R: 1, A: 1, base: 9, asistenciaPct: 89 }]))[0];
  assert.deepEqual([mensual.tip, mensual.valor, mensual.sub], ['octubre 2026', '89%', '7 presentes · 1 retraso · 1 ausencia']);
  const calor = atributos(context._htmlHeatmap([{ fecha: '2026-10-12', hora: '18:00', equipoNombre: 'Cadete', estado: 'R', justificada: true, minutosRetraso: 10 }]))[0];
  assert.deepEqual([calor.valor, calor.sub], ['Retraso', 'Justificada · 10 min tarde · Cadete']);
  assert.match(calor.tip, /^12 oct · 18:00$/);
  const motivo = atributos(context._statsMotivos([{ motivo: 'Lesión', A: 1, R: 0 }]))[0];
  assert.deepEqual([motivo.tip, motivo.valor], ['Lesión', '1 ausencia']);
  for (const html of [context._statsPorDia([{ dia: 3, base: 10, asistenciaPct: 80 }]), context._statsHorizontales([{ nombre: 'Cadete', base: 20, asistenciaPct: 85 }], 'X'),
    context._statsCobertura({ cobertura: { conEntrenadorPct: 90, sustitutoPct: 10 }, refuerzosPct: 5 }), context._statsSerieMensual([{ mes: '2026-10', sesiones: 8, presentes: 6 }]),
    context._statsContactabilidad({ jugadoresActivos: 4, conEmailFamiliar: 2, soloTelefono: 1, soloEmailPersonal: 0, sinContacto: 1, conAvisosActivos: 1, conTelefono: 2, porEquipo: [], sinContactoLista: [] })]) {
    const lista = atributos(html);
    assert.ok(lista.length > 0);
    for (const a of lista) {
      assert.ok(a.tip && a.valor, 'etiqueta y valor: ' + JSON.stringify(a));
      assert.ok((a.tip + a.valor + (a.sub || '')).length <= 60, 'texto corto: ' + JSON.stringify(a));
    }
  }
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
