// Asistente «Cancelar entrenamiento» (cliente): pasos, recuento previo, llamada a cancelarSesion y resultado.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function elemento() {
  return { value: '', checked: false, hidden: false, disabled: false, textContent: '', innerHTML: '', style: {}, dataset: {},
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
    const sesion = { ...app.cache.sesiones[0], Cancelada: true, MotivoCancelacion: args[1], DetalleCancelacion: args[2].detalle || null };
    return Promise.resolve(onSuccess({ success: true, sesion, notificacion: notificacion || { canal: args[2].canal } }));
  };
  const wizard = app.views.cancelarSesion;
  return { app, wizard, els, calls, navegacion, notices, portapapeles, document, window };
}

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

test('detalle opcional: sin texto solo «Omitir»; Omitir lo vacía y Continuar lo guarda en una línea', () => {
  const { wizard, els } = client();
  wizard.abrir('s1');
  wizard.elegirMotivo('Otro');
  assert.equal(els['cancelar-continuar-detalle'].hidden, true);
  els['cancelar-detalle'].value = '  Pista\n mojada ';
  wizard._actualizarBotones();
  assert.equal(els['cancelar-continuar-detalle'].hidden, false);
  wizard.omitirDetalle();
  assert.equal(wizard._datos.detalle, '');
  assert.equal(els['cancelar-detalle'].value, '');
  assert.equal(wizard._paso, 'aviso');
  wizard.atras();
  els['cancelar-detalle'].value = '  Pista\n mojada ';
  wizard.continuarDetalle();
  assert.equal(wizard._datos.detalle, 'Pista mojada');
});

test('el paso de aviso cuenta convocados con teléfono y con correo; el resumen avisa de las omisiones y previsualiza', () => {
  const { wizard, els, calls } = client();
  wizard.abrir('s1');
  wizard.elegirMotivo('Climatología');
  els['cancelar-detalle'].value = 'Pista mojada';
  wizard.continuarDetalle();
  assert.equal(els['cancelar-aviso-hint'].textContent, 'Jugadores convocados: 3');
  assert.equal(els['cancelar-canal-whatsapp-info'].textContent, '2 de 3 con teléfono');
  assert.equal(els['cancelar-canal-correo-info'].textContent, '1 de 3 con correo', 'avisos por correo desactivados no cuentan');
  wizard.elegirCanal('whatsapp');
  assert.equal(wizard._paso, 'resumen');
  assert.match(els['cancelar-resumen'].innerHTML, /1 familia no tiene teléfono: no recibirá el aviso\./);
  assert.equal(els['cancelar-preview-wrap'].hidden, false);
  assert.equal(els['cancelar-preview'].textContent,
    '❌ *Entrenamiento cancelado*\n🏀 Equipo Cadete Masculino\n📅 lunes 16/11/2026 a las 19:00\n📝 Motivo: Climatología\nPista mojada\n\nUn saludo,\nMarta López');
  wizard.atras();
  wizard.elegirCanal('ninguno');
  assert.equal(els['cancelar-preview-wrap'].hidden, true);
  wizard.cerrar();
  assert.equal(els['modal-cancelar-sesion'].classList.contains('hidden'), true);
  assert.equal(calls.length, 0, 'cerrar antes de confirmar no cancela nada');
});

test('confirmar cancela, vuelve al calendario y ofrece modos manuales con las omisiones', async () => {
  const notificacion = { canal: 'whatsapp', modo: 'enlaces', mensaje: 'Aviso', convocados: 3, avisados: 2, omitidos: 1, fallidos: 0,
    omitidas: [{ jugador: 'Luis <Gil>' }],
    enlaces: [{ nombre: '', jugadores: ['Ana Ruiz'], telefono: '+34600111222', url: 'https://wa.me/34600111222?text=Aviso&x=<b>' }] };
  const { app, wizard, els, calls, navegacion } = client(notificacion);
  wizard.abrir('s1');
  wizard.elegirMotivo('Climatología');
  els['cancelar-detalle'].value = 'Pista mojada';
  wizard.continuarDetalle();
  wizard.elegirCanal('whatsapp');
  assert.equal(await wizard.confirmar(), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fn, 'cancelarSesion');
  assert.deepEqual(calls[0].args, ['s1', 'Climatología', { detalle: 'Pista mojada', canal: 'whatsapp' }]);
  assert.equal(app.cache.sesiones[0].Cancelada, true);
  assert.equal(app.state.sesionId, null);
  assert.deepEqual(navegacion, ['sesiones']);
  assert.equal(wizard._paso, 'hecho');
  const html = els['cancelar-resultado'].innerHTML;
  assert.match(html, /Familias con enlace preparado<\/dt><dd>2/);
  assert.match(html, /Omitidas por no tener teléfono<\/dt><dd>1/);
  assert.match(html, /Luis &lt;Gil&gt;/);
  assert.match(html, /Lista de difusión/);
  assert.match(html, /Uno a uno/);
  assert.match(html, /Los mensajes aún no se han enviado/);
  assert.equal(els['cancelar-terminar'].textContent, 'Terminar');
});

