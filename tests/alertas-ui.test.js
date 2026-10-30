const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function cliente() {
  const host = { innerHTML: '' }, almacen = new Map();
  const localStorage = { getItem: k => almacen.has(k) ? almacen.get(k) : null, setItem: (k, v) => almacen.set(k, String(v)) };
  const document = { addEventListener() {}, getElementById: id => id === 'alertas-ausencias' ? host : null };
  const context = vm.createContext({ document, localStorage, window: { addEventListener() {} }, requestAnimationFrame() {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8').replace(/^<script[^>]*>|<\/script>\s*$/g, ''), context);
  const app = vm.runInContext('App', context), modals = [];
  app.openModal = (title, html) => { modals.push({ title, html }); };
  app.closeModal = () => {};
  app.notifications._refreshHome = () => {};
  app.state.usuario = { ID: 'entrenador-luis', Nombre: 'Luis' };
  app.state.equipos = [{ ID: 'eq1' }];
  app.cache.equipos = [{ ID: 'eq1', Nombre: 'Cadete' }, { ID: 'eq2', Nombre: 'Junior' }];
  app.cache.jugadores = [
    { ID: 'j1', Nombre: 'Ana', Apellidos: 'García', Telefono: '600000001', TelefonoPadre1: '600000002', NombrePadre1: 'Marta' },
    { ID: 'j2', Nombre: '<img src=x onerror=alert(1)>', Apellidos: 'Ruiz' },
  ];
  return { context, app, host, almacen, modals, run: s => vm.runInContext(s, context) };
}
const alerta = (jugadorId, ausencias, cambios = {}) => ({ jugadorId, equipos: ['eq1'], ausencias, desde: '2026-10-05', ultimaAusencia: '2026-10-26',
  ultimaAsistencia: '2026-10-01', justificadas: 0, clave: jugadorId + ':s1', ...cambios });
const datos = jugadores => ({ umbral: 3, temporadaId: 't1', equipos: ['eq1'], jugadores });

test('el contador excluye contactados y un contactado reaparece con otras 3 faltas', () => {
  const { app, host } = cliente();
  app.alertas.recibir(datos([alerta('j1', 3), alerta('j2', 4)]), null);
  assert.equal(app.alertas.count('eq1'), 2);
  app.alertas.open('eq1');
  app.alertas.marcarContactado('eq1', 'j1');
  assert.equal(app.alertas.count('eq1'), 1);
  assert.match(host.innerHTML, /Contactados \(1\)/);
  assert.match(host.innerHTML, /Deshacer/);
  app.alertas.recibir(datos([alerta('j1', 5), alerta('j2', 4)]), null);
  assert.equal(app.alertas.count('eq1'), 1, '2 faltas más no vuelven a avisar');
  app.alertas.recibir(datos([alerta('j1', 6), alerta('j2', 4)]), null);
  assert.equal(app.alertas.count('eq1'), 2, '3 faltas más vuelven a avisar');
  app.alertas.recibir(datos([alerta('j1', 3), alerta('j2', 4)]), null);
  app.alertas.marcarContactado('eq1', 'j1');
  app.alertas.deshacer('eq1', 'j1');
  assert.equal(app.alertas.count('eq1'), 2);
});

test('una racha nueva vuelve a avisar y se olvidan las claves que ya no están en alerta', () => {
  const { app, almacen } = cliente();
  app.alertas.recibir(datos([alerta('j1', 3)]), null);
  app.alertas.marcarContactado('eq1', 'j1');
  app.alertas.recibir(datos([alerta('j1', 3, { clave: 'j1:s9' })]), null);
  assert.equal(app.alertas.count('eq1'), 1);
  assert.deepEqual(JSON.parse(almacen.get('cb-baeza-alertas-v1:entrenador-luis')), {});
});

test('el botón solo aparece en los equipos del entrenador y muestra el contador sin escapar mal el nombre', () => {
  const { app } = cliente();
  app.alertas.recibir(datos([alerta('j1', 3)]), null);
  const boton = app.alertas.boton('eq1', 'Cadete');
  assert.match(boton, /aria-label="Alertas de ausencias de Cadete: 1 jugador"/);
  assert.match(boton, /eq-alerts-count">1</);
  assert.match(boton, /stroke="currentColor"/);
  assert.equal(app.alertas.boton('eq2', 'Junior'), '', 'sustitución: sin botón');
  app.alertas.recibir(null, 'boom');
  assert.notEqual(app.alertas.boton('eq1', 'Cadete'), '', 'si el cálculo falla se explica en el equipo propio');
  assert.equal(app.alertas.boton('eq2', 'Junior'), '');
});

test('Contactar abre la ficha del jugador correcto con la familia primero y WhatsApp prellenado', () => {
  const { app, modals } = cliente();
  app.alertas.recibir(datos([alerta('j1', 3)]), null);
  app.alertas.contactar('eq1', 'j1');
  const { title, html } = modals.at(-1);
  assert.equal(title, 'Contactar · Ana García');
  assert.ok(html.indexOf('Familiar 1') < html.indexOf('>Jugador<'), 'familia antes que el jugador');
  const wa = html.match(/href="(https:\/\/wa\.me\/34600000002[^"]*)"/)[1].replace(/&amp;/g, '&');
  const texto = decodeURIComponent(new URL(wa).searchParams.get('text'));
  assert.match(texto, /^Hola, soy Luis, del equipo técnico de Cadete \(CB Baeza\)\. Hemos echado de menos a Ana/);
  assert.ok(texto.length < 200);
  assert.match(html, /Volver a alertas/);
});

test('los nombres se escapan y los estados vacíos son claros', () => {
  const { app, host } = cliente();
  app.alertas.recibir(datos([alerta('j2', 3, { justificadas: 2, ultimaAsistencia: null })]), null);
  app.alertas.open('eq1');
  assert.doesNotMatch(host.innerHTML, /<img/);
  assert.match(host.innerHTML, /Ruiz, &lt;img/);
  assert.match(host.innerHTML, /3 entrenos seguidos sin venir/);
  assert.match(host.innerHTML, /2 justificadas/);
  assert.match(host.innerHTML, /Sin asistencias esta temporada/);
  app.alertas.marcarContactado('eq1', 'j2');
  assert.match(host.innerHTML, /Ya has contactado con todas las familias en alerta\./);
  app.alertas.recibir(datos([]), null);
  app.alertas.render('eq1');
  assert.match(host.innerHTML, /Ningún jugador acumula 3 entrenos seguidos sin venir\./);
  app.alertas.recibir({ umbral: 3, temporadaId: null, equipos: [], jugadores: [] }, null);
  app.alertas.render('eq1');
  assert.match(host.innerHTML, /No hay temporada activa\./);
  app.alertas.recibir(null, 'boom');
  app.alertas.render('eq1');
  assert.match(host.innerHTML, /No se pudieron calcular las alertas\./);
});
