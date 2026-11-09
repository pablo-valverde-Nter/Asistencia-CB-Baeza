const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const TABLAS = { HORARIOS: 'horarios', PROGRAMACIONES_JUSTIFICACIONES: 'programaciones', SESIONES: 'sesiones',
  ASIST_JUGADORES: 'asistJugadores', JUGADORES: 'jugadores', EQUIPOS: 'equipos', JUGADORES_EQUIPOS: 'jugadoresEquipos',
  AVISOS_JUGADOR: 'avisos' };

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

// Infantil Mixto: tres días con las mismas horas y reglas de ausencia sobre martes y jueves (el viernes, pausada).
// Las justificaciones que generó la regla del jueves están en una sesión pasada y en otra aún no empezada.
function filas() {
  return {
    equipos: [{ ID: 'inf', Nombre: 'Infantil Mixto' }],
    jugadores: [
      { ID: 'jd', Nombre: 'Juan', Apellidos: 'Díaz' }, { ID: 'af', Nombre: 'Ana', Apellidos: 'Fernández' },
      { ID: 'mb', Nombre: 'Marta', Apellidos: 'Blanco' }, { ID: 'fg', Nombre: 'Fran', Apellidos: 'Gil' },
    ],
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
    sesiones: [
      { ID: 's-jue-pasada', ID_Equipo: 'inf', ID_Horario: 'h-jue', Fecha: '2020-01-02', HoraInicio: '19:00', HoraFin: '20:00' },
      { ID: 's-jue-futura', ID_Equipo: 'inf', ID_Horario: 'h-jue', Fecha: '2099-01-01', HoraInicio: '19:00', HoraFin: '20:00' },
      { ID: 's-mar-futura', ID_Equipo: 'inf', ID_Horario: 'h-mar', Fecha: '2099-01-02', HoraInicio: '19:00', HoraFin: '20:00' },
    ],
    asistJugadores: [
      { ID: 'a-af-pasada', ID_Sesion: 's-jue-pasada', ID_Jugador: 'af', Estado: 'A', TieneJustificacion: true, JustificadoPor: 'programacion' },
      { ID: 'a-af-futura', ID_Sesion: 's-jue-futura', ID_Jugador: 'af', Estado: '', TieneJustificacion: true, JustificadoPor: 'programacion' },
      { ID: 'a-mb-futura', ID_Sesion: 's-jue-futura', ID_Jugador: 'mb', Estado: 'A', TieneJustificacion: true, JustificadoPor: 'programacion' },
      { ID: 'a-jd-martes', ID_Sesion: 's-mar-futura', ID_Jugador: 'jd', Estado: '', TieneJustificacion: true, JustificadoPor: 'programacion' },
    ],
  };
}

const semana = (...dias) => dias.map(([DiaSemana, HoraInicio, HoraFin]) => ({ DiaSemana, HoraInicio, HoraFin }));
// Los objetos creados dentro del vm tienen otro Object.prototype: se comparan en plano.
const plano = valor => JSON.parse(JSON.stringify(valor));
const tocaProgramaciones = writes => writes.filter(w => ['programaciones', 'asistJugadores', 'avisos'].includes(w.table));

test('guardar el mismo horario (en otro orden) conserva los ID y no escribe nada', () => {
  const { equipos, writes } = backend(filas());
  const horario = semana([5, '19:00', '20:00'], [2, '19:00', '20:00'], [4, '19:00', '20:00']);
  assert.deepEqual(plano(equipos.previsualizarCambioHorarios('inf', horario)), []);
  const finales = equipos.setHorariosEquipo('inf', horario);
  assert.deepEqual(finales.map(h => h.ID), ['h-vie', 'h-mar', 'h-jue']);
  assert.deepEqual(writes, []);
});

