const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { datos, AHORA } = require('./fixtures/estadisticas-fixture');
const contexto = vm.createContext({});
for (const file of ['Config.gs', 'Estadisticas.gs']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), contexto);
const motor = vm.runInContext('Estadisticas', contexto);

const alertas = (filas, ctx = { rol: 'admin' }) => JSON.parse(JSON.stringify(motor.alertasAusencias(filas, ctx, AHORA)));
const jugador = (r, id) => r.jugadores.find(j => j.jugadorId === id);

// Ana (cadete) con una sesión por día de octubre; `estados` va de la más antigua a la más reciente.
function escenario(estados, cambios = {}) {
  const f = structuredClone(datos);
  f.sesiones = f.sesiones.filter(s => s.ID === 'anterior');
  f.asistJugadores = [];
  estados.forEach((estado, i) => {
    const id = 'e' + (i + 1);
    const fecha = '2026-10-' + String(i + 1).padStart(2, '0');
    f.sesiones.push({ ID: id, ID_Equipo: 'equipo-cadete', ID_Temporada: 'temp-actual', Fecha: fecha, HoraInicio: '18:00', HoraFin: '19:30',
      AsistenciaGuardada: true, Cancelada: false, ...(cambios[id] && cambios[id].sesion) });
    if (estado !== undefined) f.asistJugadores.push({ ID: 'aj-' + id, ID_Sesion: id, ID_Jugador: 'jugador-ana', Estado: estado,
      Excluido: false, EsInvitado: false, TieneJustificacion: false, ...(cambios[id] && cambios[id].fila) });
  });
  return f;
}

test('la fixture solo avisa de Gonzalo con su racha completa', () => {
  const r = alertas(datos);
  assert.equal(r.umbral, 3);
  assert.equal(r.temporadaId, 'temp-actual');
  assert.deepEqual(r.equipos, ['equipo-cadete', 'equipo-junior']);
  assert.deepEqual(r.jugadores, [{ jugadorId: 'jugador-gonzalo', equipos: ['equipo-cadete'], ausencias: 6, desde: '2026-09-07',
    ultimaAusencia: '2026-10-26', ultimaAsistencia: null, justificadas: 0, clave: 'jugador-gonzalo:s1' }]);
});

test('2 faltas no avisan, 3 sí; una P o R reciente corta la racha', () => {
  assert.equal(jugador(alertas(escenario(['P', 'A', 'A'])), 'jugador-ana'), undefined);
  const ana = jugador(alertas(escenario(['P', 'A', 'A', 'A'])), 'jugador-ana');
  assert.deepEqual([ana.ausencias, ana.desde, ana.ultimaAusencia, ana.ultimaAsistencia, ana.clave],
    [3, '2026-10-02', '2026-10-04', '2026-10-01', 'jugador-ana:e2']);
  assert.equal(jugador(alertas(escenario(['A', 'A', 'A', 'R'])), 'jugador-ana'), undefined);
  assert.equal(jugador(alertas(escenario(['A', 'A', 'A', 'P', 'A'])), 'jugador-ana'), undefined);
});

test('canceladas, sin guardar, sin terminar, excluidas, preavisos y casillas sin marcar ni cuentan ni cortan', () => {
  const f = escenario(['A', 'P', 'P', 'P', 'P', null, undefined, 'A', 'A'], {
    e2: { sesion: { Cancelada: true, AsistenciaGuardada: false } },
    e3: { sesion: { AsistenciaGuardada: false } },
    e4: { fila: { Excluido: true } },
    e6: { fila: { TieneJustificacion: true } },
  });
  // Sesión de hoy aún sin terminar con una P que tampoco corta.
  f.sesiones.push({ ID: 'hoy', ID_Equipo: 'equipo-cadete', ID_Temporada: 'temp-actual', Fecha: '2026-10-27', HoraInicio: '20:00', HoraFin: '22:00', AsistenciaGuardada: true });
  f.asistJugadores.push({ ID_Sesion: 'hoy', ID_Jugador: 'jugador-ana', Estado: 'P' });
  f.asistJugadores.find(r => r.ID_Sesion === 'e5').Estado = ' a ';
  const ana = jugador(alertas(f), 'jugador-ana');
  assert.deepEqual([ana.ausencias, ana.desde, ana.ultimaAsistencia], [4, '2026-10-01', null]);
});

test('las justificadas cuentan y se informan', () => {
  const ana = jugador(alertas(escenario(['A', 'A', 'A'], { e1: { fila: { TieneJustificacion: true } }, e3: { fila: { TieneJustificacion: 'TRUE' } } })), 'jugador-ana');
  assert.deepEqual([ana.ausencias, ana.justificadas], [3, 2]);
});

