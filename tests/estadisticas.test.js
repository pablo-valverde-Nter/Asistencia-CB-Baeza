const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { datos, AHORA } = require('./fixtures/estadisticas-fixture');
const contexto = vm.createContext({});
for (const file of ['Config.gs', 'Estadisticas.gs']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), contexto);
const motor = vm.runInContext('Estadisticas', contexto);
const copia = () => structuredClone(datos);
function consultar(entidad, id, cambios = {}, filas = datos, rol = 'admin', jugadorId = 'jugador-bruno') {
  return JSON.parse(JSON.stringify(motor.consultar(filas, { entidad, id, ...cambios }, { rol, jugadorId }, AHORA)));
}

test('P=2, R=1 y A=1 dan 75/67; justificar no convierte A en presencia', () => {
  const j = consultar('jugador', 'jugador-ana').datos;
  assert.deepEqual(j.conteo, { P: 2, A: 1, R: 1, base: 4, justificadasA: 1, justificadasR: 1, injustificadasA: 0 });
  assert.equal(j.asistenciaPct, 75);
  assert.equal(j.puntualidadPct, 67);
  assert.equal(j.retrasoMedioMin, 15);
  assert.equal(j.retrasosConMinutos, 1);
  assert.deepEqual(j.avisos, { total: 2, previos: 1, programadas: 1, antelacionMedianaHoras: 2 });
  assert.deepEqual(j.motivos, [{ motivo: 'Estudios / Examen', A: 0, R: 1 }, { motivo: 'Lesión', A: 1, R: 0 }]);
  assert.equal(j.carga.horasAsistidas, 4.5);
  assert.equal(j.sesiones.length, 4);
  assert.equal(j.sesiones[0].estado, 'A');
});

test('solo computan sesiones terminadas guardadas de la temporada y estados explícitos no excluidos', () => {
  const j = consultar('jugador', 'jugador-ana').datos;
  assert.equal(j.conteo.base, 4);
  assert.equal(consultar('jugador', 'jugador-hugo').datos.conteo.base, 0);
  const e = consultar('equipo', 'equipo-cadete').datos;
  assert.equal(e.sesiones.computables, 6);
  assert.equal(e.sesiones.canceladas, 1);
  assert.equal(e.sesiones.pendientes, 1);
  assert.equal(e.sesiones.extra, 1);
  assert.equal(e.sesiones.horasProgramadas, 9);
  assert.deepEqual(e.pendientesLista.map(s => s.sesionId), ['pendiente']);
  const f = copia();
  f.asistJugadores.push({ ID_Sesion: 's5', ID_Jugador: 'jugador-ana', Estado: null, TieneJustificacion: true });
  f.asistJugadores.push({ ID_Sesion: 's6', ID_Jugador: 'jugador-ana', Estado: 'R', Excluido: 'TRUE' });
  assert.equal(consultar('jugador', 'jugador-ana', {}, f).datos.conteo.base, 4);
  f.asistJugadores.push({ ID_Sesion: 's5', ID_Jugador: 'jugador-ana', Estado: ' p ' });
  assert.equal(consultar('jugador', 'jugador-ana', {}, f).datos.conteo.P, 3);
});

test('rachas ignoran preavisos, mejor racha y porcentajes sin base', () => {
  const b = consultar('jugador', 'jugador-bruno').datos;
  assert.equal(b.rachaActual, 6);
  assert.equal(b.mejorRacha, 6);
  const c = consultar('jugador', 'jugador-celia').datos;
  assert.equal(c.rachaActual, 4);
  assert.equal(c.mejorRacha, 4);
  const a = consultar('jugador', 'jugador-ana').datos;
  assert.equal(a.rachaActual, 0);
  assert.equal(a.mejorRacha, 3);
  const h = consultar('jugador', 'jugador-hugo').datos;
  assert.equal(h.asistenciaPct, null);
  assert.equal(h.puntualidadPct, null);
  assert.equal(h.retrasoMedioMin, null);
});

test('altas, bajas e historial antiguo determinan la plantilla sin inventar pertenencias', () => {
  const f = copia();
  f.temporadas[0].FechaFin = '2026-10-19';
  const e = consultar('equipo', 'equipo-cadete', {}, f).datos;
  assert.ok(!e.jugadores.some(j => j.id === 'jugador-fatima'));
  assert.equal(e.plantillaActiva, 6);
  assert.ok(!('sinRegistro' in e) || !JSON.stringify(e.sinRegistro).includes('jugador-fatima'));
  assert.ok(!consultar('equipo', 'equipo-junior').datos.jugadores.some(j => j.id === 'jugador-hugo'));
  f.jugadoresEquipos.push({ ID_Jugador: 'jugador-fatima', ID_Equipo: 'equipo-cadete', Tipo: 'Principal', Activo: false, FechaAlta: '2026-09-01', FechaBaja: '2026-09-15' });
  const historial = consultar('equipo', 'equipo-cadete', {}, f).datos;
  assert.ok(historial.jugadores.some(j => j.id === 'jugador-fatima'));
  assert.equal(historial.plantillaActiva, 6);
});

