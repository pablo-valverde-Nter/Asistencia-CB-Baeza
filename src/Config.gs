/**
 * Config.gs
 * Constantes globales de la aplicación CB Baeza — Gestión de Asistencia.
 * IMPORTANTE: Actualizar SPREADSHEET_ID tras crear el Google Spreadsheet.
 */

const CONFIG = {
  // ── Base de datos ────────────────────────────────────────────────────────────
  // Sustituir por el ID real del Spreadsheet tras crearlo en Google Drive
  SPREADSHEET_ID: '1wUUb0wpeYqMjJui5Qbs5OIDJdY8tMQxLXoFuO2jcoFc',

  // ── Nombres de hojas (deben coincidir exactamente con las pestañas del Sheet) ─
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
  // Emails con permisos de administrador completo
  ADMIN_EMAILS: [
    'pablo.valverde@nter.es',
    'vnpablo2002@gmail.com',  
  ],

  // PIN maestro para administradores en caso de que no estén en la hoja de Entrenadores
  ADMIN_MASTER_PIN: '0000',

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
