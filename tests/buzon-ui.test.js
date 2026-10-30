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
  return { app, host, modals, abiertas, document };
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

// Registros migrados: TipoJustificacion guarda el momento ('pre'/'post') y MensajeGenerado el texto "false".
function clienteHeredado() {
  const c = cliente();
  c.app.cache.equipos = [{ ID: 'sm', Nombre: 'Senior Masculino' }];
  c.app.cache.jugadores = [{ ID: 'raul', Nombre: 'Raúl', Apellidos: 'Delgado Martínez' }, { ID: 'leo', Nombre: 'Leo', Apellidos: 'Ruiz' }];
  c.app.cache.jugadoresEquipos = [{ ID_Jugador: 'raul', ID_Equipo: 'sm', Tipo: 'Principal', Activo: true },
    { ID_Jugador: 'leo', ID_Equipo: 'sm', Tipo: 'Principal', Activo: true }];
  c.app.cache.sesiones = [{ ID: 's12', ID_Equipo: 'sm', Fecha: '2026-05-12', HoraInicio: '20:00', HoraFin: '22:00', AsistenciaGuardada: true }];
  c.app.cache.asistJugadores = [
    { ID: 'h1', ID_Sesion: 's12', ID_Jugador: 'raul', Estado: 'A', TieneJustificacion: true, TipoJustificacion: 'pre',
      MotivoCategoria: 'Lesión', MotivoDetalle: 'Esguince tobillo derecho', JustificadoPor: 'padres', MensajeGenerado: 'false' },
    { ID: 'h2', ID_Sesion: 's12', ID_Jugador: 'leo', Estado: 'R', MinutosRetraso: 20, TieneJustificacion: true, TipoJustificacion: 'post',
      MotivoCategoria: 'Estudios', MotivoDetalle: '', JustificadoPor: 'padres', MensajeGenerado: 'false' },
  ];
  c.app.state.sesionId = 's12';
  return c;
}

test('el mensaje se formatea desde tipo, minutos, motivo y detalle, nunca desde MensajeGenerado ni TipoJustificacion heredados', () => {
  const { app } = clienteHeredado();
  const ausencia = app.notifications.justificacion(app.cache.asistJugadores[0]);
  assert.equal(ausencia.tipo, 'Ausencia');
  assert.equal(ausencia.minutos, null);
  assert.equal(ausencia.mensaje, 'Los padres/tutores de Raúl Delgado Martínez han notificado una ausencia al entrenamiento del Martes 12/05/2026 a las 20:00 ' +
    'del equipo Senior Masculino. Motivo: Lesión. Información adicional: "Esguince tobillo derecho".');
  const retraso = app.notifications.justificacion(app.cache.asistJugadores[1]);
  assert.equal(retraso.tipo, 'Retraso');
  assert.equal(retraso.minutos, 20);
  assert.equal(retraso.mensaje, 'Los padres/tutores de Leo Ruiz han notificado una llegada con retraso al entrenamiento del Martes 12/05/2026 a las 20:00 ' +
    'del equipo Senior Masculino. Motivo: Estudios. Llegará con unos 20 minutos de retraso.');
});

test('la sesión guardada muestra el chip «Justificada» y abre la misma hoja que el pase de lista', () => {
  const { app, modals, document } = clienteHeredado();
  const elementos = new Map();
  document.getElementById = id => {
    if (!elementos.has(id)) elementos.set(id, { innerHTML: '', style: {} });
    return elementos.get(id);
  };
  app.views['sesion-guardada'].render();
  const lista = elementos.get('sesion-ro-justif-lista').innerHTML;
  assert.match(lista, /class="jug-justif-aviso"[^>]*verJustif\(&quot;raul&quot;\)[\s\S]*?<span>Justificada<\/span>/);
  assert.match(elementos.get('sesion-ro-jugs').innerHTML, /<span>Justificada<\/span>/);
  assert.doesNotMatch(lista + elementos.get('sesion-ro-jugs').innerHTML, /justif-badge/);

  app.views['sesion-guardada'].verJustif('raul');
  app.views.sesion.verJustificacion('raul');
  const [hoja, paseDeLista] = modals;
  assert.ok(hoja.html.includes('Información adicional: &quot;Esguince tobillo derecho&quot;.'));
  assert.match(hoja.html, /is-absent">Ausencia</);
  assert.doesNotMatch(hoja.html, />false<|\bpre\b/);
  assert.equal(hoja.title, paseDeLista.title);
  assert.equal(hoja.html.replace(/<button[^>]*descargarPDF[\s\S]*?<\/button>/, ''), paseDeLista.html);
});