test('una falta como invitado se ignora y una presencia como invitado corta', () => {
  const invitada = (estado, f) => {
    f.sesiones.push({ ID: 'inv', ID_Equipo: 'equipo-junior', ID_Temporada: 'temp-actual', Fecha: '2026-10-10', HoraInicio: '19:00', HoraFin: '20:30', AsistenciaGuardada: true });
    f.asistJugadores.push({ ID_Sesion: 'inv', ID_Jugador: 'jugador-ana', Estado: estado, EsInvitado: true });
    return f;
  };
  assert.equal(jugador(alertas(invitada('A', escenario(['P', 'A', 'A']))), 'jugador-ana'), undefined);
  const ana = jugador(alertas(invitada('A', escenario(['A', 'A', 'A']))), 'jugador-ana');
  assert.deepEqual([ana.ausencias, ana.ultimaAusencia, ana.equipos], [3, '2026-10-03', ['equipo-cadete']]);
  const cortada = invitada('P', escenario(['A', 'A', 'A']));
  cortada.sesiones.push({ ID: 'tarde', ID_Equipo: 'equipo-cadete', ID_Temporada: 'temp-actual', Fecha: '2026-10-11', HoraInicio: '18:00', HoraFin: '19:30', AsistenciaGuardada: true });
  cortada.asistJugadores.push({ ID_Sesion: 'tarde', ID_Jugador: 'jugador-ana', Estado: 'A' });
  assert.equal(jugador(alertas(cortada), 'jugador-ana'), undefined);
});

test('la línea de tiempo cruza equipos y la alerta aparece en todos los equipos vigentes', () => {
  const f = structuredClone(datos);
  f.asistJugadores = f.asistJugadores.filter(r => r.ID_Jugador !== 'jugador-david');
  const sesiones = [['d1', '2026-10-23', 'equipo-cadete'], ['d2', '2026-10-24', 'equipo-junior'], ['d3', '2026-10-25', 'equipo-cadete']];
  for (const [id, fecha, equipo] of sesiones) {
    f.sesiones.push({ ID: id, ID_Equipo: equipo, ID_Temporada: 'temp-actual', Fecha: fecha, HoraInicio: '18:00', HoraFin: '19:30', AsistenciaGuardada: true });
    f.asistJugadores.push({ ID_Sesion: id, ID_Jugador: 'jugador-david', Estado: 'A' });
  }
  const david = jugador(alertas(f), 'jugador-david');
  assert.deepEqual([david.ausencias, david.equipos], [3, ['equipo-cadete', 'equipo-junior']]);
  const resumen = motor.consultar(f, { entidad: 'resumen' }, { rol: 'admin' }, AHORA).datos;
  assert.ok(Array.from(resumen.jugadores['jugador-david'].alertas).includes('seguidas'));
  f.asistJugadores.find(r => r.ID_Sesion === 'd2').Estado = 'P';
  assert.equal(jugador(alertas(f), 'jugador-david'), undefined);
});

test('solo la temporada activa y sin temporada activa no hay lista', () => {
  const f = escenario(['A', 'A']);
  for (const id of ['old1', 'old2']) {
    f.sesiones.push({ ID: id, ID_Equipo: 'equipo-anterior', ID_Temporada: 'temp-anterior', Fecha: '2026-05-0' + id.slice(-1), HoraInicio: '18:00', HoraFin: '19:30', AsistenciaGuardada: true });
    f.asistJugadores.push({ ID_Sesion: id, ID_Jugador: 'jugador-ana', Estado: 'A' });
  }
  assert.equal(jugador(alertas(f), 'jugador-ana'), undefined);
  const sinActiva = structuredClone(datos);
  sinActiva.temporadas.forEach(t => { t.Activa = false; });
  assert.deepEqual(alertas(sinActiva), { umbral: 3, temporadaId: null, equipos: [], jugadores: [] });
});

test('mientras la temporada siga activa cuentan las sesiones posteriores a su FechaFin', () => {
  const f = escenario(['P', 'A', 'A', 'A']);
  f.temporadas[0].FechaFin = '2026-09-30';
  assert.equal(jugador(alertas(f), 'jugador-ana').ausencias, 3);
});

test('permisos: entrenador solo sus equipos de gestión; Visor y jugador nada; las bajas no salen', () => {
  assert.equal(alertas(datos, { rol: 'entrenador', equiposGestion: ['equipo-cadete'] }).jugadores.length, 1);
  const junior = alertas(datos, { rol: 'entrenador', equiposGestion: ['equipo-junior'] });
  assert.deepEqual([junior.equipos, junior.jugadores], [['equipo-junior'], []]);
  assert.deepEqual(alertas(datos, { rol: 'entrenador', equiposGestion: [] }).equipos, []);
  assert.deepEqual(alertas(datos, { rol: 'jugador', jugadorId: 'jugador-gonzalo' }).jugadores, []);
  const baja = structuredClone(datos);
  Object.assign(baja.jugadoresEquipos.find(r => r.ID_Jugador === 'jugador-gonzalo'), { Activo: false, FechaBaja: '2026-10-26' });
  assert.deepEqual(alertas(baja).jugadores, []);
});

test('el umbral sale de CONFIG y coincide con la alerta seguidas de las estadísticas', () => {
  vm.runInContext('CONFIG.ESTADISTICAS.AUSENCIAS_SEGUIDAS = 2', contexto);
  try {
    const f = escenario(['P', 'A', 'A']);
    const r = alertas(f);
    assert.equal(r.umbral, 2);
    assert.equal(jugador(r, 'jugador-ana').ausencias, 2);
    const detalle = motor.consultar(f, { entidad: 'jugador', id: 'jugador-ana' }, { rol: 'admin' }, AHORA).datos;
    assert.ok(Array.from(detalle.alertas).includes('seguidas'));
  } finally {
    vm.runInContext('CONFIG.ESTADISTICAS.AUSENCIAS_SEGUIDAS = 3', contexto);
  }
});
