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
  },

  // ── Control de acceso ─────────────────────────────────────────────────────────
  // Emails con permisos de administrador (fuente estática; también se lee EsAdmin en Entrenadores)
  ADMIN_EMAILS: [
    'pablo.valverde@nter.es',
    'vnpablo2002@gmail.com',
  ],

  // PIN maestro para admins que NO estén dados de alta como entrenadores
  ADMIN_MASTER_PIN: '0000',

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

// Entorno incluido en cada versión publicada; no almacenar secretos aquí.
// Cambiar a 'PRO' solo antes de crear la versión que se publicará en producción.
const SUPABASE_ENV = 'DEV';
