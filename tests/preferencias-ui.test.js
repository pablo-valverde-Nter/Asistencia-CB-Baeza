'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function cliente() {
  const stored = {};
  const elements = { 'ajustes-contenido': { innerHTML: '' }, 'ajustes-idioma-contenido': { innerHTML: '' }, 'ajustes-apariencia-contenido': { innerHTML: '' } };
  const document = {
    documentElement: { lang: 'es', dataset: { theme: 'claro' }, style: {} },
    body: {}, addEventListener() {},
    getElementById: id => elements[id],
    querySelector: () => (elements.meta ||= {}),
  };
  const context = vm.createContext({ document, window: { addEventListener() {} }, localStorage: { setItem(k,v) { stored[k] = v; } } });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../ui/app.html'),'utf8').replace(/^<script[^>]*>|<\/script>\s*$/g,''),context);
  return { app:vm.runInContext('App',context), context, document, stored, elements };
}

test('preferences save locally and apply dark theme, language and browser chrome immediately', () => {
  const { app, document, stored } = cliente();
  app.i18n.aplicar = () => {};
  app.preferences.guardar({ idioma:'en', tema:'oscuro' });
  assert.deepEqual(JSON.parse(stored.cb_baeza_prefs),{ idioma:'en', tema:'oscuro' });
  assert.equal(document.documentElement.dataset.theme,'oscuro');
  assert.equal(document.documentElement.lang,'en');
  assert.equal(document.documentElement.style.colorScheme,'dark');
  assert.equal(document.querySelector().content,'#21142F');
  assert.equal(app.preferences.locale(),'en-GB');
  app.preferences.guardar({ tema:'patrimonio' });
  assert.equal(document.documentElement.style.colorScheme,'light');
  assert.equal(document.querySelector().content,'#7B1E24');
  app.preferences.guardar({ idioma:'unexpected', tema:'medianoche' });
  assert.equal(app.preferences.tema,'patrimonio');
  assert.equal(app.preferences.idioma,'en');
});

test('translator handles static, decorated and interpolated phrases and restores Spanish', () => {
  const { app } = cliente();
  app.preferences.idioma = 'en';
  assert.equal(app.i18n.texto(' Asistencia '),' Attendance ');
  assert.equal(app.i18n.texto('⚙ Ajustes'),'⚙ Settings');
  assert.equal(app.i18n.texto('6 sesiones seguidas'),'6 consecutive sessions');
  assert.equal(app.i18n.texto('Hace 3 días'),'3 days ago');
  assert.equal(app.i18n.texto('Tu posición: 2 de 8'),'Your position: 2 of 8');
  assert.equal(app.i18n.texto('María García'),'María García');
  app.preferences.idioma = 'es';
  assert.equal(app.i18n.texto('Asistencia'),'Asistencia');
});

test('settings list shows current choices and opens dedicated controls', () => {
  const { app, elements } = cliente();
  app.preferences.idioma = 'en';
  app.preferences.tema = 'patrimonio';
  app.views.ajustes.render();
  const list = elements['ajustes-contenido'].innerHTML;
  assert.match(list,/account-settings-list/);
  assert.match(list,/English/);
  assert.match(list,/Baeza Patrimonio/);
  assert.match(list,/ajustes-idioma/);
  assert.match(list,/ajustes-apariencia/);
  assert.doesNotMatch(list,/<select|theme-option/);
  app.views['ajustes-idioma'].render();
  const idioma = elements['ajustes-idioma-contenido'].innerHTML;
  assert.match(idioma,/value="es"/);
  assert.match(idioma,/value="en" translate="no" selected/);
  assert.doesNotMatch(idioma,/theme-option/);
  app.views['ajustes-apariencia'].render();
  const temas = elements['ajustes-apariencia-contenido'].innerHTML;
  assert.deepEqual([...temas.matchAll(/guardar\(\{tema:'(\w+)'\}\)/g)].map(m => m[1]),['claro','oscuro','patrimonio']);
  assert.match(temas,/aria-pressed="true"/);
  assert.doesNotMatch(temas,/<select/);
});

