const AHORA = '2026-10-27 21:00';

const datos = {
  temporadas: [
    { ID: 'temp-actual', Nombre: '2026-2027', FechaInicio: '2026-09-01', FechaFin: '2027-06-30', Activa: true },
    { ID: 'temp-anterior', Nombre: '2025-2026', FechaInicio: '2025-09-01', FechaFin: '2026-06-30', Activa: false },
  ],
  equipos: [
    { ID: 'equipo-cadete', Nombre: 'Cadete Baeza', Categoria: 'cadete', Modalidad: 'Mixto', ID_Temporada: 'temp-actual' },
    { ID: 'equipo-junior', Nombre: 'Junior Baeza', Categoria: 'junior', Modalidad: 'Femenino', ID_Temporada: 'temp-actual' },
    { ID: 'equipo-anterior', Nombre: 'Infantil 2025', Categoria: 'infantil', Modalidad: 'Mixto', ID_Temporada: 'temp-anterior' },
  ],
  horarios: [
    { ID: 'horario-cadete', ID_Equipo: 'equipo-cadete', DiaSemana: 1, HoraInicio: '18:00', HoraFin: '19:30' },
    { ID: 'horario-junior', ID_Equipo: 'equipo-junior', DiaSemana: 2, HoraInicio: '19:00', HoraFin: '20:30' },
  ],
  jugadores: [
    { ID: 'jugador-ana', Nombre: 'Ana', Apellidos: 'García Ruiz', EmailPadre1: 'familia.ana@example.test', NotificarAusenciasPadre1: true },
    { ID: 'jugador-bruno', Nombre: 'Bruno', Apellidos: 'Alba López', EmailPadre1: 'familia.bruno@example.test', NotificarAusenciasPadre1: false },
    { ID: 'jugador-celia', Nombre: 'Celia', Apellidos: 'Sánchez Díaz', EmailPadre2: 'familia.celia@example.test' },
    { ID: 'jugador-david', Nombre: 'David', Apellidos: 'Moreno Cruz' },
    { ID: 'jugador-elena', Nombre: 'Elena', Apellidos: 'López Pérez' },
    { ID: 'jugador-fatima', Nombre: 'Fátima', Apellidos: 'Martín Cano' },
    { ID: 'jugador-gonzalo', Nombre: 'Gonzalo', Apellidos: 'Torres Gil' },
    { ID: 'jugador-hugo', Nombre: 'Hugo', Apellidos: 'Navarro Ramos' },
  ],
  jugadoresEquipos: [],
  entrenadores: [
    { ID: 'entrenador-luis', Nombre: 'Luis', Apellidos: 'Pérez Soto', Email: 'luis@example.test' },
    { ID: 'entrenador-maria', Nombre: 'María', Apellidos: 'Ruiz Ortiz', Email: 'maria@example.test' },
    { ID: 'entrenador-pablo', Nombre: 'Pablo', Apellidos: 'Gil Cano', Email: 'pablo@example.test' },
  ],
  entrenadoresEquipos: [
    { ID: 're-luis', ID_Entrenador: 'entrenador-luis', ID_Equipo: 'equipo-cadete', Activo: true, TipoRol: 'Entrenador', FechaAlta: '2026-09-01' },
    { ID: 're-maria', ID_Entrenador: 'entrenador-maria', ID_Equipo: 'equipo-junior', Activo: true, TipoRol: 'Entrenador' },
  ],
  sesiones: [],
  asistJugadores: [],
  asistEntrenadores: [],
};

for (const jugador of datos.jugadores) {
  datos.jugadoresEquipos.push({ ID: 'rel-' + jugador.ID, ID_Jugador: jugador.ID,
    ID_Equipo: ['jugador-david', 'jugador-elena'].includes(jugador.ID) ? 'equipo-junior' : 'equipo-cadete',
    Tipo: 'Principal', Activo: true, FechaAlta: jugador.ID === 'jugador-fatima' ? '2026-10-20' : '2026-09-01' });
}
datos.jugadoresEquipos.push({ ID: 'rel-secundario', ID_Jugador: 'jugador-david', ID_Equipo: 'equipo-cadete', Tipo: 'Secundario', Activo: true });
datos.jugadoresEquipos.push({ ID: 'rel-antigua', ID_Jugador: 'jugador-hugo', ID_Equipo: 'equipo-junior', Tipo: 'Principal', Activo: false });

