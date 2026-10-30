const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const AHORA = '2026-10-27 21:00';

function servidor() {
  const rows = {};
  const writes = [];
  let autorizado = true;
  const context = vm.createContext({
    Auth: {
      verificarCodigoPadres: () => true,
      requireEntrenadorOAdmin() { if (!autorizado) throw new Error('No autorizado.'); },
    },
    Logger: { log() {} },
    Notificaciones: {
      generarMensajeJustificacion: () => 'Aviso',
      notificarJustificacionAEntrenadores: () => false,
      notificarAusenciaAFamilia() {},
    },
    getSheetData: table => rows[table] || [],
    findById: (table, id) => (rows[table] || []).find(row => row.ID === id),
    findWhere: (table, field, value) => (rows[table] || []).filter(row => row[field] === value),
    updateRow(table, id, changes) {
      writes.push({ op: 'update', table, id, changes });
      const row = (rows[table] || []).find(row => row.ID === id);
      if (!row) return false;
      Object.assign(row, changes);
      return true;
    },
    appendRow(table, fields) {
      const row = { ID: 'new-' + writes.length, ...fields };
      writes.push({ op: 'append', table, fields });
      (rows[table] ||= []).push(row);
      return row;
    },
    deleteRow() { throw new Error('Borrado inesperado.'); },
  });
  for (const file of ['Config.gs', 'Asistencia.gs', 'Sesiones.gs', 'Equipos.gs', 'Code.gs']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
  }
  const { CONFIG, Asistencia, Sesiones, Equipos } = vm.runInContext('({ CONFIG, Asistencia, Sesiones, Equipos })', context);
  Asistencia._timestamp_ = () => AHORA;
  rows[CONFIG.SHEETS.SESIONES] = [{ ID: 's1', ID_Equipo: 'e1', Fecha: '2020-01-01' }];
  rows[CONFIG.SHEETS.EQUIPOS] = [{ ID: 'e1' }];
  rows[CONFIG.SHEETS.JUGADORES] = [{ ID: 'j1' }];
  return { rows, writes, CONFIG, asistencia: Asistencia, sesiones: Sesiones, equipos: Equipos, context,
    denegar: () => { autorizado = false; } };
}

function guardar(servidor, estado, minutosRetraso) {
  return servidor.asistencia.guardarAsistenciaCompleta('s1', {
    jugadores: [{ jugadorId: 'j1', estado, minutosRetraso }], entrenadores: [],
  });
}

test('una justificación pasada conserva P y nunca escribe Estado; las altas tampoco lo infieren', () => {
  const s = servidor();
  s.rows[s.CONFIG.SHEETS.ASIST_JUGADORES] = [{ ID: 'a1', ID_Sesion: 's1', ID_Jugador: 'j1', Estado: 'P' }];
  const result = s.asistencia.registrarJustificacion('s1', 'j1', 'codigo', 'Ausencia', 'Consulta', '', null);
  assert.equal(result.registro.Estado, 'P');
  assert.ok(s.writes.every(write => !Object.hasOwn(write.changes || write.fields, 'Estado')));
  s.rows[s.CONFIG.SHEETS.ASIST_JUGADORES] = [];
  s.asistencia.registrarJustificacion('s1', 'j1', 'codigo', 'Ausencia', 'Consulta', '', null);
  const insert = s.writes.find(write => write.op === 'append');
  assert.equal(Object.hasOwn(insert.fields, 'Estado'), false);
});

test('una sesión cancelada rechaza justificación y guardado sin escrituras ni programaciones', () => {
  for (const cancelada of [true, 'TRUE']) {
    const s = servidor();
    s.rows[s.CONFIG.SHEETS.SESIONES][0].Cancelada = cancelada;
    assert.throws(() => s.asistencia.registrarJustificacion('s1', 'j1', 'codigo', 'Ausencia', 'Consulta', '', null),
      { message: 'La sesión está cancelada.' });
    assert.throws(() => guardar(s, 'P', null),
      { message: 'La sesión está cancelada. Reactívala para registrar asistencia.' });
    assert.equal(s.asistencia.aplicarProgramacionesSesion(s.rows[s.CONFIG.SHEETS.SESIONES][0]), 0);
    assert.equal(s.writes.length, 0);
  }
});