test('rol jugador fuerza propio e impide datos privados en ranking y pocas sesiones', () => {
  const r = consultar('equipo', 'equipo-junior', {}, datos, 'jugador');
  assert.equal(r.entidad, 'propio');
  assert.equal(r.datos.jugador.id, 'jugador-bruno');
  assert.ok(!('alertas' in r.datos.jugador));
  assert.deepEqual(r.datos.equipo.ranking.map(j => j.nombre), ['Bruno', 'Celia', 'Gonzalo']);
  assert.deepEqual(r.datos.equipo.pocasSesiones.map(j => j.nombre), ['Ana', 'Fátima', 'David', 'Hugo']);
  assert.equal(r.datos.equipo.posicion, 1);
  assert.equal(r.datos.equipo.total, 3);
  assert.ok(r.datos.equipo.ranking[0].logros.includes('mejorRacha'));
  assert.ok(r.datos.equipo.ranking[0].logros.includes('perfecta'));
  const json = JSON.stringify([r.datos.equipo.ranking, r.datos.equipo.pocasSesiones]);
  for (const j of datos.jugadores) assert.ok(!json.includes(j.ID));
  for (const campo of ['P', 'A', 'R', 'Motivo', 'alertas', 'id', 'base']) assert.ok(!json.includes('"' + campo + '"'));
});

test('ranking resuelve empates por base y apellidos sin exponer esos datos', () => {
  const f = copia();
  f.asistJugadores = f.asistJugadores.filter(r => !(r.ID_Jugador === 'jugador-celia' && r.Estado === 'A'));
  let ranking = consultar('propio', null, {}, f, 'jugador').datos.equipo.ranking;
  assert.deepEqual(ranking.slice(0, 2).map(j => j.nombre), ['Bruno', 'Celia']);
  f.asistJugadores.push({ ID_Sesion: 's2', ID_Jugador: 'jugador-celia', Estado: 'P' });
  f.jugadores.find(j => j.ID === 'jugador-celia').Apellidos = 'Abad';
  ranking = consultar('propio', null, {}, f, 'jugador').datos.equipo.ranking;
  assert.equal(ranking[0].nombre, 'Celia');
});

test('permisos y errores exactos de entidades y temporadas', () => {
  assert.throws(() => consultar('club', null, {}, datos, 'entrenador'), { message: 'Consulta de estadísticas no permitida.' });
  for (const [entidad, mensaje] of [['equipo', 'Equipo no encontrado.'], ['jugador', 'Jugador no encontrado.'], ['entrenador', 'Entrenador no encontrado.']]) {
    assert.throws(() => consultar(entidad, 'inexistente'), { message: mensaje });
  }
  assert.throws(() => consultar('resumen', null, { temporadaId: 'inexistente' }), { message: 'Temporada no encontrada.' });
});

test('entrenadores ignoran Asistio null y cuentan sustituciones y coberturas', () => {
  const l = consultar('entrenador', 'entrenador-luis').datos;
  assert.equal(l.sesiones, 3);
  assert.equal(l.presentes, 2);
  assert.equal(l.presenciaPct, 67);
  assert.equal(l.horasDirigidas, 3);
  assert.equal(l.coberturasRecibidas, 2);
  const p = consultar('entrenador', 'entrenador-pablo').datos;
  assert.equal(p.sustitucionesDadas, 2);
  assert.equal(p.horasDirigidas, 3);
  assert.equal(p.presenciaPct, 100);
  const e = consultar('equipo', 'equipo-cadete').datos;
  assert.equal(e.cobertura.conEntrenadorPct, 33);
  assert.equal(e.cobertura.sustitutoPct, 33);
});

test('normalización de filtros, temporada inactiva, 4 semanas y mes local', () => {
  const anterior = consultar('resumen', null, { temporadaId: 'temp-anterior', periodo: '4s' });
  assert.equal(anterior.filtro.periodo, 'temporada');
  assert.deepEqual(anterior.filtro.periodos, ['temporada']);
  assert.equal(anterior.filtro.hasta, '2026-06-30');
  assert.equal(anterior.datos.equipos['equipo-anterior'].sesiones, 1);
  const recientes = consultar('jugador', 'jugador-ana', { periodo: '4s' });
  assert.equal(recientes.filtro.desde, '2026-09-30');
  assert.equal(recientes.datos.conteo.base, 2);
  assert.equal(recientes.datos.tendenciaPp, null);
  assert.equal(consultar('resumen', null, { periodo: 'mes' }).filtro.desde, '2026-10-01');
  const f = copia();
  for (const t of f.temporadas) t.Activa = false;
  assert.equal(consultar('resumen', null, {}, f).filtro.temporadaId, 'temp-actual');
  f.temporadas = [];
  const vacio = consultar('resumen', null, {}, f);
  assert.equal(vacio.filtro.temporadaId, null);
  assert.deepEqual(vacio.datos.equipos, {});
  assert.equal(vacio.datos.club.asistenciaPct, null);
});