function sesion(id, fecha, cambios = {}) {
  return { ID: id, ID_Equipo: 'equipo-cadete', ID_Temporada: 'temp-actual', ID_Horario: 'horario-cadete',
    Fecha: fecha, HoraInicio: '18:00', HoraFin: '19:30', EsExtra: false, AsistenciaGuardada: true, Cancelada: false,
    FechaPrimerRegistro: fecha + ' 20:30', ...cambios };
}
for (const [i, fecha] of ['2026-09-07', '2026-09-14', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'].entries()) {
  datos.sesiones.push(sesion('s' + (i + 1), fecha, { EsExtra: i === 5 }));
}
datos.sesiones.push(
  sesion('cancelada', '2026-10-20', { AsistenciaGuardada: false, Cancelada: true, MotivoCancelacion: 'Climatología', FechaCancelacion: '2026-10-19 12:00', FechaPrimerRegistro: null }),
  sesion('pendiente', '2026-10-21', { AsistenciaGuardada: false, FechaPrimerRegistro: null }),
  sesion('futura', '2026-10-28', { AsistenciaGuardada: false, FechaPrimerRegistro: null }),
  sesion('hoy-sin-terminar', '2026-10-27', { HoraInicio: '20:00', HoraFin: '22:00' }),
  sesion('anterior', '2026-05-04', { ID_Equipo: 'equipo-anterior', ID_Temporada: 'temp-anterior' }),
  sesion('junior-1', '2026-10-20', { ID_Equipo: 'equipo-junior', ID_Horario: 'horario-junior', HoraInicio: '19:00', HoraFin: '20:30' }),
);
function asistencia(id, sesionId, estado, cambios = {}) {
  datos.asistJugadores.push({ ID: 'aj-' + id + '-' + sesionId, ID_Jugador: 'jugador-' + id, ID_Sesion: sesionId,
    Estado: estado, Excluido: false, EsInvitado: false, TieneJustificacion: false, ...cambios });
}
['P', 'P', 'R', 'A'].forEach((estado, i) => asistencia('ana', 's' + (i + 1), estado,
  i === 2 ? { MinutosRetraso: 15, TieneJustificacion: true, MotivoCategoria: 'Estudios / Examen', FechaJustificacion: '2026-10-05 16:00', JustificadoPor: 'familia' } :
  i === 3 ? { TieneJustificacion: true, MotivoCategoria: 'Lesión', JustificadoPor: 'programacion', FechaJustificacion: '2026-10-01 10:00' } : {}));
for (let i = 1; i <= 6; i++) {
  asistencia('bruno', 's' + i, 'P');
  asistencia('celia', 's' + i, i === 2 ? 'A' : 'P');
  asistencia('gonzalo', 's' + i, 'A');
}
asistencia('david', 's6', 'R', { MinutosRetraso: 10 });
asistencia('elena', 's6', 'P', { EsInvitado: true });
asistencia('fatima', 's6', 'P');
asistencia('david', 'junior-1', 'P');
asistencia('elena', 'junior-1', 'P');
asistencia('hugo', 's6', 'A', { Excluido: true });
asistencia('ana', 'futura', null, { TieneJustificacion: true, TipoJustificacion: 'Ausencia', MotivoCategoria: 'Motivo familiar/personal' });
for (const id of ['cancelada', 'pendiente', 'anterior', 'hoy-sin-terminar']) asistencia('ana', id, 'A');
for (const [i, asistio] of [true, true, false, null].entries()) {
  datos.asistEntrenadores.push({ ID: 'ae-luis-' + i, ID_Entrenador: 'entrenador-luis', ID_Sesion: 's' + (i + 1), Asistio: asistio, Excluido: false });
}
for (const id of ['s3', 's4']) datos.asistEntrenadores.push({ ID: 'ae-pablo-' + id, ID_Entrenador: 'entrenador-pablo', ID_Sesion: id, Asistio: true, EsInvitado: true });
datos.asistEntrenadores.push({ ID: 'ae-maria', ID_Entrenador: 'entrenador-maria', ID_Sesion: 'junior-1', Asistio: true });

module.exports = { datos, AHORA };

Object.assign(datos.jugadores.find(j => j.ID === 'jugador-ana'), { TelefonoPadre1: '600111222' });
Object.assign(datos.jugadores.find(j => j.ID === 'jugador-bruno'), { Email: 'bruno@example.test', Telefono: '600222333' });
Object.assign(datos.jugadores.find(j => j.ID === 'jugador-david'), { TelefonoPadre1: '600333444' });
Object.assign(datos.jugadores.find(j => j.ID === 'jugador-elena'), { Telefono: '600444555' });
Object.assign(datos.jugadores.find(j => j.ID === 'jugador-fatima'), { Email: 'fatima@example.test' });

Object.assign(datos.jugadores.find(j => j.ID === 'jugador-ana'), { FotoURL: 'avatar:canasta' });
Object.assign(datos.jugadores.find(j => j.ID === 'jugador-bruno'), { FotoURL: 'avatar:balon' });
Object.assign(datos.jugadores.find(j => j.ID === 'jugador-celia'), { FotoURL: 'avatar:camiseta' });
Object.assign(datos.jugadores.find(j => j.ID === 'jugador-hugo'), { FotoURL: 'avatar:balon' });
Object.assign(datos.entrenadores[0], { FotoURL: 'avatar:canasta' });
Object.assign(datos.entrenadores[1], { FotoURL: 'avatar:camiseta' });
