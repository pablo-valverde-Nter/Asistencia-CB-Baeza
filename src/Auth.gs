/**
 * Auth.gs
 * Control de acceso basado en Email y PIN para despliegue público (ExecuteAs: Me).
 * Autentica al usuario en base a las credenciales ('auth') enviadas desde el cliente.
 */

const Auth = {

  /**
   * Valida las credenciales enviadas desde el cliente.
   * @param {Object} auth - Objeto { email, pin }
   * @returns {{ success: boolean, error?: string }}
   */
  validate(auth) {
    if (!auth || !auth.email) {
      return { success: false, error: 'Inicia sesión para acceder al sistema.' };
    }
    const email = auth.email.toLowerCase().trim();
    const pin = String(auth.pin || '').trim();

    if (!email || !pin) {
      return { success: false, error: 'El email y el PIN son obligatorios.' };
    }

    // 1. Verificar si hay coincidencia en la hoja de Entrenadores
    const entrenadores = getSheetData(CONFIG.SHEETS.ENTRENADORES);
    const entrenador = entrenadores.find(e => String(e.Email || '').toLowerCase().trim() === email);

    if (entrenador) {
      const dbPin = String(entrenador.PIN || '').trim();
      if (dbPin === pin) {
        return { success: true };
      }
      return { success: false, error: 'El PIN de acceso es incorrecto.' };
    }

    // 2. Si es Administrador Principal y no está registrado en la hoja como entrenador,
    // se le permite el acceso utilizando el PIN Maestro de Config.gs.
    if (CONFIG.ADMIN_EMAILS.includes(email)) {
      const masterPin = String(CONFIG.ADMIN_MASTER_PIN || '0000').trim();
      if (masterPin === pin) {
        return { success: true };
      }
      return { success: false, error: 'El PIN maestro de administrador es incorrecto.' };
    }

    return { success: false, error: 'El correo electrónico no está registrado en el club.' };
  },

  /**
   * Devuelve el email del usuario validado o trigger de Apps Script.
   * @param {Object} [auth] - Objeto { email, pin }
   * @returns {string}
   */
  getCurrentUserEmail(auth) {
    if (auth && auth.email) {
      return auth.email.toLowerCase().trim();
    }
    // Fallback para ejecuciones internas de Apps Script (triggers / depuración editor)
    try {
      const eff = Session.getEffectiveUser().getEmail();
      if (eff) return eff;
    } catch (e) {}
    try {
      const act = Session.getActiveUser().getEmail();
      if (act) return act;
    } catch (e) {}
    return '';
  },

  /**
   * Comprueba si el usuario actual es administrador.
   * @param {Object} auth
   * @returns {boolean}
   */
  isAdmin(auth) {
    const email = Auth.getCurrentUserEmail(auth);
    return CONFIG.ADMIN_EMAILS.includes(email);
  },

  /**
   * Lanza un error si el usuario no es administrador.
   * @param {Object} auth
   */
  requireAdmin(auth) {
    const validacion = Auth.validate(auth);
    if (!validacion.success) {
      throw new Error(validacion.error);
    }
    if (!Auth.isAdmin(auth)) {
      throw new Error('Acción restringida a administradores.');
    }
  },

  /**
   * Devuelve el registro de Entrenadores que coincide con el email activo.
   * @param {Object} auth
   * @returns {Object|null}
   */
  getEntrenadorActual(auth) {
    const email = Auth.getCurrentUserEmail(auth);
    if (!email) return null;
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
   * @param {string} equipoId
   * @param {Object} auth
   * @returns {boolean}
   */
  tieneAccesoEquipo(equipoId, auth) {
    if (Auth.isAdmin(auth)) return true;
    const entrenador = Auth.getEntrenadorActual(auth);
    if (!entrenador) return false;
    const equipos = Auth.getEquiposAsignados(entrenador.ID);
    return equipos.includes(equipoId);
  },

  /**
   * Lanza un error si el usuario no tiene acceso al equipo indicado.
   * @param {string} equipoId
   * @param {Object} auth
   */
  requireAccesoEquipo(equipoId, auth) {
    const validacion = Auth.validate(auth);
    if (!validacion.success) {
      throw new Error(validacion.error);
    }
    if (!Auth.tieneAccesoEquipo(equipoId, auth)) {
      throw new Error('No tienes permiso para acceder a este equipo.');
    }
  },

  /**
   * Devuelve el contexto completo del usuario para la carga inicial de la SPA.
   * @param {Object} auth
   * @returns {{ success: boolean, esAdmin: boolean, entrenador: Object|null, equipos: Object[] }}
   */
  getContextoUsuario(auth) {
    const validacion = Auth.validate(auth);
    if (!validacion.success) {
      return { success: false, error: validacion.error };
    }

    const esAdmin   = Auth.isAdmin(auth);
    const entrenador = Auth.getEntrenadorActual(auth);

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