test('valida todos los minutos antes de escribir ninguna asistencia', () => {
  for (const minutosRetraso of [0, 200, 1.5, '15', true]) {
    const s = servidor();
    assert.throws(() => s.asistencia.guardarAsistenciaCompleta('s1', {
      jugadores: [{ jugadorId: 'primero', estado: 'P' }, { jugadorId: 'j1', estado: 'R', minutosRetraso }],
      entrenadores: [],
    }), { message: 'Minutos de retraso no válidos.' });
    assert.equal(s.writes.length, 0);
  }
});

test('inserta y actualiza minutos de R y los borra para P', () => {
  const s = servidor();
  guardar(s, 'R', 15);
  const insert = s.writes.find(write => write.op === 'append');
  assert.equal(insert.fields.MinutosRetraso, 15);
  guardar(s, 'R', 30);
  assert.equal(s.rows[s.CONFIG.SHEETS.ASIST_JUGADORES][0].MinutosRetraso, 30);
  guardar(s, 'P', 200);
  assert.equal(s.rows[s.CONFIG.SHEETS.ASIST_JUGADORES][0].MinutosRetraso, null);
  for (const minutos of [null, '', undefined]) {
    guardar(s, 'R', minutos);
    assert.equal(s.rows[s.CONFIG.SHEETS.ASIST_JUGADORES][0].MinutosRetraso, null);
  }
});

test('el primer registro se fija solo una vez y vuelve en la respuesta', () => {
  const s = servidor();
  assert.equal(guardar(s, 'P', null).fechaPrimerRegistro, AHORA);
  s.asistencia._timestamp_ = () => '2026-10-28 22:00';
  assert.equal(guardar(s, 'P', null).fechaPrimerRegistro, AHORA);
  const updates = s.writes.filter(write => write.table === s.CONFIG.SHEETS.SESIONES);
  assert.equal(updates.length, 2);
  assert.ok(updates.every(write => write.changes.AsistenciaGuardada && write.changes.FechaPrimerRegistro === AHORA));
});

test('cancelación valida motivo, existencia y asistencia guardada antes de escribir', () => {
  const s = servidor();
  const motivo = s.CONFIG.MOTIVOS_CANCELACION[0];
  assert.throws(() => s.sesiones.cancelarSesion('s1', 'Inventado'), { message: 'Motivo de cancelación no válido.' });
  assert.throws(() => s.sesiones.cancelarSesion('inexistente', motivo), { message: 'Sesión no encontrada.' });
  for (const guardada of [true, 'TRUE']) {
    s.rows[s.CONFIG.SHEETS.SESIONES][0].AsistenciaGuardada = guardada;
    assert.throws(() => s.sesiones.cancelarSesion('s1', motivo),
      { message: 'No se puede cancelar una sesión con asistencia guardada. Elimínala si fue un error.' });
  }
  assert.equal(s.writes.length, 0);
});

test('cancelar y reactivar devuelven la sesión actualizada y los endpoints exigen personal', () => {
  const s = servidor();
  s.context.motivo = s.CONFIG.MOTIVOS_CANCELACION[0];
  const result = vm.runInContext("cancelarSesion({}, 's1', motivo)", s.context);
  assert.equal(result.success, true);
  assert.equal(result.sesion.Cancelada, true);
  assert.equal(result.sesion.FechaCancelacion, AHORA);
  assert.equal(result.sesion.MotivoCancelacion, s.context.motivo);
  const reactivada = vm.runInContext("reactivarSesion({}, 's1')", s.context);
  assert.equal(reactivada.success, true);
  assert.equal(reactivada.sesion.Cancelada, false);
  assert.equal(reactivada.sesion.MotivoCancelacion, null);
  assert.equal(reactivada.sesion.FechaCancelacion, null);
  s.denegar();
  assert.equal(vm.runInContext("cancelarSesion({}, 's1', motivo)", s.context).error, 'No autorizado.');
  assert.equal(vm.runInContext("reactivarSesion({}, 's1')", s.context).error, 'No autorizado.');
  assert.equal(s.writes.length, 2);
});

