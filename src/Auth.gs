/**
 * Auth.gs
 * Control de acceso basado en el email de Google del usuario activo.
 * Usa Session.getActiveUser().getEmail() — no requiere auth externa.
 */

const Auth = {

  /**
   * Devuelve el email del usuario que ha iniciado sesión en Google.
   * @returns {string}
   */
  getCurrentUserEmail() {
    const email = Session.getActiveUser().getEmail();
    if (!email) throw new Error('No se pudo obtener el email del usuario. Asegúrate de haber iniciado sesión con Google.');
    return email;
  },

  /**
   * Comprueba si el usuario actual es administrador.
   * @returns {boolean}
   */
  isAdmin() {
    const email = Auth.getCurrentUserEmail();
    return CONFIG.ADMIN_EMAILS.includes(email);
  },

  /**
   * Lanza un error si el usuario no es administrador.
   */
  requireAdmin() {
    if (!Auth.isAdmin()) {
      throw new Error('Acción restringida a administradores.');
    }
  },

  /**
   * Devuelve el registro de Entrenadores que coincide con el email activo.
   * @returns {Object|null}
   */
  getEntrenadorActual() {
    const email = Auth.getCurrentUserEmail();
    const coincidencias = findWhere(CONFIG.SHEETS.ENTRENADORES, 'Email', email);
    return coincidencias.length > 0 ? coincidencias[0] : null;
  },

  /**
   * Devuelve los IDs de equipo asignados permanentemente al entrenador actual.
   * @param {string} entrenadorId
   * @returns {string[]}
   */
  getEquiposAsignados(entrenadorId) {
    return findWhere(CONFIG.SHEETS.ENTRENADORES_EQUIPOS, 'ID_Entrenador', entrenadorId)
      .filter(r => r.Activo === true || r.Activo === 'TRUE')
      .map(r => r.ID_Equipo);
  },

  /**
   * Comprueba si el usuario actual tiene acceso a un equipo concreto.
   * El acceso se concede si:
   *   a) es administrador, o
   *   b) tiene el equipo asignado en Entrenadores_Equipos.
   * @param {string} equipoId
   * @returns {boolean}
   */
  tieneAccesoEquipo(equipoId) {
    if (Auth.isAdmin()) return true;
    const entrenador = Auth.getEntrenadorActual();
    if (!entrenador) return false;
    const equipos = Auth.getEquiposAsignados(entrenador.ID);
    return equipos.includes(equipoId);
  },

  /**
   * Lanza un error si el usuario no tiene acceso al equipo indicado.
   * @param {string} equipoId
   */
  requireAccesoEquipo(equipoId) {
    if (!Auth.tieneAccesoEquipo(equipoId)) {
      throw new Error('No tienes permiso para acceder a este equipo.');
    }
  },

  /**
   * Devuelve el contexto completo del usuario para la carga inicial de la SPA.
   * @returns {{ success: boolean, esAdmin: boolean, entrenador: Object|null, equipos: Object[] }}
   */
  getContextoUsuario() {
    const esAdmin   = Auth.isAdmin();
    const entrenador = Auth.getEntrenadorActual();

    let equipos = [];

    if (esAdmin) {
      // El admin ve todos los equipos de la temporada activa
      const temporadas  = getSheetData(CONFIG.SHEETS.TEMPORADAS);
      const activa      = temporadas.find(t => t.Activa === true || t.Activa === 'TRUE');
      if (activa) {
        equipos = findWhere(CONFIG.SHEETS.EQUIPOS, 'ID_Temporada', activa.ID);
      }
    } else if (entrenador) {
      // El entrenador ve solo sus equipos asignados
      const equipoIds = Auth.getEquiposAsignados(entrenador.ID);
      equipos = findWhereIn(CONFIG.SHEETS.EQUIPOS, 'ID', equipoIds);
    }

    return {
      success:     true,
      esAdmin:     esAdmin,
      entrenador:  entrenador,
      equipos:     equipos,
    };
  },
};
