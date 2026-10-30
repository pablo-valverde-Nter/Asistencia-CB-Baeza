const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { datos, AHORA } = require('./fixtures/estadisticas-fixture.js');

function cargar(contexto) {
  const tablas = {
    Temporadas: datos.temporadas, Equipos: datos.equipos, Horarios: datos.horarios, Jugadores: datos.jugadores,
    Jugadores_Equipos: datos.jugadoresEquipos, Entrenadores: datos.entrenadores,
    Entrenadores_Equipos: datos.entrenadoresEquipos, Sesiones: datos.sesiones,
    Asist_Jugadores: datos.asistJugadores, Asist_Entrenadores: datos.asistEntrenadores,
    Programaciones_Justificaciones: [{ ID: 'p1', ID_Jugador: contexto.jugador && contexto.jugador.ID }, { ID: 'p2', ID_Jugador: 'otro' }],
  };
  const context = vm.createContext({
    Logger: { log() {} },
    Utilities: { getUuid: () => 'trace-0000', formatDate: () => AHORA },
    Auth: { getContextoUsuario: () => contexto },
    getSheetData: name => JSON.parse(JSON.stringify(tablas[name])),
    getSupabaseRealtimeConfig_: () => ({}),
  });
  const code = ['src/Config.gs', 'src/Estadisticas.gs', 'src/Code.gs']
    .map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
  vm.runInContext(code, context);
  return context;
}

test('cargarDatos entrega al jugador solo sus datos y sus estadísticas propias', () => {
  const jugador = datos.jugadores[0];
  const res = cargar({ success: true, rol: 'jugador', jugador: { ID: jugador.ID } }).cargarDatos({});
  assert.equal(res.success, true);
  assert.deepEqual(res.jugadores.map(j => j.ID), [jugador.ID]);
  assert.equal('CodigoPadres' in res.jugadores[0], false);
  assert.ok(res.asistJugadores.length > 0);
  assert.ok(res.asistJugadores.every(r => r.ID_Jugador === jugador.ID));
  assert.ok(res.jugadoresEquipos.every(r => r.ID_Jugador === jugador.ID));
  assert.equal(JSON.stringify([res.entrenadores, res.entrenadoresEquipos, res.asistEntrenadores]), '[[],[],[]]');
  assert.deepEqual(res.programacionesJustificaciones.map(p => p.ID), ['p1']);
  const equipos = new Set(res.equipos.map(e => e.ID));
  assert.ok(res.sesiones.every(s => equipos.has(s.ID_Equipo)));
  assert.equal(res.temporadas.length, datos.temporadas.length);
  assert.equal(res.estadisticas.entidad, 'propio');
  assert.equal(res.estadisticasError, null);
  assert.equal(res.alertasAusencias, null);
});

test('cargarDatos calcula el resumen del personal y no rompe el arranque si falla', () => {
  const ctx = cargar({ success: true, rol: 'admin', jugador: null });
  const res = ctx.cargarDatos({});
  assert.equal(res.estadisticas.entidad, 'resumen');
  assert.ok(res.estadisticas.datos.club);
  assert.equal(res.jugadores.length, datos.jugadores.length);

  vm.runInContext('Estadisticas.consultar = () => { throw new Error("boom"); }', ctx);
  const fallido = ctx.cargarDatos({});
  assert.equal(fallido.success, true);
  assert.equal(fallido.estadisticas, null);
  assert.equal(fallido.estadisticasError, 'boom');
  assert.deepEqual(Array.from(fallido.alertasAusencias.jugadores, j => j.jugadorId), ['jugador-gonzalo']);
});

test('cargarDatos entrega alertas solo de los equipos de gestión y sobrevive a su fallo', () => {
  const ctx = cargar({ success: true, rol: 'entrenador', jugador: null, equipos: [{ ID: 'equipo-junior' }], equiposVisor: [{ ID: 'equipo-cadete' }] });
  const res = ctx.cargarDatos({});
  assert.deepEqual(Array.from(res.alertasAusencias.equipos), ['equipo-junior']);
  assert.equal(res.alertasAusencias.jugadores.length, 0);
  assert.equal(res.alertasAusenciasError, null);
  vm.runInContext('Estadisticas.alertasAusencias = () => { throw new Error("sin alertas"); }', ctx);
  const fallido = ctx.cargarDatos({});
  assert.equal(fallido.success, true);
  assert.equal(fallido.alertasAusencias, null);
  assert.equal(fallido.alertasAusenciasError, 'sin alertas');
  assert.equal(fallido.estadisticas.entidad, 'resumen');
});

test('getEstadisticas aplica permisos del motor', () => {
  const ctx = cargar({ success: true, rol: 'entrenador', jugador: null });
  assert.equal(JSON.stringify(ctx.getEstadisticas({}, { entidad: 'club' })),
    JSON.stringify({ success: false, error: 'Consulta de estadísticas no permitida.' }));
  const ok = ctx.getEstadisticas({}, { entidad: 'equipo', id: datos.equipos[0].ID });
  assert.equal(ok.success, true);
  assert.equal(ok.estadisticas.entidad, 'equipo');
  const lote = JSON.parse(JSON.stringify(ctx.getEstadisticasLote({}, [
    { entidad: 'equipo', id: datos.equipos[0].ID }, { entidad: 'club' }, { entidad: 'jugador', id: 'nadie' }])));
  assert.deepEqual(lote.resultados.map(r => r.success ? r.estadisticas.entidad : r.error),
    ['equipo', 'Consulta de estadísticas no permitida.', 'Jugador no encontrado.']);
  assert.deepEqual(lote.resultados[0].estadisticas, JSON.parse(JSON.stringify(ok.estadisticas)));
});