test('changing a preference keeps its drilldown active and refreshes the selected control', () => {
  const { app, elements } = cliente();
  app.i18n.aplicar = () => {};
  app.state.currentView = 'ajustes-apariencia';
  app.preferences.guardar({tema:'oscuro'});
  assert.equal(app.state.currentView,'ajustes-apariencia');
  assert.match(elements['ajustes-apariencia-contenido'].innerHTML,/aria-pressed="true" onclick="App.preferences.guardar\(\{tema:'oscuro'\}\)/);
  app.state.currentView = 'ajustes-idioma';
  app.preferences.guardar({idioma:'en'});
  assert.equal(app.state.currentView,'ajustes-idioma');
  assert.match(elements['ajustes-idioma-contenido'].innerHTML,/value="en" translate="no" selected/);
});

function arranque(guardado) {
  const index = fs.readFileSync(path.join(__dirname,'../ui/Index.html'),'utf8');
  const script = index.match(/<script>([\s\S]*?)<\/script>/)[1];
  const html = { dataset:{}, style:{}, lang:'es' }, meta = {}, stored = {};
  const localStorage = { getItem:() => guardado === undefined ? null : JSON.stringify(guardado), setItem(k,v) { stored[k] = v; } };
  vm.runInContext(script,vm.createContext({ document:{ documentElement:html,querySelector:() => meta },localStorage }));
  return { index, html, meta, stored };
}

test('prepaint boot restores saved dark theme and English before styles load', () => {
  const { index, html, meta, stored } = arranque({tema:'oscuro',idioma:'en'});
  assert.equal(html.dataset.theme,'oscuro');
  assert.equal(html.lang,'en');
  assert.equal(html.style.colorScheme,'dark');
  assert.equal(meta.content,'#21142F');
  assert.deepEqual(stored,{});
  assert.ok(index.indexOf('<script>') < index.indexOf("include('ui/styles')"));
});

test('prepaint boot migrates retired themes to the closest of the three and saves the migration', () => {
  for (const [retirado, tema, scheme] of [['clasico','claro','light'],['lavanda','claro','light'],['oro','claro','light'],['noche','oscuro','dark'],['medianoche','oscuro','dark']]) {
    const { html, stored } = arranque({tema:retirado,idioma:'en'});
    assert.equal(html.dataset.theme,tema,retirado);
    assert.equal(html.style.colorScheme,scheme,retirado);
    assert.deepEqual(JSON.parse(stored.cb_baeza_prefs),{idioma:'en',tema},retirado);
  }
  for (const guardado of [undefined,{tema:'desconocido'}]) {
    const { html, meta, stored } = arranque(guardado);
    assert.equal(html.dataset.theme,'claro');
    assert.equal(meta.content,'#4A148C');
    assert.deepEqual(stored,{});
  }
});

test('English covers composite metric labels without changing unfamiliar names', () => {
  const { app } = cliente();
  app.preferences.idioma = 'en';
  assert.equal(app.i18n.texto('7 jugadores · 6 entrenamientos con lista'),'7 players · 6 training sessions with attendance');
  assert.equal(app.i18n.texto('Puntualidad 88%'),'Punctuality 88%');
  assert.equal(app.i18n.texto('Información sobre Asistencia'),'Information about Attendance');
  assert.equal(app.i18n.texto('▲ 3 puntos'),'▲ 3 points');
  assert.equal(app.i18n.texto('Octubre 2026 (6)'),'October 2026 (6)');
  assert.equal(app.i18n.texto('1 entrenamiento'),'1 training session');
  assert.equal(app.i18n.texto('+ Añadir entrenador'),'+ Add coach');
  assert.equal(app.i18n.texto('Nuevo equipo'),'New team');
  assert.equal(app.i18n.texto('DÍA SELECCIONADO'),'SELECTED DAY');
  assert.equal(app.i18n.texto('Cadete Baeza'),'Cadete Baeza');
});

test('DOM translation restores Spanish and leaves names, reasons and opted-out data unchanged', () => {
  const { app, context, document } = cliente();
  const element = () => ({ closest:() => null,querySelectorAll:() => [],hasAttribute:() => false });
  const label = {nodeValue:'Asistencia',parentElement:element()};
  const name = {nodeValue:'Equipo',parentElement:element()};
  const reason = {nodeValue:'Motivo personal',parentElement:element()};
  const optout = {nodeValue:'Seguridad',parentElement:{closest:selector => selector.includes('data-no-i18n') ? {} : null}};
  const nodes = [label,name,reason,optout], root = element();
  context.NodeFilter = { SHOW_TEXT:4 };
  document.createTreeWalker = () => { let n = 0; return { currentNode:null,nextNode() { this.currentNode = nodes[n++]; return Boolean(this.currentNode); } }; };
  app.cache.equipos = [{Nombre:'Equipo'}];
  app.cache.asistJugadores = [{Motivo:'Motivo personal'}];
  app.preferences.idioma = 'en';
  app.i18n.aplicar(root);
  assert.equal(label.nodeValue,'Attendance');
  assert.equal(name.nodeValue,'Equipo');
  assert.equal(reason.nodeValue,'Motivo personal');
  assert.equal(optout.nodeValue,'Seguridad');
  app.preferences.idioma = 'es';
  app.i18n.aplicar(root);
  assert.equal(label.nodeValue,'Asistencia');
});