test('copiar: el mensaje se copia dentro del toque, antes de esperar al servidor, y el resultado lo confirma', async () => {
  const { wizard, calls, portapapeles, els } = client({ canal: 'copiar', mensaje: 'Mensaje del servidor', convocados: 3 });
  wizard.abrir('s1');
  wizard.elegirMotivo('Otro');
  wizard.omitirDetalle();
  wizard.elegirCanal('copiar');
  const pendiente = wizard.confirmar();
  assert.deepEqual(portapapeles, ['❌ *Entrenamiento cancelado*\n🏀 Equipo Cadete Masculino\n📅 lunes 16/11/2026 a las 19:00\n📝 Motivo: Otro\n\nUn saludo,\nMarta López']);
  assert.equal(await pendiente, true);
  assert.deepEqual(calls[0].args[2], { detalle: '', canal: 'copiar' });
  assert.match(els['cancelar-resultado'].innerHTML, /Mensaje copiado\. Pégalo donde quieras\./);
});

function avisoWhatsApp() {
  return {
    canal: 'whatsapp', modo: 'enlaces', mensaje: '❌ Aviso\nEquipo <Cadete>', avisados: 2, omitidos: 1,
    omitidas: [{ jugador: 'Luis <Gil>' }],
    enlaces: [
      { nombre: '', jugadores: ['Ana Ruiz'], telefono: '+34600111222', url: 'https://wa.me/34600111222?text=Aviso&x=<b>' },
      { nombre: 'Eva Sanz', jugadores: ['Eva Sanz'], telefono: '+34611222333', url: 'https://wa.me/34611222333?text=Aviso' },
    ],
  };
}

test('difusión copia el mensaje al elegirla, permite repetir y copia todos los teléfonos', async () => {
  const { wizard, els, portapapeles } = client();
  const n = avisoWhatsApp();
  wizard._pintarResultado(n, false);
  wizard.elegirModoWhatsApp('difusion');
  assert.deepEqual(portapapeles, [n.mensaje], 'copia durante el gesto de elegir');
  const html = els['cancelar-whatsapp'].innerHTML;
  assert.match(html, /Equipo &lt;Cadete&gt;/);
  assert.match(html, /Guardar|Guarda los teléfonos/);
  assert.match(html, /selecciona esos contactos uno a uno/);
  assert.match(html, /tengan guardado tu número/);
  assert.match(html, /Copiar mensaje/);
  assert.match(html, /Copiar todos/);
  assert.ok(html.includes('href="https://wa.me/?text=' + encodeURIComponent(n.mensaje) + '"'));
  assert.equal(await wizard.copiar(), true);
  assert.equal(await wizard.copiarTelefonos(), true);
  assert.deepEqual(portapapeles, [n.mensaje, n.mensaje, '+34600111222\n+34611222333']);
  assert.match(els['cancelar-resultado'].innerHTML, /Luis &lt;Gil&gt;/);
});