test('tendencia, alertas y umbrales de logros usan los últimos 28 días', () => {
  const c = consultar('jugador', 'jugador-celia').datos;
  assert.equal(c.tendenciaPp, 17);
  const g = consultar('jugador', 'jugador-gonzalo').datos;
  assert.deepEqual(g.alertas, ['seguidas', 'injustificadas']);
  const f = copia();
  for (const r of f.asistJugadores) if (r.ID_Jugador === 'jugador-bruno' && ['s3', 's4', 's5', 's6'].includes(r.ID_Sesion)) r.Estado = 'A';
  const b = consultar('jugador', 'jugador-bruno', {}, f).datos;
  assert.equal(b.tendenciaPp, -33);
  assert.deepEqual(b.alertas, ['seguidas', 'caida', 'injustificadas']);
});

test('detalle de equipo: distribución, refuerzos, registro y tipos', () => {
  const e = consultar('equipo', 'equipo-cadete').datos;
  assert.deepEqual(e.distribucion, { alta: 1, media: 1, baja: 1, pocasSesiones: 3 });
  assert.equal(e.latenciaMedianaHoras, 1);
  assert.deepEqual(e.cancelaciones, [{ motivo: 'Climatología', n: 1 }]);
  assert.equal(e.jugadores.find(j => j.id === 'jugador-david').tipo, 'Secundario');
  assert.equal(e.jugadores.find(j => j.id === 'jugador-elena').tipo, 'Invitado');
  assert.equal(e.refuerzosPct, 12);
  assert.equal(e.justificacionPct, 20);
  assert.equal(e.antelacionMedianaHoras, 2);
  assert.equal(e.serieSemanal[0].semana, '2026-09-07');
  assert.equal(e.porDia[0].dia, 1);
});

test('club y resumen mantienen contratos, contactabilidad y privacidad por rol', () => {
  const club = consultar('club').datos;
  assert.equal(club.sesiones, 7);
  assert.equal(club.canceladas, 1);
  assert.equal(club.pendientes, 1);
  assert.equal(club.horasProgramadas, 10.5);
  assert.equal(club.serieMensual.reduce((n, m) => n + m.base, 0), club.serieSemanal.reduce((n, s) => n + s.base, 0));
  assert.ok(club.serieMensual.every(m => m.P + m.A + m.R === m.base));
  assert.equal(club.equipos.length, 2);
  assert.deepEqual(club.contactabilidad, { jugadoresActivos: 8, conEmailFamiliar: 3, conAvisosActivos: 2 });
  assert.ok(!('alertas' in club) && !('jugadoresConAlerta' in club));
  assert.equal(club.porCategoria.length, 2);
  const resumen = consultar('resumen').datos;
  assert.equal(resumen.jugadores['jugador-ana'].base, 4);
  assert.equal(resumen.entrenadores['entrenador-pablo'].sustitucionesDadas, 2);
  assert.deepEqual(resumen.club, Object.fromEntries(Object.keys(resumen.club).map(k => [k, club[k]])));
  assert.ok(!('club' in consultar('resumen', null, {}, datos, 'entrenador').datos));
});

test('booleanos TRUE, HoraFin ausente, latencias negativas y motivos desconocidos', () => {
  const f = copia();
  f.sesiones.push({ ID: 'sin-hora', ID_Equipo: 'equipo-cadete', ID_Temporada: 'temp-actual', Fecha: '2026-10-26', AsistenciaGuardada: 'TRUE', FechaPrimerRegistro: '2026-10-26 15:00' });
  f.sesiones.push({ ID: 'hoy-sin-hora', ID_Equipo: 'equipo-cadete', ID_Temporada: 'temp-actual', Fecha: '2026-10-27', AsistenciaGuardada: 'TRUE' });
  f.asistJugadores.push({ ID_Sesion: 'sin-hora', ID_Jugador: 'jugador-ana', Estado: 'A', TieneJustificacion: 'TRUE' });
  const j = consultar('jugador', 'jugador-ana', {}, f).datos;
  assert.equal(j.conteo.base, 5);
  assert.ok(j.motivos.some(m => m.motivo === 'Sin motivo'));
  const e = consultar('equipo', 'equipo-cadete', {}, f).datos;
  assert.equal(e.sesiones.computables, 7);
  assert.equal(e.latenciaMedianaHoras, 1);
});

