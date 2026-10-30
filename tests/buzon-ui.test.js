const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function cliente() {
  const host = { innerHTML: '', querySelectorAll: () => [] }, almacen = new Map();
  const localStorage = { getItem: k => almacen.has(k) ? almacen.get(k) : null, setItem: (k, v) => almacen.set(k, String(v)) };
  const document = { addEventListener() {}, getElementById: id => id === 'notification-inbox' ? host : null };
  const context = vm.createContext({ document, localStorage, window: { addEventListener() {} }, requestAnimationFrame() {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8').replace(/^<script[^>]*>|<\/script>\s*$/g, ''), context);
  const app = vm.runInContext('App', context), modals = [], abiertas = [];
  app.openModal = (title, html) => { modals.push({ title, html }); };
  app.closeModal = () => {};
  app.notifications._refreshHome = () => {};
  app.views.sesiones.abrirSesion = id => abiertas.push(id);
  app.state.usuario = { ID: 'entrenador-luis' };
  app.cache.equipos = [{ ID: 'eq1', Nombre: 'Cadete' }];
  app.cache.jugadores = [{ ID: 'j1', Nombre: 'Ana', Apellidos: 'García' }, { ID: 'j2', Nombre: '<b>Leo</b>', Apellidos: 'Ruiz' }];
  app.cache.sesiones = [{ ID: 's1', ID_Equipo: 'eq1', Fecha: '2026-10-26', HoraInicio: '18:00', HoraFin: '19:30' }];
  app.cache.asistJugadores = [
    { ID: 'r1', ID_Sesion: 's1', ID_Jugador: 'j1', Estado: 'R', MinutosRetraso: 15, TieneJustificacion: true, TipoJustificacion: 'Retraso',
      MotivoCategoria: 'Médico', MotivoDetalle: 'Dentista', FechaJustificacion: '2026-10-26 10:00' },
    { ID: 'r2', ID_Sesion: 's1', ID_Jugador: 'j2', Estado: 'A', TieneJustificacion: true, TipoJustificacion: 'Ausencia',
      MotivoCategoria: 'Enfermedad', FechaJustificacion: '2026-10-25 10:00' },
  ];
  return { app, host, modals, abiertas };
}

const MENSAJE_ANA = 'Los padres/tutores de Ana García han notificado una llegada con retraso al entrenamiento del Lunes 26/10/2026 a las 18:00 del equipo Cadete. Motivo: Médico. Llegará con unos 15 minutos de retraso. Información adicional: &quot;Dentista&quot;.';

test('tocar una notificación la despliega con el mensaje de la familia, la marca leída y solo «Ver sesión» navega', () => {
  const { app, host, abiertas } = cliente();
  app.notifications.openInbox('eq1');
  assert.equal(app.notifications.unreadCount('eq1'), 2);
  assert.doesNotMatch(host.innerHTML, /notification-detail/);
  app.notifications.toggle('eq1', 'r1');
  assert.deepEqual(abiertas, []);
  assert.ok(host.innerHTML.includes(MENSAJE_ANA));
  assert.match(host.innerHTML, /aria-expanded="true"/);
  assert.match(host.innerHTML, />15 min</);
  assert.equal(app.notifications.unreadCount('eq1'), 1);
  app.notifications.verSesion('eq1', 'r1');
  assert.deepEqual(abiertas, ['s1']);
  app.notifications.toggle('eq1', 'r1');
  assert.doesNotMatch(host.innerHTML, /notification-detail/);
});

test('el botón de lectura alterna leída y no leída; borrar oculta la entrada', () => {
  const { app, host } = cliente();
  app.notifications.openInbox('eq1');
  app.notifications.toggleRead('eq1', 'r2');
  assert.equal(app.notifications.unreadCount('eq1'), 1);
  assert.match(host.innerHTML, /aria-label="Marcar como no leída"/);
  app.notifications.toggleRead('eq1', 'r2');
  assert.equal(app.notifications.unreadCount('eq1'), 2);
  app.notifications.deleteOne('eq1', 'r2');
  assert.equal(app.notifications.unreadCount('eq1'), 1);
  assert.doesNotMatch(host.innerHTML, /Ruiz/);
  assert.doesNotMatch(host.innerHTML, /<b>Leo/);
});

test('el chip «Justificada» de la sesión abre el mismo mensaje sin escapar mal el nombre', () => {
  const { app, modals } = cliente();
  app.state.sesionId = 's1';
  app.views.sesion.verJustificacion('j1');
  assert.ok(modals[0].html.includes(MENSAJE_ANA));
  app.views.sesion.verJustificacion('j2');
  assert.match(modals[1].html, /Ruiz, &lt;b&gt;Leo&lt;\/b&gt;/);
  assert.match(modals[1].html, /han notificado una ausencia/);
  assert.doesNotMatch(modals[1].html, /min</);
});