test('secuencia avanza solo tras salir y volver una vez; omitir y cerrar limpian eventos', () => {
  const { wizard, els, document, window } = client();
  wizard._pintarResultado(avisoWhatsApp(), false);
  const baseVisibility = document.cantidad('visibilitychange');
  wizard.elegirModoWhatsApp('secuencia');
  assert.match(els['cancelar-whatsapp'].innerHTML, /Contacto 1 de 2/);
  assert.ok(els['cancelar-whatsapp'].innerHTML.includes('href="https://wa.me/34600111222?text=Aviso&amp;x=&lt;b&gt;"'));
  assert.match(els['cancelar-whatsapp'].innerHTML, /Ana Ruiz/);
  wizard.abrirContacto();
  const retornoAnterior = wizard._retornoWhatsApp.alVolver;
  window.emit('focus');
  window.emit('pageshow');
  document.emit('visibilitychange');
  assert.equal(wizard._indiceWhatsApp, 0, 'abrir sin salir no avanza');
  document.hidden = true;
  document.emit('visibilitychange');
  window.emit('focus');
  assert.equal(wizard._indiceWhatsApp, 0, 'no avanza mientras está oculta');
  document.hidden = false;
  document.emit('visibilitychange');
  window.emit('focus');
  window.emit('pageshow');
  retornoAnterior();
  assert.equal(wizard._indiceWhatsApp, 1, 'múltiples eventos de retorno no duplican el avance');
  assert.match(els['cancelar-whatsapp'].innerHTML, /Contacto 2 de 2/);
  assert.match(els['cancelar-whatsapp'].innerHTML, /Eva Sanz/);
  assert.equal(document.cantidad('visibilitychange'), baseVisibility);
  assert.equal(window.cantidad('focus'), 0);
  wizard.abrirContacto();
  window.emit('blur');
  wizard.omitirContacto();
  window.emit('focus');
  assert.equal(wizard._indiceWhatsApp, 2, 'omitir no deja un retorno pendiente');
  assert.match(els['cancelar-whatsapp'].innerHTML, /No quedan contactos pendientes/);
  assert.equal(window.cantidad('pageshow'), 0);
  wizard.cerrar();
  assert.equal(document.cantidad('visibilitychange'), baseVisibility);
});

test('secuencia también reconoce pagehide/pageshow y blur/focus; cerrar o cambiar de modo cancela el retorno', () => {
  const { wizard, document, window } = client();
  wizard._pintarResultado(avisoWhatsApp(), false);
  wizard.elegirModoWhatsApp('secuencia');
  wizard.abrirContacto();
  window.emit('pagehide');
  window.emit('pageshow');
  assert.equal(wizard._indiceWhatsApp, 1);
  wizard.abrirContacto();
  window.emit('blur');
  window.emit('focus');
  assert.equal(wizard._indiceWhatsApp, 2);
  wizard._pintarResultado(avisoWhatsApp(), false);
  wizard.elegirModoWhatsApp('secuencia');
  wizard.abrirContacto();
  window.emit('blur');
  wizard.elegirModoWhatsApp('difusion');
  window.emit('focus');
  assert.equal(wizard._indiceWhatsApp, 0);
  wizard.elegirModoWhatsApp('secuencia');
  wizard.abrirContacto();
  window.emit('blur');
  wizard.cerrar();
  window.emit('focus');
  assert.equal(wizard._indiceWhatsApp, 0);
  assert.equal(window.cantidad('focus'), 0);
  assert.equal(document.cantidad('visibilitychange'), 1);
});

test('sin teléfonos no ofrece modos y enumera todas las omisiones; firma antigua y traducciones', () => {
  const { app, wizard, els } = client();
  wizard._pintarResultado({ canal: 'whatsapp', avisados: 0, omitidos: 2, enlaces: [],
    omitidas: [{ jugador: 'Ana Ruiz' }, { jugador: 'Luis Gil' }] }, false);
  assert.match(els['cancelar-resultado'].innerHTML, /Ana Ruiz/);
  assert.match(els['cancelar-resultado'].innerHTML, /Luis Gil/);
  assert.match(els['cancelar-resultado'].innerHTML, /No hay teléfonos disponibles/);
  assert.doesNotMatch(els['cancelar-resultado'].innerHTML, /Uno a uno/);
  const sesion = app.cache.sesiones[0], equipo = app.cache.equipos[0];
  assert.match(wizard.mensaje(sesion, equipo, 'Otro', ''), /\n\nUn saludo,\nCB Baeza$/);
  assert.match(wizard.mensaje({ ...sesion, CanceladoPor: 'Ana Gil' }, equipo, 'Otro', ''), /\n\nUn saludo,\nAna Gil$/);
  app.state.usuario = null;
  assert.match(wizard._mensajeActual(sesion, { motivo: 'Otro', detalle: '' }), /\n\nUn saludo,\nCB Baeza$/);
  app.preferences.idioma = 'en';
  assert.equal(app.i18n.texto('Uno a uno'), 'One by one');
  assert.equal(app.i18n.texto('Contacto 1 de 2'), 'Contact 1 of 2');
});
