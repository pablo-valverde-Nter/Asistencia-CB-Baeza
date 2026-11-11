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

function client(notificacion) {
  const els = {}, calls = [], navegacion = [], notices = [], portapapeles = [];
  const document = {
    addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, activeElement: null,
    getElementById: id => (els[id] ||= Object.assign(elemento(), { id })),
    createElement: () => Object.assign(elemento(), { select() {} }),
    body: { appendChild() {}, removeChild() {} },
  };
  const context = vm.createContext({
    document, window: { addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} },
    navigator: { userAgent: 'test', clipboard: { writeText: texto => { portapapeles.push(texto); return Promise.resolve(); } } },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8').replace(/^<script[^>]*>|<\/script>\s*$/g, ''), context);
  const app = vm.runInContext('App', context);
  context.showToast = (message, type) => notices.push({ message, type });
  app.state.rol = 'entrenador';
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
  return { app, wizard, els, calls, navegacion, notices, portapapeles };
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
    'CB Baeza: se cancela el entrenamiento de Cadete Masculino del lunes 16/11/2026 a las 19:00. Motivo: Climatología. Información adicional: Pista mojada.');
  wizard.atras();
  wizard.elegirCanal('ninguno');
  assert.equal(els['cancelar-preview-wrap'].hidden, true);
  wizard.cerrar();
  assert.equal(els['modal-cancelar-sesion'].classList.contains('hidden'), true);
  assert.equal(calls.length, 0, 'cerrar antes de confirmar no cancela nada');
});

test('confirmar llama a cancelarSesion con motivo, detalle y canal, vuelve al calendario y lista los enlaces de WhatsApp', async () => {
  const notificacion = { canal: 'whatsapp', modo: 'enlaces', mensaje: 'Aviso', convocados: 3, avisados: 2, omitidos: 1, fallidos: 0,
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
  assert.ok(html.includes('href="https://wa.me/34600111222?text=Aviso&amp;x=&lt;b&gt;"'), 'el enlace va escapado');
  assert.ok(html.includes('Familia de Ana Ruiz'));
});

test('copiar: el mensaje se copia dentro del toque, antes de esperar al servidor, y el resultado lo confirma', async () => {
  const { wizard, calls, portapapeles, els } = client({ canal: 'copiar', mensaje: 'Mensaje del servidor', convocados: 3 });
  wizard.abrir('s1');
  wizard.elegirMotivo('Otro');
  wizard.omitirDetalle();
  wizard.elegirCanal('copiar');
  const pendiente = wizard.confirmar();
  assert.deepEqual(portapapeles, ['CB Baeza: se cancela el entrenamiento de Cadete Masculino del lunes 16/11/2026 a las 19:00. Motivo: Otro.']);
  assert.equal(await pendiente, true);
  assert.deepEqual(calls[0].args[2], { detalle: '', canal: 'copiar' });
  assert.match(els['cancelar-resultado'].innerHTML, /Mensaje copiado\. Pégalo donde quieras\./);
});
