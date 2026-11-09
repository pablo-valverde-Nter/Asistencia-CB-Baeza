const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const TABLAS = { HORARIOS: 'horarios', PROGRAMACIONES_JUSTIFICACIONES: 'programaciones', SESIONES: 'sesiones',
  ASIST_JUGADORES: 'asistJugadores', JUGADORES: 'jugadores', EQUIPOS: 'equipos', JUGADORES_EQUIPOS: 'jugadoresEquipos' };

function backend(rows) {
  const writes = [];
  let id = 0;
  const context = vm.createContext({
    findById: (table, rowId) => (rows[table] || []).find(row => row.ID === rowId) || null,
    findWhere: (table, field, value) => (rows[table] || []).filter(row => String(row[field]) === String(value)),
    updateRow: (table, rowId, changes) => { writes.push({ op: 'update', table, id: rowId, changes }); return true; },
    deleteRow: (table, rowId) => { writes.push({ op: 'delete', table, id: rowId }); return true; },
    deleteWhere: (table, field, value) => { writes.push({ op: 'deleteWhere', table, field, value }); return true; },
    appendRow: (table, fields) => { writes.push({ op: 'append', table, fields }); return { ID: 'nuevo-' + ++id, ...fields }; },
    Logger: { log() {} },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/Config.gs'), 'utf8'), context);
  vm.runInContext('CONFIG.SHEETS = ' + JSON.stringify(TABLAS), context);
  for (const fichero of ['Equipos.gs', 'Asistencia.gs']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', fichero), 'utf8'), context);
  }
  return { equipos: vm.runInContext('Equipos', context), asistencia: vm.runInContext('Asistencia', context), writes };
}

// Infantil Mixto: tres días con las mismas horas y reglas de ausencia sobre martes y jueves.
function filas() {
  return {
    horarios: [
      { ID: 'h-mar', ID_Equipo: 'inf', DiaSemana: 2, HoraInicio: '19:00', HoraFin: '20:00' },
      { ID: 'h-jue', ID_Equipo: 'inf', DiaSemana: 4, HoraInicio: '19:00', HoraFin: '20:00' },
      { ID: 'h-vie', ID_Equipo: 'inf', DiaSemana: 5, HoraInicio: '19:00', HoraFin: '20:00' },
      { ID: 'otro', ID_Equipo: 'cad', DiaSemana: 2, HoraInicio: '19:00', HoraFin: '20:00' },
    ],
    programaciones: [
      { ID: 'p1', ID_Jugador: 'jd', ID_Horario: 'h-mar', Activo: true },
      { ID: 'p2', ID_Jugador: 'af', ID_Horario: 'h-jue', Activo: true },
      { ID: 'p3', ID_Jugador: 'mb', ID_Horario: 'h-jue', Activo: 'TRUE' },
      { ID: 'p4', ID_Jugador: 'fg', ID_Horario: 'h-vie', Activo: false },
    ],
  };
}

const semana = (...dias) => dias.map(([DiaSemana, HoraInicio, HoraFin]) => ({ DiaSemana, HoraInicio, HoraFin }));
// Los objetos creados dentro del vm tienen otro Object.prototype: se comparan en plano.
const plano = valor => JSON.parse(JSON.stringify(valor));

test('guardar el mismo horario (en otro orden) conserva los ID y no escribe nada', () => {
  const { equipos, writes } = backend(filas());
  const finales = equipos.setHorariosEquipo('inf', semana([5, '19:00', '20:00'], [2, '19:00', '20:00'], [4, '19:00', '20:00']));
  assert.deepEqual(finales.map(h => h.ID), ['h-vie', 'h-mar', 'h-jue']);
  assert.deepEqual(writes, []);
});

test('cambiar un día conserva los ID de los demás y solo borra el día quitado', () => {
  const { equipos, writes } = backend(filas());
  const finales = equipos.setHorariosEquipo('inf', semana([2, '19:00', '20:00'], [4, '19:00', '20:00'], [1, '18:00', '19:00']));
  assert.deepEqual(finales.map(h => h.ID), ['h-mar', 'h-jue', 'nuevo-1']);
  assert.deepEqual(plano(writes), [
    { op: 'delete', table: 'programaciones', id: 'p4' },
    { op: 'delete', table: 'horarios', id: 'h-vie' },
    { op: 'append', table: 'horarios', fields: { ID_Equipo: 'inf', DiaSemana: 1, HoraInicio: '18:00', HoraFin: '19:00' } },
  ]);
});

test('cambiar solo la hora de un día lo actualiza en sitio con el mismo ID', () => {
  const { equipos, writes } = backend(filas());
  const finales = equipos.setHorariosEquipo('inf', semana([2, '19:00', '20:00'], [4, '18:30', '20:00'], [5, '19:00', '20:00']));
  assert.equal(finales[1].ID, 'h-jue');
  assert.equal(finales[1].HoraInicio, '18:30');
  assert.deepEqual(plano(writes), [{ op: 'update', table: 'horarios', id: 'h-jue', changes: { HoraInicio: '18:30', HoraFin: '20:00' } }]);
});

test('quitar un día con programaciones activas falla sin escribir nada; forzar las borra antes que el horario', () => {
  const { equipos, writes } = backend(filas());
  // Además se añade un día y se cambia otro: tampoco deben escribirse.
  const sinJueves = semana([2, '18:00', '20:00'], [5, '19:00', '20:00'], [1, '18:00', '19:00']);
  assert.throws(() => equipos.setHorariosEquipo('inf', sinJueves),
    /^Error: No se puede quitar el horario del jueves 19:00-20:00: tiene 2 programaciones de ausencia activas\. Bórralas o edítalas antes\.$/);
  assert.deepEqual(writes, []);

  equipos.setHorariosEquipo('inf', sinJueves, { forzar: true });
  assert.deepEqual(writes.filter(w => w.op === 'delete').map(w => w.id), ['p2', 'p3', 'h-jue']);
});

test('una sesión antigua sin ID_Horario solo se empareja con el horario de su día de la semana', () => {
  const rows = filas();
  rows.horarios = rows.horarios.filter(h => h.ID !== 'h-mar');
  const { asistencia } = backend(rows);
  // 2026-11-03 es martes: el jueves y el viernes tienen las mismas horas pero no son su entrenamiento.
  assert.equal(asistencia._horarioDeSesion_({ ID_Equipo: 'inf', Fecha: '2026-11-03', HoraInicio: '19:00', HoraFin: '20:00' }), null);
  assert.equal(asistencia._horarioDeSesion_({ ID_Equipo: 'inf', Fecha: '2026-11-05', HoraInicio: '19:00', HoraFin: '20:00' }).ID, 'h-jue');
  // Domingo → DiaSemana 7.
  rows.horarios.push({ ID: 'h-dom', ID_Equipo: 'inf', DiaSemana: 7, HoraInicio: '19:00', HoraFin: '20:00' });
  assert.equal(asistencia._horarioDeSesion_({ ID_Equipo: 'inf', Fecha: '2026-11-08', HoraInicio: '19:00', HoraFin: '20:00' }).ID, 'h-dom');
});

function cliente() {
  const fields = { 'eq-nombre': { value: 'Infantil Mixto' }, 'eq-categoria': { value: 'infantil' }, 'eq-modalidad': { value: 'Mixto' } };
  const context = vm.createContext({
    document: { addEventListener() {}, getElementById: id => fields[id] || null, querySelectorAll: () => [] },
    window: { addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8').replace(/^<script[^>]*>|<\/script>\s*$/g, ''), context);
  const app = vm.runInContext('App', context);
  const sent = [], fallos = [];
  app.state.auth = {}; app.state.rol = 'entrenador'; app.state.esAdmin = true;
  app.cache.equipos = [{ ID: 'inf', Nombre: 'Infantil Mixto', Categoria: 'infantil', Modalidad: 'Mixto' }];
  app.state.equipos = app.cache.equipos.slice();
  app.cache.horarios = filas().horarios;
  app.cache.jugadores = [{ ID: 'ana', Nombre: 'Ana', Apellidos: 'Uno' }, { ID: 'ac', Nombre: 'AC', Apellidos: 'Nueva' }];
  app.cache.jugadoresEquipos = [{ ID: 'r1', ID_Jugador: 'ana', ID_Equipo: 'inf', Tipo: 'Principal', Activo: true }];
  app.cache.entrenadores = [{ ID: 'coach', Nombre: 'Coach' }];
  app.cache.entrenadoresEquipos = [{ ID: 'r2', ID_Entrenador: 'coach', ID_Equipo: 'inf', Activo: true }];
  app.navigate = () => {};
  app.sync = { start() {}, done() {} };
  app.views['equipos-admin'].render = () => {};
  app.operation.begin = () => 'token';
  app.operation.succeed = () => {};
  app.operation.fail = (_token, mensaje) => fallos.push(mensaje);
  app.state.formEquipoId = 'inf';
  app.state.formDias = { 5: { inicio: '19:00', fin: '20:00' }, 2: { inicio: '19:00', fin: '20:00' }, 4: { inicio: '19:00', fin: '20:00' } };
  app.state.formEntrenadores = [{ ID: 'coach' }]; app.state.formEntOriginales = ['coach'];
  app.state.formJugadores = [{ ID: 'ana', Tipo: 'Principal' }]; app.state.formJugOriginales = ['ana'];
  let respuestaHorarios = { success: true, actualizado: [] };
  context.server = (fn, ...args) => {
    sent.push(fn);
    return Promise.resolve(fn === 'setHorariosEquipo' ? respuestaHorarios : { success: true });
  };
  const guardar = async () => { app.views['equipo-form'].guardar(true); await new Promise(resolve => setImmediate(resolve)); };
  return { app, sent, fallos, guardar, responder: res => { respuestaHorarios = res; } };
}

test('UI: guardar Editar equipo añadiendo solo un jugador no reescribe el horario ni toca sus ID', async () => {
  const { app, sent, fallos, guardar } = cliente();
  app.state.formJugadores.push({ ID: 'ac', Tipo: 'Principal' });
  await guardar();
  assert.deepEqual(fallos, []);
  assert.deepEqual(sent, ['actualizarEquipo', 'asignarJugadorAEquipo']);
  assert.deepEqual(app.cache.horarios.filter(h => h.ID_Equipo === 'inf').map(h => h.ID).sort(), ['h-jue', 'h-mar', 'h-vie']);
});

test('UI: si el horario cambia, la caché queda con los ID reales del servidor; si lo rechaza, no se guarda nada más', async () => {
  const conCambio = cliente();
  conCambio.app.state.formDias[4] = { inicio: '18:30', fin: '20:00' };
  conCambio.responder({ success: true, actualizado: [
    { ID: 'h-vie', ID_Equipo: 'inf', DiaSemana: 5, HoraInicio: '19:00', HoraFin: '20:00' },
    { ID: 'h-mar', ID_Equipo: 'inf', DiaSemana: 2, HoraInicio: '19:00', HoraFin: '20:00' },
    { ID: 'h-jue', ID_Equipo: 'inf', DiaSemana: 4, HoraInicio: '18:30', HoraFin: '20:00' },
  ] });
  await conCambio.guardar();
  assert.deepEqual(conCambio.sent, ['setHorariosEquipo', 'actualizarEquipo']);
  const enCache = conCambio.app.cache.horarios.filter(h => h.ID_Equipo === 'inf');
  assert.deepEqual(enCache.map(h => h.ID).sort(), ['h-jue', 'h-mar', 'h-vie']);
  assert.equal(enCache.find(h => h.ID === 'h-jue').HoraInicio, '18:30');

  const rechazado = cliente();
  delete rechazado.app.state.formDias[4];
  rechazado.app.state.formJugadores.push({ ID: 'ac', Tipo: 'Principal' });
  const error = 'No se puede quitar el horario del jueves 19:00-20:00: tiene 2 programaciones de ausencia activas. Bórralas o edítalas antes.';
  rechazado.responder({ success: false, error });
  await rechazado.guardar();
  assert.deepEqual(rechazado.sent, ['setHorariosEquipo']);
  assert.deepEqual(rechazado.fallos, [error]);
  assert.deepEqual(rechazado.app.cache.horarios.filter(h => h.ID_Equipo === 'inf').map(h => h.ID).sort(), ['h-jue', 'h-mar', 'h-vie']);
});