test('las sesiones semanales y extra nacen explícitamente no canceladas', () => {
  const s = servidor();
  s.rows[s.CONFIG.SHEETS.TEMPORADAS] = [{ ID: 't1', Activa: true }];
  s.rows[s.CONFIG.SHEETS.HORARIOS] = [{ ID: 'h1', ID_Equipo: 'e1', DiaSemana: 1, HoraInicio: '18:00', HoraFin: '19:00' }];
  s.sesiones._getLunesSemanaActual_ = () => new Date('2026-10-26T00:00:00');
  s.asistencia.aplicarProgramacionesSesion = () => 0;
  assert.equal(s.sesiones.generarSesionesSemana('e1').creadas[0].Cancelada, false);
  assert.equal(s.sesiones.crearSesionExtra('e1', { Fecha: '2026-10-28', HoraInicio: '18:00', HoraFin: '19:00' }).Cancelada, false);
});

for (const tipo of ['jugador', 'entrenador']) {
  test(`las altas y bajas de ${tipo} conservan filas históricas y cierran todas las activas`, () => {
    const s = servidor();
    const jugador = tipo === 'jugador';
    const table = s.CONFIG.SHEETS[jugador ? 'JUGADORES_EQUIPOS' : 'ENTRENADORES_EQUIPOS'];
    const field = jugador ? 'ID_Jugador' : 'ID_Entrenador';
    const asignar = jugador ? 'asignarJugadorAEquipo' : 'asignarEntrenadorAEquipo';
    const desasignar = jugador ? 'desasignarJugadorDeEquipo' : 'desasignarEntrenadorDeEquipo';
    s.rows[table] = [{ ID: 'historica', [field]: 'persona', ID_Equipo: 'e1', Activo: false, FechaBaja: '2026-09-01' }];
    const relacion = s.equipos[asignar]('persona', 'e1', jugador ? 'Principal' : undefined);
    assert.notEqual(relacion.ID, 'historica');
    assert.equal(relacion.FechaAlta, '2026-10-27');
    assert.equal(s.rows[table][0].FechaBaja, '2026-09-01');
    if (jugador) {
      s.equipos[asignar]('persona', 'e1', 'Secundario');
      const update = s.writes.find(write => write.op === 'update');
      assert.deepEqual(Object.keys(update.changes), ['Tipo']);
      assert.equal(update.changes.Tipo, 'Secundario');
    } else {
      // Reasignar no duplica ni reescribe; una relación Visor antigua se devuelve como Entrenador.
      s.rows[table][1].TipoRol = 'Visor';
      const n = s.writes.length;
      const existente = s.equipos[asignar]('persona', 'e1');
      assert.deepEqual([existente.ID, existente.TipoRol, s.writes.length, s.rows[table].length], [relacion.ID, 'Entrenador', n, 2]);
    }
    s.rows[table].push({ ID: 'otra-activa', [field]: 'persona', ID_Equipo: 'e1', Activo: 'TRUE' });
    assert.equal(s.equipos[desasignar]('persona', 'e1'), true);
    assert.ok(s.rows[table].slice(1).every(row => row.Activo === false && row.FechaBaja === '2026-10-27'));
    assert.equal(s.rows[table][0].FechaBaja, '2026-09-01');
    const n = s.writes.length;
    assert.equal(s.equipos[desasignar]('persona', 'e1'), true);
    assert.equal(s.writes.length, n);
  });
}

test('los enteros y booleanos nuevos normalizan el vacío a null en PostgREST', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/DataAccess.gs'), 'utf8'), context);
  for (const field of ['DiaSemana', 'MinutosRetraso', 'Cancelada']) {
    context.field = field;
    assert.equal(vm.runInContext("normalizeSupabaseValue_(field, '')", context), null);
  }
  assert.equal(vm.runInContext("normalizeSupabaseValue_('MinutosRetraso', 15)", context), 15);
  assert.equal(vm.runInContext("normalizeSupabaseValue_('Cancelada', false)", context), false);
});
