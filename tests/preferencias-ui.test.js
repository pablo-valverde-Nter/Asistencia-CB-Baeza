'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function cliente() {
  const stored = {};
  const elements = { 'ajustes-contenido': { innerHTML: '' } };
  const document = {
    documentElement: { lang: 'es', dataset: { theme: 'clasico' }, style: {} },
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
  app.preferences.guardar({ idioma:'en', tema:'medianoche' });
  assert.deepEqual(JSON.parse(stored.cb_baeza_prefs),{ idioma:'en', tema:'medianoche' });
  assert.equal(document.documentElement.dataset.theme,'medianoche');
  assert.equal(document.documentElement.lang,'en');
  assert.equal(document.documentElement.style.colorScheme,'dark');
  assert.equal(document.querySelector().content,'#08060D');
  assert.equal(app.preferences.locale(),'en-GB');
  app.preferences.guardar({ idioma:'unexpected', tema:'unknown' });
  assert.equal(app.preferences.tema,'medianoche');
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

test('settings view provides five swatch cards and both supported languages', () => {
  const { app, elements } = cliente();
  app.views.ajustes.render();
  const html = elements['ajustes-contenido'].innerHTML;
  assert.equal((html.match(/class="theme-option"/g) || []).length,5);
  assert.match(html,/value="es"/);
  assert.match(html,/value="en"/);
  assert.match(html,/aria-pressed="true"/);
  assert.match(html,/App.preferences.guardar/);
});

test('prepaint boot restores saved dark theme and English before styles load', () => {
  const index = fs.readFileSync(path.join(__dirname,'../ui/Index.html'),'utf8');
  const script = index.match(/<script>([\s\S]*?)<\/script>/)[1];
  const html = { dataset:{}, style:{}, lang:'es' }, meta = {};
  const context = vm.createContext({ document:{ documentElement:html,querySelector:() => meta },localStorage:{ getItem:() => JSON.stringify({tema:'medianoche',idioma:'en'}) } });
  vm.runInContext(script,context);
  assert.equal(html.dataset.theme,'medianoche');
  assert.equal(html.lang,'en');
  assert.equal(html.style.colorScheme,'dark');
  assert.equal(meta.content,'#08060D');
  assert.ok(index.indexOf('<script>') < index.indexOf("include('ui/styles')"));
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