test('el motor no muta filas ni consultas y limita las sesiones de detalle', () => {
  const f = copia();
  const antes = JSON.stringify(f);
  consultar('club', null, {}, f);
  consultar('propio', null, {}, f, 'jugador');
  assert.equal(JSON.stringify(f), antes);
  for (let i = 0; i < 70; i++) {
    f.sesiones.push({ ...f.sesiones[0], ID: 'extra-' + i });
    f.asistJugadores.push({ ID_Sesion: 'extra-' + i, ID_Jugador: 'jugador-bruno', Estado: 'P' });
  }
  assert.equal(consultar('jugador', 'jugador-bruno', {}, f).datos.sesiones.length, 60);
});

test('las alertas de un jugador cruzan sus equipos', () => {
  const f = copia();
  f.asistJugadores = f.asistJugadores.filter(r => r.ID_Jugador !== 'jugador-david');
  for (const [sesionId, fecha, equipoId] of [
    ['doble-1', '2026-10-23', 'equipo-cadete'],
    ['doble-2', '2026-10-24', 'equipo-junior'],
    ['doble-3', '2026-10-25', 'equipo-cadete'],
  ]) {
    f.sesiones.push({ ...f.sesiones[0], ID: sesionId, Fecha: fecha, ID_Equipo: equipoId });
    f.asistJugadores.push({ ID_Sesion: sesionId, ID_Jugador: 'jugador-david', Estado: 'A', TieneJustificacion: true });
  }
  const resumen = consultar('resumen', null, {}, f).datos;
  assert.deepEqual(Array.from(resumen.jugadores['jugador-david'].alertas), ['seguidas']);
});

test('alerta de injustificadas cruza el mes dentro de la ventana móvil de 28 días', () => {
  const f = copia();
  f.asistJugadores = [];
  f.asistEntrenadores = [];
  f.sesiones = [];
  for (const [i, fecha] of ['2026-09-01', '2026-09-20', '2026-09-30', '2026-10-02'].entries()) {
    const id = 'ventana-' + i;
    f.sesiones.push({ ID: id, ID_Equipo: 'equipo-cadete', ID_Temporada: 'temp-actual', Fecha: fecha,
      HoraInicio: '18:00', HoraFin: '19:30', AsistenciaGuardada: true });
    f.asistJugadores.push({ ID_Sesion: id, ID_Jugador: 'jugador-ana', Estado: 'A' });
  }
  const ahora = '2026-10-03 21:00';
  const resultado = motor.consultar(f, { entidad: 'jugador', id: 'jugador-ana', periodo: 'mes' }, { rol: 'admin' }, ahora);
  assert.equal(resultado.datos.conteo.base, 1);
  assert.equal(resultado.datos.tendenciaPp, null);
  assert.deepEqual(Array.from(resultado.datos.alertas), ['injustificadas']);
  const equipo = motor.consultar(f, { entidad: 'equipo', id: 'equipo-cadete', periodo: 'mes' }, { rol: 'admin' }, ahora);
  assert.deepEqual(Array.from(equipo.datos.jugadores.find(j => j.id === 'jugador-ana').alertas), ['injustificadas']);
  f.asistJugadores[1].Excluido = true;
  const sinUmbral = motor.consultar(f, { entidad: 'jugador', id: 'jugador-ana', periodo: 'mes' }, { rol: 'admin' }, ahora);
  assert.deepEqual(Array.from(sinUmbral.datos.alertas), []);
});

test('índices de canceladas y pendientes conservan sus totales por equipo', () => {
  const f = copia();
  f.sesiones.push({ ...f.sesiones.find(s => s.ID === 'pendiente'), ID: 'junior-pendiente', ID_Equipo: 'equipo-junior' });
  f.sesiones.push({ ...f.sesiones.find(s => s.ID === 'cancelada'), ID: 'junior-cancelada', ID_Equipo: 'equipo-junior' });
  const resumen = consultar('resumen', null, {}, f).datos;
  assert.equal(resumen.club.canceladas, 2);
  assert.equal(resumen.club.pendientes, 2);
  for (const id of ['equipo-cadete', 'equipo-junior']) {
    assert.equal(resumen.equipos[id].canceladas, 1);
    assert.equal(resumen.equipos[id].pendientes, 1);
  }
  const entrenador = consultar('entrenador', 'entrenador-maria', {}, f).datos;
  assert.equal(entrenador.porEquipo[0].pendientes, 1);
});