test('añadir un día o quitar uno sin programaciones no toca programaciones ni crea avisos', () => {
  const conLunes = backend(filas());
  const semanaConLunes = semana([2, '19:00', '20:00'], [4, '19:00', '20:00'], [5, '19:00', '20:00'], [1, '18:00', '19:00']);
  assert.deepEqual(plano(conLunes.equipos.previsualizarCambioHorarios('inf', semanaConLunes)), []);
  const finales = conLunes.equipos.setHorariosEquipo('inf', semanaConLunes);
  assert.deepEqual(finales.map(h => h.ID), ['h-mar', 'h-jue', 'h-vie', 'nuevo-1']);
  assert.deepEqual(plano(conLunes.writes), [
    { op: 'append', table: 'horarios', fields: { ID_Equipo: 'inf', DiaSemana: 1, HoraInicio: '18:00', HoraFin: '19:00' } },
  ]);

  const rows = filas();
  rows.programaciones = rows.programaciones.filter(p => p.ID_Horario !== 'h-vie');
  const sinViernes = backend(rows);
  const semanaSinViernes = semana([2, '19:00', '20:00'], [4, '19:00', '20:00']);
  assert.deepEqual(plano(sinViernes.equipos.previsualizarCambioHorarios('inf', semanaSinViernes)), []);
  sinViernes.equipos.setHorariosEquipo('inf', semanaSinViernes);
  assert.deepEqual(plano(sinViernes.writes), [{ op: 'delete', table: 'horarios', id: 'h-vie' }]);
});

test('quitar un día con solo una programación pausada la borra sin pedir confirmación y avisa a la familia', () => {
  const { equipos, writes } = backend(filas());
  const horario = semana([2, '19:00', '20:00'], [4, '19:00', '20:00'], [1, '18:00', '19:00']);
  assert.deepEqual(plano(equipos.previsualizarCambioHorarios('inf', horario)), [{
    ID: 'p4', ID_Jugador: 'fg', Jugador: 'Fran Gil', ID_Horario: 'h-vie', DiaSemana: 5,
    HoraInicio: '19:00', HoraFin: '20:00', Cambio: 'quitado', Activo: false,
  }]);
  const finales = equipos.setHorariosEquipo('inf', horario);
  assert.deepEqual(finales.map(h => h.ID), ['h-mar', 'h-jue', 'nuevo-2']);
  assert.deepEqual(plano(writes).map(w => [w.op, w.table, w.id || w.fields.ID_Jugador || w.fields.DiaSemana]), [
    ['delete', 'programaciones', 'p4'],
    ['append', 'avisos', 'fg'],
    ['delete', 'horarios', 'h-vie'],
    ['append', 'horarios', 1],
  ]);
});

test('cambiar solo la hora de un día sin programaciones lo actualiza en sitio con el mismo ID', () => {
  const rows = filas();
  rows.programaciones = [];
  const { equipos, writes } = backend(rows);
  const finales = equipos.setHorariosEquipo('inf', semana([2, '19:00', '20:00'], [4, '18:30', '20:00'], [5, '19:00', '20:00']));
  assert.equal(finales[1].ID, 'h-jue');
  assert.equal(finales[1].HoraInicio, '18:30');
  assert.deepEqual(plano(writes), [{ op: 'update', table: 'horarios', id: 'h-jue', changes: { HoraInicio: '18:30', HoraFin: '20:00' } }]);
});

test('la vista previa lista las programaciones del día quitado y del día con otra hora, con el mismo emparejamiento', () => {
  const { equipos, writes } = backend(filas());
  // Martes cambia de hora (mismo ID), jueves desaparece, viernes igual y se añade el lunes.
  const horario = semana([2, '18:00', '20:00'], [5, '19:00', '20:00'], [1, '18:00', '19:00']);
  assert.deepEqual(plano(equipos.previsualizarCambioHorarios('inf', horario)).map(p => [p.ID, p.Jugador, p.DiaSemana, p.HoraInicio, p.Cambio, p.Activo]), [
    ['p1', 'Juan Díaz', 2, '19:00', 'hora', true],
    ['p2', 'Ana Fernández', 4, '19:00', 'quitado', true],
    ['p3', 'Marta Blanco', 4, '19:00', 'quitado', true],
  ]);
  assert.deepEqual(writes, [], 'la vista previa no escribe');
});

