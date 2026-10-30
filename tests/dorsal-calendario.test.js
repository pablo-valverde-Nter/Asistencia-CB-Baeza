const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function backend() {
  const rows = {
    equipos: [{ ID: 'senior', Nombre: 'Senior' }, { ID: 'cadete', Nombre: 'Cadete' }],
    jugadores: [
      { ID: 'ana', Nombre: 'Ana', Apellidos: 'Uno', Dorsal: '4' },
      { ID: 'bea', Nombre: 'Bea', Apellidos: 'Dos', Dorsal: '4' },
      { ID: 'eva', Nombre: 'Eva', Apellidos: 'Tres', Dorsal: '07' },
      { ID: 'baja', Nombre: 'Baja', Apellidos: 'Cuatro', Dorsal: '9' },
      { ID: 'nueva', Nombre: 'Nueva', Apellidos: 'Cinco', Dorsal: '7' },
    ],
    jugadoresEquipos: [
      { ID: 'r1', ID_Jugador: 'ana', ID_Equipo: 'senior', Tipo: 'Principal', Activo: true },
      { ID: 'r2', ID_Jugador: 'bea', ID_Equipo: 'senior', Tipo: 'Principal', Activo: true },
      { ID: 'r3', ID_Jugador: 'eva', ID_Equipo: 'senior', Tipo: 'Principal', Activo: true },
      { ID: 'r4', ID_Jugador: 'baja', ID_Equipo: 'senior', Tipo: 'Principal', Activo: false },
    ],
  };
  const writes = [];
  const context = vm.createContext({
    CONFIG: { SHEETS: { EQUIPOS: 'equipos', JUGADORES: 'jugadores', JUGADORES_EQUIPOS: 'jugadoresEquipos' },
      TIPOS_JUGADOR_EQUIPO: { PRINCIPAL: 'Principal', SECUNDARIO: 'Secundario' } },
    findById: (table, id) => rows[table].find(row => row.ID === id) || null,
    findWhere: (table, field, value) => rows[table].filter(row => String(row[field]) === String(value)),
    updateRow: (table, id, changes) => { writes.push({ table, id, changes }); return true; },
    appendRow: (table, fields) => { writes.push({ table, fields }); return { ID: 'nueva-rel', ...fields }; },
    Asistencia: { _timestamp_: () => '2026-10-30 10:00:00' },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/Equipos.gs'), 'utf8'), context);
  return { equipos: vm.runInContext('Equipos', context), writes };
}

test('servidor: asignar a un equipo rechaza un dorsal ocupado por otro jugador activo, también con ceros a la izquierda', () => {
  const { equipos, writes } = backend();
  assert.throws(() => equipos.asignarJugadorAEquipo('nueva', 'senior', 'Secundario'),
    /^Error: El dorsal 7 ya lo lleva Eva Tres en Senior\. Elige otro dorsal\.$/);
  assert.equal(writes.length, 0);
  equipos.asignarJugadorAEquipo('nueva', 'cadete', 'Principal');
  assert.equal(writes.length, 1);
});

test('servidor: editar el dorsal valida sus equipos activos; las bajas no cuentan y los duplicados heredados pueden editar otros datos', () => {
  const { equipos, writes } = backend();
  assert.throws(() => equipos.actualizarJugador('eva', { Dorsal: '4' }), /El dorsal 4 ya lo lleva Ana Uno en Senior/);
  assert.equal(writes.length, 0);
  assert.equal(equipos.actualizarJugador('eva', { Dorsal: '9' }), true);
  assert.equal(equipos.actualizarJugador('ana', { Dorsal: '4', Telefono: '600000000' }), true);
  assert.equal(equipos.actualizarJugador('ana', { Dorsal: '' }), true);
  assert.equal(writes.length, 3);
});

function cliente(fields = {}) {
  const context = vm.createContext({
    document: { addEventListener() {}, getElementById: id => fields[id] || null, querySelectorAll: () => [] },
    window: { addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8').replace(/^<script[^>]*>|<\/script>\s*$/g, ''), context);
  const app = vm.runInContext('App', context), notices = [], calls = [];
  app.state.rol = 'entrenador'; app.state.esAdmin = true;
  app.cache.equipos = [{ ID: 'senior', Nombre: 'Senior' }];
  app.cache.jugadores = [
    { ID: 'ana', Nombre: 'Ana', Apellidos: 'Uno', Dorsal: '4' },
    { ID: 'eva', Nombre: 'Eva', Apellidos: 'Tres', Dorsal: '7' },
    { ID: 'libre', Nombre: 'Libre', Apellidos: 'Seis', Dorsal: '04' },
  ];
  app.cache.jugadoresEquipos = [
    { ID: 'r1', ID_Jugador: 'ana', ID_Equipo: 'senior', Tipo: 'Principal', Activo: true },
    { ID: 'r2', ID_Jugador: 'eva', ID_Equipo: 'senior', Tipo: 'Principal', Activo: true },
  ];
  app.cache.entrenadoresEquipos = [];
  app.navigate = view => { app.state.currentView = view; };
  app.operation.run = (_key, fn, args) => { calls.push({ fn, args }); return Promise.resolve(); };
  context.showToast = (message, type) => notices.push({ message, type });
  return { app, notices, calls };
}

test('UI: editar un jugador a un dorsal ocupado en su equipo muestra el error y no llama al servidor', () => {
  const { app, notices, calls } = cliente();
  app.account.open('jugador', 'eva');
  app.account.guardarStaffPerfil({ Nombre: 'Eva', Apellidos: 'Tres', Dorsal: '04', EmailPadre1: 'f@example.test', NotificarAusenciasPadre1: true });
  assert.deepEqual(notices.at(-1), { message: 'El dorsal 04 ya lo lleva Ana Uno en Senior. Elige otro dorsal.', type: 'error' });
  assert.equal(calls.length, 0);
  app.account.guardarStaffPerfil({ Nombre: 'Eva', Apellidos: 'Tres', Dorsal: '8', EmailPadre1: 'f@example.test', NotificarAusenciasPadre1: true });
  assert.equal(calls[0].fn, 'actualizarJugador');
});

test('UI: el formulario de equipo no añade un jugador con un dorsal de la plantilla en edición', () => {
  const nombre = { value: 'Senior' }, body = { innerHTML: '' };
  const { app, notices } = cliente({ 'eq-nombre': nombre, 'modal-body': body });
  app.state.formJugadores = [{ ID: 'ana', Nombre: 'Ana', Apellidos: 'Uno', Dorsal: '4', Tipo: 'Principal' }];
  app.views['equipo-form']._elegir({ ID: 'libre', Nombre: 'Libre', Apellidos: 'Seis', Dorsal: '04' }, 'jug');
  assert.equal(notices.at(-1).message, 'El dorsal 04 ya lo lleva Ana Uno en Senior. Elige otro dorsal.');
  assert.equal(app.state._jugadorPendiente, null);
  app.state.formJugadores = [];
  app.views['equipo-form']._elegir({ ID: 'libre', Nombre: 'Libre', Apellidos: 'Seis', Dorsal: '04' }, 'jug');
  assert.equal(app.state._jugadorPendiente.ID, 'libre');
});

test('calendario: arranca hoy o en el entrenamiento más cercano de esta semana, nunca en uno antiguo del mes', () => {
  const { app } = cliente();
  const fecha = (...dias) => dias.map(Fecha => ({ Fecha }));
  const semana = ['2026-10-26', '2026-11-01'];
  assert.equal(app.calendar.fechaInicial(fecha('2026-10-01', '2026-10-10'), '2026-10-30', ...semana), '2026-10-30');
  assert.equal(app.calendar.fechaInicial(fecha('2026-10-01', '2026-10-27', '2026-10-29'), '2026-10-30', ...semana), '2026-10-29');
  assert.equal(app.calendar.fechaInicial(fecha('2026-10-29', '2026-10-31', '2026-10-30'), '2026-10-30', ...semana), '2026-10-30');
  assert.equal(app.calendar.fechaInicial(fecha('2026-10-29', '2026-10-31'), '2026-10-30', ...semana), '2026-10-31');
});
