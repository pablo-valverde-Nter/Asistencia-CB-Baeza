/**
 * Esquema de las tablas Supabase y lista permitida de campos por tabla.
 */
const SCHEMA = {
  Temporadas: [
    'ID', 'Nombre', 'FechaInicio', 'FechaFin', 'Activa'
  ],
  Equipos: [
    'ID', 'Nombre', 'Categoria', 'Modalidad', 'ID_Temporada'
  ],
  Horarios: [
    'ID', 'ID_Equipo', 'DiaSemana', 'HoraInicio', 'HoraFin'
  ],
  Jugadores: [
    'ID', 'Nombre', 'Apellidos', 'FechaNac', 'Telefono', 'Email', 'FotoURL', 'Dorsal',
    'Usuario', 'PIN', 'CodigoPadres', 'EmailPadre1', 'EmailPadre2', 'NombrePadre1', 'NombrePadre2'
  ],
  Jugadores_Equipos: [
    'ID', 'ID_Jugador', 'ID_Equipo', 'Tipo', 'Activo'
  ],
  Entrenadores: [
    'ID', 'Nombre', 'Apellidos', 'Email', 'Telefono', 'PIN', 'EsAdmin'
  ],
  Administradores: [
    'ID', 'Email', 'PIN', 'Activo'
  ],
  Entrenadores_Equipos: [
    'ID', 'ID_Entrenador', 'ID_Equipo', 'Activo', 'TipoRol'
  ],
  Sesiones: [
    'ID', 'ID_Equipo', 'ID_Temporada', 'Fecha', 'HoraInicio', 'HoraFin', 'EsExtra', 'Notas', 'AsistenciaGuardada'
  ],
  Asist_Jugadores: [
    'ID', 'ID_Sesion', 'ID_Jugador', 'Estado', 'EsInvitado', 'FechaRegistro',
    'TieneJustificacion', 'TipoJustificacion', 'MotivoCategoria', 'MotivoDetalle',
    'FechaJustificacion', 'JustificadoPor', 'MensajeGenerado', 'NotificadoEntrenador'
  ],
  Asist_Entrenadores: [
    'ID', 'ID_Sesion', 'ID_Entrenador', 'Asistio', 'EsInvitado', 'FechaRegistro'
  ],
};