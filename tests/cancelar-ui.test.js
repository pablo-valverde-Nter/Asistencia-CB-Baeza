// Asistente «Cancelar entrenamiento» (cliente): se cancela primero y después se elige el aviso.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function elemento() {
  return { value: '', checked: false, hidden: false, disabled: false, textContent: '', innerHTML: '', href: '', style: {}, dataset: {},
    classList: { _c: new Set(), add(c) { this._c.add(c); }, remove(c) { this._c.delete(c); }, contains(c) { return this._c.has(c); }, toggle(c, on) { on ? this._c.add(c) : this._c.delete(c); } },
    setAttribute() {}, removeAttribute() {}, focus() {}, querySelector: () => null };
}

function eventos() {
  const listeners = new Map();
  return {
    addEventListener(tipo, fn) { if (!listeners.has(tipo)) listeners.set(tipo, new Set()); listeners.get(tipo).add(fn); },
    removeEventListener(tipo, fn) { listeners.get(tipo)?.delete(fn); },
    emit(tipo) { for (const fn of [...(listeners.get(tipo) || [])]) fn({ type: tipo }); },
    cantidad(tipo) { return listeners.get(tipo)?.size || 0; },
  };
}

function client(notificacion) {
  const els = {}, calls = [], navegacion = [], notices = [], portapapeles = [];
  const document = Object.assign(eventos(), {
    hidden: false, documentElement: elemento(), querySelectorAll: () => [], querySelector: () => null, activeElement: null,
    getElementById: id => (els[id] ||= Object.assign(elemento(), { id })),
    createElement: () => Object.assign(elemento(), { select() {} }),
    body: { appendChild() {}, removeChild() {} },
  });
  const window = eventos();
  const context = vm.createContext({
    document, window,
    localStorage: { getItem: () => null, setItem() {} },
    navigator: { userAgent: 'test', clipboard: { writeText: texto => { portapapeles.push(texto); return Promise.resolve(); } } },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8').replace(/^<script[^>]*>|<\/script>\s*$/g, ''), context);
  const app = vm.runInContext('App', context);
  context.showToast = (message, type) => notices.push({ message, type });
  app.state.rol = 'entrenador';
  app.state.usuario = { Nombre: ' Marta ', Apellidos: ' López ' };
  app.state.motivosCancelacion = ['Instalación no disponible', 'Climatología', 'Otro'];
  app.state.sesionId = 's1';
  app.state.viewHistory = ['equipos', 'sesiones', 'sesion'];
  app.cache.equipos = [{ ID: 'e1', Nombre: 'Cadete Masculino' }];
  app.cache.sesiones = [{ ID: 's1', ID_Equipo: 'e1', Fecha: '2026-11-16', HoraInicio: '19:00', HoraFin: '20:30' }];
  app.cache.jugadores = [
    { ID: 'j1', Nombre: 'Ana', Apellidos: 'Ruiz', TelefonoPadre1: '600111222', EmailPadre1: 'familia1@example.test' },
    { ID: 'j2', Nombre: 'Luis', Apellidos: 'Gil', EmailPadre1: 'familia2@example.test', NotificarAusenciasPadre1: false },
    { ID: 'j3', Nombre: 'Eva', Apellidos: 'Sanz', Telefono: '611222333' },
  ];
  app.cache.jugadoresEquipos = ['j1', 'j2', 'j3'].map(id => ({ ID: 'r-' + id, ID_Jugador: id, ID_Equipo: 'e1', Tipo: 'Principal', Activo: true }));
  app.cache.asistJugadores = [];
  app.navigate = vista => navegacion.push(vista);
  app.stats.invalidar = () => {};
  app.views.sesion._stopAutoSave = () => {};
  app.operation.run = (key, fn, args, onSuccess, onError, textos) => {
    calls.push({ key, fn, args: JSON.parse(JSON.stringify(args)), textos });
    if (fn === 'cancelarSesion') {
      const sesion = { ...app.cache.sesiones[0], Cancelada: true, MotivoCancelacion: args[1], DetalleCancelacion: (args[2] && args[2].detalle) || null, CanceladoPor: 'Marta López', CanalAvisoCancelacion: null };
      return Promise.resolve(onSuccess({ success: true, sesion }));
    }
    const sesion = { ...app.cache.sesiones[0], CanalAvisoCancelacion: args[1] };
    return Promise.resolve(onSuccess({ success: true, sesion, notificacion: notificacion || { canal: args[1], mensaje: 'Mensaje del servidor' } }));
  };
  const wizard = app.views.cancelarSesion;
  return { app, wizard, els, calls, navegacion, notices, portapapeles, document, window };
}

const MENSAJE = '❌ *Entrenamiento cancelado*\n🏀 Equipo Cadete Masculino\n📅 lunes 16/11/2026 a las 19:00\n📝 Motivo: Climatología\nPista mojada\n\nUn saludo,\nMarta López';

test('motivo obligatorio de la lista del servidor; Atrás conserva la elección', () => {
  const { wizard, els } = client();
  wizard.abrir('s1');
  assert.equal(els['modal-cancelar-sesion'].classList.contains('hidden'), false);
  assert.equal(wizard._paso, 'motivo');
  for (const motivo of ['Instalación no disponible', 'Climatología', 'Otro']) assert.ok(els['cancelar-motivos'].innerHTML.includes('data-motivo="' + motivo + '"'));
  assert.equal(els['cancelar-sesion-info'].textContent.startsWith('Cadete Masculino · '), true);
  assert.equal(els['cancelar-continuar-motivo'].disabled, true);
  wizard.elegirMotivo('Inventado');
  assert.equal(wizard._paso, 'motivo');
  wizard.elegirMotivo('Climatología');
  assert.equal(wizard._paso, 'detalle');
  wizard.atras();
  assert.equal(wizard._paso, 'motivo');
  assert.equal(els['cancelar-continuar-motivo'].disabled, false);
});

test('al confirmar se cancela con el detalle (o vacío) y después aparece el aviso, sin canal todavía', async () => {
  const { app, wizard, els, calls, navegacion } = client();
  wizard.abrir('s1');
  wizard.elegirMotivo('Climatología');
  els['cancelar-detalle'].value = '  Pista\n mojada ';
  assert.equal(await wizard.confirmar(), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fn, 'cancelarSesion');
  assert.deepEqual(calls[0].args, ['s1', 'Climatología', { detalle: 'Pista mojada' }]);
  assert.equal(app.cache.sesiones[0].Cancelada, true);
  assert.equal(app.cache.sesiones[0].CanalAvisoCancelacion, null);
  assert.equal(app.state.sesionId, null);
  assert.deepEqual(navegacion, ['sesiones']);
  assert.equal(wizard._paso, 'aviso');
  assert.equal(wizard._cancelada, true);
  assert.equal(els['cancelar-titulo'].textContent, 'Avisar a las familias');
  assert.equal(els['cancelar-canal-correo-info'].textContent, '1 de 3 con correo', 'avisos por correo desactivados no cuentan');
  assert.equal(els['cancelar-canal-whatsapp'].href, 'https://wa.me/?text=' + encodeURIComponent(MENSAJE));
  assert.ok(!els['cancelar-canal-whatsapp'].href.includes('wa.me/34'), 'sin número: el entrenador elige el chat');
  wizard.atras();
  assert.equal(wizard._paso, 'aviso', 'no se puede volver a los pasos anteriores una vez cancelado');
});

test('cerrar tras cancelar deja la sesión cancelada, sin registrar canal', async () => {
  const { wizard, els, calls } = client();
  wizard.abrir('s1');
  wizard.elegirMotivo('Otro');
  assert.equal(await wizard.confirmar(), true);
  assert.deepEqual(calls[0].args, ['s1', 'Otro', { detalle: '' }]);
  wizard.cerrar();
  assert.equal(els['modal-cancelar-sesion'].classList.contains('hidden'), true);
  assert.equal(calls.length, 1);
});

test('elegir un canal antes de cancelar no hace nada; el correo se registra después', async () => {
  const { wizard, calls, els } = client({ canal: 'correo', avisados: 1, omitidos: 2, fallidos: 0 });
  wizard.abrir('s1');
  wizard.elegirMotivo('Climatología');
  assert.equal(await wizard.elegirCanal('correo'), false);
  assert.equal(calls.length, 0);
  assert.equal(await wizard.confirmar(), true);
  assert.equal(await wizard.elegirCanal('correo'), true);
  assert.equal(calls[1].fn, 'avisarCancelacion');
  assert.deepEqual(calls[1].args, ['s1', 'correo']);
  assert.equal(wizard._paso, 'hecho');
  assert.match(els['cancelar-resultado'].innerHTML, /Familias avisadas por correo<\/dt><dd>1/);
  assert.match(els['cancelar-resultado'].innerHTML, /Omitidas por no tener correo<\/dt><dd>2/);
  assert.equal(els['cancelar-terminar'].textContent, 'Entendido');
});

test('copiar: el mensaje se copia en el toque de avisar, antes de esperar al servidor', async () => {
  const { wizard, calls, portapapeles, els } = client({ canal: 'copiar', mensaje: 'Mensaje del servidor' });
  wizard.abrir('s1');
  wizard.elegirMotivo('Otro');
  assert.equal(await wizard.confirmar(), true);
  const pendiente = wizard.elegirCanal('copiar');
  assert.deepEqual(portapapeles, ['❌ *Entrenamiento cancelado*\n🏀 Equipo Cadete Masculino\n📅 lunes 16/11/2026 a las 19:00\n📝 Motivo: Otro\n\nUn saludo,\nMarta López']);
  assert.equal(await pendiente, true);
  assert.deepEqual(calls[1].args, ['s1', 'copiar']);
  assert.match(els['cancelar-resultado'].innerHTML, /Mensaje copiado\. Pégalo donde quieras\./);
});

test('WhatsApp copia el mensaje, abre wa.me sin número y no lista teléfonos', async () => {
  const { wizard, els, portapapeles, calls } = client({ canal: 'whatsapp', mensaje: MENSAJE });
  wizard.abrir('s1');
  wizard.elegirMotivo('Climatología');
  els['cancelar-detalle'].value = 'Pista mojada';
  assert.equal(await wizard.confirmar(), true);
  const href = els['cancelar-canal-whatsapp'].href;
  assert.equal(href, 'https://wa.me/?text=' + encodeURIComponent(MENSAJE));
  const pendiente = wizard.elegirCanal('whatsapp');
  assert.deepEqual(portapapeles, [MENSAJE]);
  assert.equal(await pendiente, true);
  assert.deepEqual(calls[1].args, ['s1', 'whatsapp']);
  const html = els['cancelar-resultado'].innerHTML;
  assert.match(html, /Mensaje copiado\. WhatsApp se ha abierto/);
  assert.ok(html.includes('href="' + href.replace(/&/g, '&amp;') + '"'));
  assert.doesNotMatch(html, /Lista de difusión|Uno a uno|teléfono|wa\.me\/34/);
});

test('no avisar registra el canal ninguno; firmas y traducción de No avisar', async () => {
  const { app, wizard, els } = client({ canal: 'ninguno' });
  wizard.abrir('s1');
  wizard.elegirMotivo('Otro');
  assert.equal(await wizard.confirmar(), true);
  assert.equal(await wizard.elegirCanal('ninguno'), true);
  assert.match(els['cancelar-resultado'].innerHTML, /No se ha avisado a las familias\./);
  const sesion = { ID: 's1', ID_Equipo: 'e1', Fecha: '2026-11-16', HoraInicio: '19:00', HoraFin: '20:30' }, equipo = app.cache.equipos[0];
  assert.match(wizard.mensaje(sesion, equipo, 'Otro', ''), /\n\nUn saludo,\nCB Baeza$/);
  assert.match(wizard.mensaje({ ...sesion, CanceladoPor: 'Ana Gil' }, equipo, 'Otro', ''), /\n\nUn saludo,\nAna Gil$/);
  app.state.usuario = null;
  assert.match(wizard._mensajeActual(sesion, { motivo: 'Otro', detalle: '' }), /\n\nUn saludo,\nCB Baeza$/);
  app.preferences.idioma = 'en';
  assert.equal(app.i18n.texto('No avisar'), 'Do not notify');
  assert.equal(app.i18n.texto('Abrir WhatsApp'), 'Open WhatsApp');
});
