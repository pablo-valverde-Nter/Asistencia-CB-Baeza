'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function campo(tagName, type, visible = true) {
  return { tagName, type, getClientRects: () => (visible ? [{}] : []) };
}

function cliente() {
  const focusout = [];
  const timers = [];
  const document = {
    activeElement: null, visibilityState: 'visible',
    addEventListener(type, fn) { if (type === 'focusout') focusout.push(fn); },
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  };
  const context = vm.createContext({ document, window: { addEventListener() {} },
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8').replace(/^<script[^>]*>|<\/script>\s*$/g, ''), context);
  const app = vm.runInContext('App', context);
  const navegaciones = [];
  app.navigate = (...args) => navegaciones.push(JSON.parse(JSON.stringify(args)));
  const ejecutarTimers = () => { while (timers.length) timers.shift()(); };
  const enfocar = el => { document.activeElement = el; focusout.forEach(fn => fn()); ejecutarTimers(); };
  return { app, document, navegaciones, ejecutarTimers, enfocar };
}

test('las estadísticas no repintan la vista mientras se escribe y lo hacen al salir del campo', () => {
  const { app, document, navegaciones, ejecutarTimers, enfocar } = cliente();
  app.state.currentView = 'jugadores-admin';
  document.activeElement = campo('INPUT', 'search');
  app.stats._render();
  ejecutarTimers();
  assert.deepEqual(navegaciones, []);
  enfocar(campo('TEXTAREA'));
  assert.deepEqual(navegaciones, [], 'pasar a otro campo sigue siendo escribir');
  enfocar({ tagName: 'BODY' });
  assert.deepEqual(navegaciones, [['jugadores-admin', {}, false]]);
});

test('el refresco en tiempo real queda pendiente mientras se escribe y se reanuda al salir', () => {
  const { app, document, ejecutarTimers, enfocar } = cliente();
  let refrescos = 0;
  app.realtime.refresh = () => { refrescos++; };
  app.state.auth = { tipo: 'entrenador', email: 'a@b.es', pin: '1234' };
  app.state.currentView = 'equipos';
  document.activeElement = campo('INPUT', 'email');
  app.realtime.requestRefresh(0);
  ejecutarTimers();
  assert.equal(refrescos, 0);
  assert.equal(app.realtime.pending, true);
  enfocar({ tagName: 'BUTTON' });
  assert.equal(refrescos, 1);
  assert.equal(app.realtime.pending, false);
});

test('casillas y campos ya ocultos no bloquean los repintados', () => {
  const { app, document, navegaciones, ejecutarTimers } = cliente();
  app.state.currentView = 'informes';
  for (const el of [campo('INPUT', 'checkbox'), campo('INPUT', 'text', false)]) {
    document.activeElement = el;
    app.stats._render();
    ejecutarTimers();
  }
  assert.equal(navegaciones.length, 2);
});