test('sin forzar, quitar un día o cambiarle la hora con programaciones activas falla sin escribir nada', () => {
  const { equipos, writes } = backend(filas());
  // Además se añade un día: tampoco debe escribirse.
  const sinJueves = semana([2, '19:00', '20:00'], [5, '19:00', '20:00'], [1, '18:00', '19:00']);
  assert.throws(() => equipos.setHorariosEquipo('inf', sinJueves),
    /^Error: No se puede quitar el horario del jueves 19:00-20:00: tiene 2 programaciones de ausencia activas\. Bórralas o edítalas antes\.$/);
  const martesOtraHora = semana([2, '18:00', '20:00'], [4, '19:00', '20:00'], [5, '19:00', '20:00']);
  assert.throws(() => equipos.setHorariosEquipo('inf', martesOtraHora),
    /^Error: No se puede cambiar la hora del martes 19:00-20:00: tiene 1 programación de ausencia activa\. Bórralas o edítalas antes\.$/);
  assert.deepEqual(writes, []);
});

test('con forzar elimina las programaciones, sus justificaciones no empezadas (no las pasadas) y avisa a cada jugador', () => {
  const { equipos, writes } = backend(filas());
  const sinJueves = semana([2, '19:00', '20:00'], [5, '19:00', '20:00']);
  const finales = equipos.setHorariosEquipo('inf', sinJueves, { forzar: true });
  assert.deepEqual(finales.map(h => h.ID), ['h-mar', 'h-vie']);
  const w = plano(writes);
  // Cada regla se retira antes de tocar Horarios; el horario se borra al final.
  assert.deepEqual(w.map(x => [x.op, x.table, x.id || x.fields.ID_Jugador]), [
    ['delete', 'programaciones', 'p2'],
    ['delete', 'asistJugadores', 'a-af-futura'],
    ['append', 'avisos', 'af'],
    ['delete', 'programaciones', 'p3'],
    ['update', 'asistJugadores', 'a-mb-futura'],
    ['append', 'avisos', 'mb'],
    ['delete', 'horarios', 'h-jue'],
  ]);
  assert.ok(!w.some(x => x.id === 'a-af-pasada'), 'la sesión pasada conserva su justificación');
  assert.ok(!w.some(x => x.id === 'a-jd-martes' || x.id === 'p1'), 'otros días no se tocan');
  // El registro con Estado del entrenador conserva Estado y pierde la justificación.
  const marcada = w.find(x => x.id === 'a-mb-futura').changes;
  assert.equal(marcada.TieneJustificacion, false);
  assert.equal('Estado' in marcada, false);
  const aviso = w.find(x => x.table === 'avisos' && x.fields.ID_Jugador === 'af').fields;
  assert.equal(aviso.Tipo, 'programacion-quitada');
  assert.equal(aviso.Leido, false);
  assert.match(aviso.FechaCreacion, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.equal(aviso.Mensaje, 'Infantil Mixto · Jueves 19:00–20:00');
  assert.doesNotMatch(aviso.Mensaje, /Marta|Blanco/, 'sin datos de otros jugadores');
});

test('con forzar, cambiar la hora elimina la programación y actualiza el horario con el mismo ID', () => {
  const { equipos, writes } = backend(filas());
  const finales = equipos.setHorariosEquipo('inf', semana([2, '18:00', '20:00'], [4, '19:00', '20:00'], [5, '19:00', '20:00']), { forzar: true });
  assert.equal(finales[0].ID, 'h-mar');
  assert.deepEqual(plano(writes).map(x => [x.op, x.table, x.id || x.fields.ID_Jugador]), [
    ['delete', 'programaciones', 'p1'],
    ['delete', 'asistJugadores', 'a-jd-martes'],
    ['append', 'avisos', 'jd'],
    ['update', 'horarios', 'h-mar'],
  ]);
  assert.equal(plano(writes)[2].fields.Mensaje, 'Infantil Mixto · Martes 19:00–20:00');
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
  const sent = [], llamadas = [], fallos = [], exitos = [], cancelados = [], modales = [], navegaciones = [];
  app.state.auth = {}; app.state.rol = 'entrenador'; app.state.esAdmin = true;
  app.cache.equipos = [{ ID: 'inf', Nombre: 'Infantil Mixto', Categoria: 'infantil', Modalidad: 'Mixto' }];
  app.state.equipos = app.cache.equipos.slice();
  app.cache.horarios = filas().horarios;
  app.cache.programacionesJustificaciones = filas().programaciones;
  app.cache.jugadores = [{ ID: 'ana', Nombre: 'Ana', Apellidos: 'Uno' }, { ID: 'ac', Nombre: 'AC', Apellidos: 'Nueva' }];
  app.cache.jugadoresEquipos = [{ ID: 'r1', ID_Jugador: 'ana', ID_Equipo: 'inf', Tipo: 'Principal', Activo: true }];
  app.cache.entrenadores = [{ ID: 'coach', Nombre: 'Coach' }];
  app.cache.entrenadoresEquipos = [{ ID: 'r2', ID_Entrenador: 'coach', ID_Equipo: 'inf', Activo: true }];
  app.navigate = view => navegaciones.push(view);
  app.openModal = (titulo, body) => modales.push({ titulo, body });
  app.closeModal = () => {};
  app.sync = { start() {}, done() {} };
  app.views['equipos-admin'].render = () => {};
  app.operation.begin = () => 'token';
  app.operation.succeed = token => exitos.push(token);
  app.operation.fail = (_token, mensaje) => fallos.push(mensaje);
  app.operation.cancelar = token => cancelados.push(token);
  app.state.formEquipoId = 'inf';
  app.state.formDias = { 5: { inicio: '19:00', fin: '20:00' }, 2: { inicio: '19:00', fin: '20:00' }, 4: { inicio: '19:00', fin: '20:00' } };
  app.state.formEntrenadores = [{ ID: 'coach' }]; app.state.formEntOriginales = ['coach'];
  app.state.formJugadores = [{ ID: 'ana', Tipo: 'Principal' }]; app.state.formJugOriginales = ['ana'];
  let respuestaHorarios = { success: true, actualizado: [] };
  let afectadas = [];
  context.server = (fn, ...args) => {
    sent.push(fn);
    llamadas.push({ fn, args: plano(args) });
    if (fn === 'previsualizarCambioHorarios') return Promise.resolve({ success: true, afectadas });
    return Promise.resolve(fn === 'setHorariosEquipo' ? respuestaHorarios : { success: true });
  };
  const esperar = () => new Promise(resolve => setImmediate(resolve));
  const guardar = async () => { app.views['equipo-form'].guardar(true); await esperar(); };
  return { app, sent, llamadas, fallos, exitos, cancelados, modales, navegaciones, guardar, esperar,
    responder: res => { respuestaHorarios = res; }, previsualizar: lista => { afectadas = lista; } };
}

const AFECTADAS_JUEVES = [
  { ID: 'p2', ID_Jugador: 'af', Jugador: 'Ana <Fernández>', ID_Horario: 'h-jue', DiaSemana: 4, HoraInicio: '19:00', HoraFin: '20:00', Cambio: 'quitado', Activo: true },
  { ID: 'p3', ID_Jugador: 'mb', Jugador: 'Marta Blanco', ID_Horario: 'h-jue', DiaSemana: 4, HoraInicio: '19:00', HoraFin: '20:00', Cambio: 'quitado', Activo: false },
];

test('UI: guardar Editar equipo añadiendo solo un jugador no reescribe el horario ni muestra el modal', async () => {
  const { app, sent, fallos, modales, guardar } = cliente();
  app.state.formJugadores.push({ ID: 'ac', Tipo: 'Principal' });
  await guardar();
  assert.deepEqual(fallos, []);
  assert.deepEqual(modales, []);
  assert.deepEqual(sent, ['actualizarEquipo', 'asignarJugadorAEquipo']);
  assert.deepEqual(app.cache.horarios.filter(h => h.ID_Equipo === 'inf').map(h => h.ID).sort(), ['h-jue', 'h-mar', 'h-vie']);
});

test('UI: añadir un día sin programaciones afectadas guarda directo, sin modal ni forzar', async () => {
  const { app, llamadas, modales, exitos, guardar } = cliente();
  app.state.formDias[1] = { inicio: '18:00', fin: '19:00' };
  await guardar();
  assert.deepEqual(modales, []);
  assert.deepEqual(llamadas.map(l => l.fn), ['previsualizarCambioHorarios', 'setHorariosEquipo', 'actualizarEquipo']);
  assert.deepEqual(llamadas[1].args[2], { forzar: false });
  assert.deepEqual(exitos, ['token']);
});

test('UI: quitar un día con programación activa muestra el modal con jugador y día y no guarda hasta confirmar', async () => {
  const c = cliente();
  delete c.app.state.formDias[4];
  c.previsualizar(AFECTADAS_JUEVES);
  await c.guardar();
  assert.deepEqual(c.sent, ['previsualizarCambioHorarios'], 'no llama a setHorariosEquipo antes de confirmar');
  assert.deepEqual(c.cancelados, ['token'], 'el indicador de guardado se retira sin resultado');
  assert.deepEqual(c.navegaciones, []);
  assert.equal(c.modales.length, 1);
  const { titulo, body } = c.modales[0];
  assert.equal(titulo, 'Quitar ausencias programadas');
  assert.match(body, /<strong data-no-i18n>Ana &lt;Fernández&gt;<\/strong>/);
  assert.match(body, /Jueves · 19:00–20:00/);
  assert.match(body, /<strong data-no-i18n>Marta Blanco<\/strong>.*horario-afectada-pausada">Pausada</);
  assert.match(body, />Cancelar<\/button>/);
  assert.match(body, /onclick="App\.closeModal\(\);App\.views\['equipo-form'\]\.confirmarCambioHorarios\(\)">Quitar y guardar<\/button>/);

  c.app.views['equipo-form'].confirmarCambioHorarios();
  await c.esperar();
  assert.deepEqual(c.sent, ['previsualizarCambioHorarios', 'setHorariosEquipo', 'actualizarEquipo']);
  const set = c.llamadas.find(l => l.fn === 'setHorariosEquipo');
  assert.equal(set.args[0], 'inf');
  assert.deepEqual(set.args[1].map(h => h.DiaSemana).sort(), [2, 5]);
  assert.deepEqual(set.args[2], { forzar: true });
  assert.deepEqual(c.exitos, ['token']);
  assert.deepEqual(c.app.cache.programacionesJustificaciones.map(p => p.ID), ['p1', 'p4'], 'las quitadas salen de la caché');
});

test('UI: cancelar el modal no guarda nada y deja el formulario como estaba', async () => {
  const c = cliente();
  c.app.state.formDias[4] = { inicio: '18:30', fin: '20:00' };
  c.previsualizar([{ ...AFECTADAS_JUEVES[0], Cambio: 'hora' }]);
  await c.guardar();
  assert.match(c.modales[0].body, /cambia de hora/);
  c.app.closeModal();
  await c.esperar();
  assert.deepEqual(c.sent, ['previsualizarCambioHorarios']);
  assert.deepEqual(c.fallos, []);
  assert.deepEqual(c.navegaciones, []);
  assert.deepEqual(plano(c.app.state.formDias[4]), { inicio: '18:30', fin: '20:00' });
  assert.equal(c.app.cache.horarios.find(h => h.ID === 'h-jue').HoraInicio, '19:00');
  assert.equal(c.app.cache.programacionesJustificaciones.length, 4);
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
  assert.deepEqual(conCambio.sent, ['previsualizarCambioHorarios', 'setHorariosEquipo', 'actualizarEquipo']);
  const enCache = conCambio.app.cache.horarios.filter(h => h.ID_Equipo === 'inf');
  assert.deepEqual(enCache.map(h => h.ID).sort(), ['h-jue', 'h-mar', 'h-vie']);
  assert.equal(enCache.find(h => h.ID === 'h-jue').HoraInicio, '18:30');

  // Una programación creada entre la vista previa y el guardado: el servidor lo rechaza sin forzar.
  const rechazado = cliente();
  delete rechazado.app.state.formDias[4];
  rechazado.app.state.formJugadores.push({ ID: 'ac', Tipo: 'Principal' });
  const error = 'No se puede quitar el horario del jueves 19:00-20:00: tiene 2 programaciones de ausencia activas. Bórralas o edítalas antes.';
  rechazado.responder({ success: false, error });
  await rechazado.guardar();
  assert.deepEqual(rechazado.sent, ['previsualizarCambioHorarios', 'setHorariosEquipo']);
  assert.deepEqual(rechazado.fallos, [error]);
  assert.deepEqual(rechazado.app.cache.horarios.filter(h => h.ID_Equipo === 'inf').map(h => h.ID).sort(), ['h-jue', 'h-mar', 'h-vie']);
});
