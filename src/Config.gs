/**
 * Config.gs
 * Constantes globales de la aplicación CB Baeza — Gestión de Asistencia.
 */

const CONFIG = {
  // ── Tablas Supabase ──────────────────────────────────────────────────────────
  SHEETS: {
    TEMPORADAS:           'Temporadas',
    EQUIPOS:              'Equipos',
    HORARIOS:             'Horarios',
    JUGADORES:            'Jugadores',
    JUGADORES_EQUIPOS:    'Jugadores_Equipos',
    ENTRENADORES:         'Entrenadores',
    ENTRENADORES_EQUIPOS: 'Entrenadores_Equipos',
    SESIONES:             'Sesiones',
    ASIST_JUGADORES:      'Asist_Jugadores',
    ASIST_ENTRENADORES:   'Asist_Entrenadores',
    PROGRAMACIONES_JUSTIFICACIONES: 'Programaciones_Justificaciones',
    ADMINISTRADORES:      'Administradores',
  },

  // ── Roles de usuario ──────────────────────────────────────────────────────────
  ROLES: {
    ADMIN:      'admin',
    ENTRENADOR: 'entrenador',
    JUGADOR:    'jugador',
  },

  // ── Tipos de rol entrenador-equipo ────────────────────────────────────────────
  TIPOS_ROL_ENTRENADOR: {
    ENTRENADOR: 'Entrenador',  // aparece en sesiones, gestiona asistencia
    VISOR:      'Visor',       // solo ve el equipo en su dashboard
  },

  // ── Categorías válidas del club ───────────────────────────────────────────────
  CATEGORIAS: [
    'baybasket',
    'pre-minibasket',
    'minibasket',
    'infantil',
    'cadete',
    'junior',
    'senior',
  ],

  // ── Modalidades válidas ───────────────────────────────────────────────────────
  MODALIDADES: ['Masculino', 'Femenino', 'Mixto'],

  // ── Estados de asistencia de jugadores ───────────────────────────────────────
  ESTADOS_ASISTENCIA: {
    PRESENTE: 'P',
    AUSENTE:  'A',
    RETRASO:  'R',
  },

  // ── Tipos de relación jugador-equipo ─────────────────────────────────────────
  TIPOS_JUGADOR_EQUIPO: {
    PRINCIPAL:  'Principal',
    SECUNDARIO: 'Secundario',
  },

  // ── Motivos de justificación de ausencia/retraso ──────────────────────────────
  MOTIVOS_JUSTIFICACION: [
    'Estudios / Examen',
    'Estudios / Recuperación de materia',
    'Otra actividad deportiva',
    'Otra actividad extraescolar',
    'Lesión',
    'Enfermedad',
    'Motivo familiar/personal',
    'Otro',
  ],

  // ── Días de la semana ─────────────────────────────────────────────────────────
  DIAS_SEMANA: {
    1: 'Lunes',
    2: 'Martes',
    3: 'Miércoles',
    4: 'Jueves',
    5: 'Viernes',
    6: 'Sábado',
    7: 'Domingo',
  },
};

// El publicador fija estos valores solo en la copia de cada versión; nunca secretos.
// El código fuente sin preparar no puede conectarse a ninguna base de datos.
const SUPABASE_ENV = 'UNPUBLISHED';
const SUPABASE_EXPECTED_URL = '';
