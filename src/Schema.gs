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
    'Usuario', 'PIN', 'CodigoPadres', 'EmailPadre1', 'EmailPadre2', 'NombrePadre1', 'ApellidosPadre1', 'NombrePadre2', 'ApellidosPadre2',
    'NombrePadre1Original', 'NombrePadre2Original',
    'TelefonoPadre1', 'TelefonoPadre2',
    'NotificarAusenciasPadre1', 'NotificarAusenciasPadre2', 'BienvenidaVista'
  ],
  Jugadores_Equipos: [
    'ID', 'ID_Jugador', 'ID_Equipo', 'Tipo', 'Activo', 'FechaAlta', 'FechaBaja'
  ],
  Entrenadores: [
    'ID', 'Nombre', 'Apellidos', 'Email', 'Telefono', 'FotoURL', 'PIN', 'EsAdmin'
  ],
  Administradores: [
    'ID', 'Email', 'PIN', 'Activo'
  ],
  Entrenadores_Equipos: [
    'ID', 'ID_Entrenador', 'ID_Equipo', 'Activo', 'TipoRol', 'FechaAlta', 'FechaBaja'
  ],
  Sesiones: [
    'ID', 'ID_Equipo', 'ID_Temporada', 'ID_Horario', 'Fecha', 'HoraInicio', 'HoraFin', 'EsExtra', 'Notas', 'AsistenciaGuardada',
    'Cancelada', 'MotivoCancelacion', 'FechaCancelacion', 'FechaPrimerRegistro'
  ],
  Asist_Jugadores: [
    'ID', 'ID_Sesion', 'ID_Jugador', 'Estado', 'EsInvitado', 'Excluido', 'FechaRegistro',
    'TieneJustificacion', 'TipoJustificacion', 'MotivoCategoria', 'MotivoDetalle',
    'FechaJustificacion', 'JustificadoPor', 'MensajeGenerado', 'NotificadoEntrenador', 'EsProgramada', 'MinutosRetraso'
  ],
  Asist_Entrenadores: [
    'ID', 'ID_Sesion', 'ID_Entrenador', 'Asistio', 'EsInvitado', 'Excluido', 'FechaRegistro'
  ],
  Programaciones_Justificaciones: [
    'ID', 'ID_Jugador', 'ID_Equipo', 'ID_Horario', 'TipoIncidencia', 'MotivoCategoria',
    'MotivoDetalle', 'HoraIncorporacion', 'Activo', 'FechaCreacion', 'FechaActualizacion'
  ],
};