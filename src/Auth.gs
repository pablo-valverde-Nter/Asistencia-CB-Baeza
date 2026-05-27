/**
 * Auth.gs
 * Control de acceso con 4 roles: admin, entrenador, jugador.
 * Los padres acceden con las credenciales del jugador + CodigoPadres para justificaciones.
 *
 * auth = { tipo: 'entrenador'|'jugador', email?, usuario?, pin }
 */

const Auth = {

  // ══════════════════════════════════════════════════════════════════════════════
  // VALIDACIÓN Y AUTENTICACIÓN
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Valida las credenciales. Acepta entrenadores (email+pin) y jugadores (usuario+pin).
   * @param {Object} auth - { tipo, email?, usuario?, pin }
   * @returns {{ success: boolean, error?: string }}
   */
  validate(auth) {
    if (!auth) return { success: false, error: 'Sesión no iniciada. Inicia sesión.' };

    const tipo = String(auth.tipo || 'entrenador').toLowerCase();
    const pin  = String(auth.pin || '').trim();

    if (tipo === 'jugador') {
      const usuario = String(auth.usuario || '').toLowerCase().trim();
      if (!usuario || !pin) return { success: false, error: 'Usuario y PIN son obligatorios.' };

      const jugadores = getSheetData(CONFIG.SHEETS.JUGADORES);
      const jugador   = jugadores.find(j => String(j.Usuario || '').toLowerCase().trim() === usuario);
      if (!jugador) return { success: false, error: 'Usuario no encontrado.' };
      if (String(jugador.PIN || '').trim() !== pin) return { success: false, error: 'PIN incorrecto.' };
      return { success: true };
    }

    // tipo === 'entrenador' (incluye admin)
    const email = String(auth.email || '').toLowerCase().trim();
    if (!email || !pin) return { success: false, error: 'Email y PIN son obligatorios.' };

    const entrenadores = getSheetData(CONFIG.SHEETS.ENTRENADORES);
    const entrenador   = entrenadores.find(e => String(e.Email || '').toLowerCase().trim() === email);

    if (entrenador) {
      if (String(entrenador.PIN || '').trim() !== pin) return { success: false, error: 'El PIN de acceso es incorrecto.' };
      return { success: true };
    }

    // Admin estático sin fila en Entrenadores
    if (CONFIG.ADMIN_EMAILS.includes(email)) {
      if (String(CONFIG.ADMIN_MASTER_PIN).trim() !== pin) return { success: false, error: 'PIN maestro incorrecto.' };
      return { success: true };
    }

    return { success: false, error: 'El correo electrónico no está registrado en el club.' };
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // IDENTIDAD
  // ══════════════════════════════════════════════════════════════════════════════

  /** Devuelve el rol del usuario autenticado: 'admin' | 'entrenador' | 'jugador' */
  getRol(auth) {
    if (!auth) return null;
    const tipo = String(auth.tipo || 'entrenador').toLowerCase();
    if (tipo === 'jugador') return CONFIG.ROLES.JUGADOR;

    const email = String(auth.email || '').toLowerCase().trim();
    if (CONFIG.ADMIN_EMAILS.includes(email)) return CONFIG.ROLES.ADMIN;

    const entrenadores = getSheetData(CONFIG.SHEETS.ENTRENADORES);
    const ent = entrenadores.find(e => String(e.Email || '').toLowerCase().trim() === email);
    if (ent && (ent.EsAdmin === true || ent.EsAdmin === 'TRUE')) return CONFIG.ROLES.ADMIN;
    if (ent) return CONFIG.ROLES.ENTRENADOR;

    return CONFIG.ROLES.ENTRENADOR; // admin estático sin fila → ya se detecta arriba
  },

  /** Devuelve el registro de Entrenadores del usuario o null si es jugador. */
  getEntrenadorActual(auth) {
    const tipo = String(auth && auth.tipo || 'entrenador').toLowerCase();
    if (tipo === 'jugador') return null;
    const email = String(auth.email || '').toLowerCase().trim();
    const rows  = findWhere(CONFIG.SHEETS.ENTRENADORES, 'Email', email);
    return rows.length > 0 ? rows[0] : null;
  },

  /** Devuelve el registro de Jugadores del usuario autenticado como jugador o null. */
  getJugadorActual(auth) {
    if (!auth || String(auth.tipo || '').toLowerCase() !== 'jugador') return null;
    const usuario = String(auth.usuario || '').toLowerCase().trim();
    const jugadores = getSheetData(CONFIG.SHEETS.JUGADORES);
    return jugadores.find(j => String(j.Usuario || '').toLowerCase().trim() === usuario) || null;
  },

  isAdmin(auth) { return Auth.getRol(auth) === CONFIG.ROLES.ADMIN; },
  isEntrenador(auth) {
    const rol = Auth.getRol(auth);
    return rol === CONFIG.ROLES.ADMIN || rol === CONFIG.ROLES.ENTRENADOR;
  },
  isJugador(auth) { return Auth.getRol(auth) === CONFIG.ROLES.JUGADOR; },

  // ══════════════════════════════════════════════════════════════════════════════
  // GUARDS (lanzan Error si no se cumple el requisito)
  // ══════════════════════════════════════════════════════════════════════════════

  requireAdmin(auth) {
    const v = Auth.validate(auth);
    if (!v.success)          throw new Error(v.error);
    if (!Auth.isAdmin(auth)) throw new Error('Acción restringida a administradores.');
  },

  requireEntrenadorOAdmin(auth) {
    const v = Auth.validate(auth);
    if (!v.success)              throw new Error(v.error);
    if (!Auth.isEntrenador(auth)) throw new Error('Acción restringida a entrenadores y administradores.');
  },

  /**
   * Requiere que el usuario sea entrenador (rol Entrenador, no Visor) del equipo,
   * o administrador.
   */
  requireAccesoGestionEquipo(equipoId, auth) {
    const v = Auth.validate(auth);
    if (!v.success) throw new Error(v.error);
    if (Auth.isAdmin(auth)) return;

    const ent = Auth.getEntrenadorActual(auth);
    if (!ent) throw new Error('No tienes permiso para gestionar este equipo.');

    const rel = findWhere(CONFIG.SHEETS.ENTRENADORES_EQUIPOS, 'ID_Entrenador', ent.ID)
      .find(r => r.ID_Equipo === equipoId && (r.Activo === true || r.Activo === 'TRUE'));

    if (!rel || rel.TipoRol === CONFIG.TIPOS_ROL_ENTRENADOR.VISOR) {
      throw new Error('No tienes permiso para gestionar este equipo (rol Visor).');
    }
  },

  /**
   * Acceso de solo lectura: entrenador (Entrenador o Visor), admin o jugador autenticado.
   */
  requireAccesoLecturaEquipo(equipoId, auth) {
    const v = Auth.validate(auth);
    if (!v.success) throw new Error(v.error);
    if (Auth.isAdmin(auth) || Auth.isJugador(auth)) return;

    const ent = Auth.getEntrenadorActual(auth);
    if (!ent) throw new Error('No tienes acceso a este equipo.');

    const rel = findWhere(CONFIG.SHEETS.ENTRENADORES_EQUIPOS, 'ID_Entrenador', ent.ID)
      .find(r => r.ID_Equipo === equipoId && (r.Activo === true || r.Activo === 'TRUE'));
    if (!rel) throw new Error('No tienes acceso a este equipo.');
  },

  /**
   * Verifica el CodigoPadres de un jugador para autorizar justificaciones.
   * @param {string} jugadorId
   * @param {string} codigo
   * @returns {boolean}
   */
  verificarCodigoPadres(jugadorId, codigo) {
    const jugador = findById(CONFIG.SHEETS.JUGADORES, jugadorId);
    if (!jugador) return false;
    return String(jugador.CodigoPadres || '').trim().toUpperCase() === String(codigo || '').trim().toUpperCase();
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // CONTEXTO INICIAL
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Devuelve el contexto completo del usuario validado.
   * Incluye rol, entidad (entrenador o jugador), y equipos visibles.
   */
  getContextoUsuario(auth) {
    const validacion = Auth.validate(auth);
    if (!validacion.success) return { success: false, error: validacion.error };

    const rol = Auth.getRol(auth);

    // ── Jugador ───────────────────────────────────────────────────────────────
    if (rol === CONFIG.ROLES.JUGADOR) {
      const jugador = Auth.getJugadorActual(auth);
      if (!jugador) return { success: false, error: 'Jugador no encontrado.' };

      // Equipo principal del jugador
      const relPrincipal = findWhere(CONFIG.SHEETS.JUGADORES_EQUIPOS, 'ID_Jugador', jugador.ID)
        .find(r => r.Tipo === CONFIG.TIPOS_JUGADOR_EQUIPO.PRINCIPAL && (r.Activo === true || r.Activo === 'TRUE'));

      const equipoPrincipal = relPrincipal
        ? findById(CONFIG.SHEETS.EQUIPOS, relPrincipal.ID_Equipo)
        : null;

      // No exponer datos sensibles al rol jugador
      const jugadorSeguro = Auth._sanitizarJugadorParaRolJugador(jugador);

      return {
        success:          true,
        rol:              CONFIG.ROLES.JUGADOR,
        esAdmin:          false,
        jugador:          jugadorSeguro,
        equipoPrincipal:  equipoPrincipal || null,
        entrenador:       null,
        equipos:          [],
        equiposVisor:     [],
      };
    }

    // ── Entrenador / Admin ────────────────────────────────────────────────────
    const esAdmin    = rol === CONFIG.ROLES.ADMIN;
    const entrenador = Auth.getEntrenadorActual(auth);

    let equipos      = []; // equipos de gestión (TipoRol=Entrenador)
    let equiposVisor = []; // equipos solo visibles

    const temporadas = getSheetData(CONFIG.SHEETS.TEMPORADAS);
    const activa     = temporadas.find(t => t.Activa === true || t.Activa === 'TRUE');

    if (esAdmin) {
      equipos = activa ? findWhere(CONFIG.SHEETS.EQUIPOS, 'ID_Temporada', activa.ID) : [];
    } else if (entrenador) {
      const relaciones = findWhere(CONFIG.SHEETS.ENTRENADORES_EQUIPOS, 'ID_Entrenador', entrenador.ID)
        .filter(r => r.Activo === true || r.Activo === 'TRUE');

      const idsEntrenador = relaciones
        .filter(r => r.TipoRol !== CONFIG.TIPOS_ROL_ENTRENADOR.VISOR)
        .map(r => r.ID_Equipo);

      const idsVisor = relaciones
        .filter(r => r.TipoRol === CONFIG.TIPOS_ROL_ENTRENADOR.VISOR)
        .map(r => r.ID_Equipo);

      equipos      = findWhereIn(CONFIG.SHEETS.EQUIPOS, 'ID', idsEntrenador);
      equiposVisor = findWhereIn(CONFIG.SHEETS.EQUIPOS, 'ID', idsVisor);
    }

    return {
      success:      true,
      rol:          rol,
      esAdmin:      esAdmin,
      entrenador:   entrenador || null,
      jugador:      null,
      equipos:      equipos,
      equiposVisor: equiposVisor,
    };
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // HELPERS INTERNOS
  // ══════════════════════════════════════════════════════════════════════════════

  /** Elimina campos sensibles del objeto jugador cuando lo recibe el propio jugador */
  _sanitizarJugadorParaRolJugador(jugador) {
    const seguro = Object.assign({}, jugador);
    // El jugador sí puede ver su propio usuario y PIN (para cambiarlos)
    // pero NO el CodigoPadres (es para los padres, opaco al jugador)
    delete seguro.CodigoPadres;
    return seguro;
  },

  /** Sanitiza una lista de jugadores para que el rol jugador no vea datos de otros */
  sanitizarJugadoresParaRolJugador(jugadores, jugadorPropio) {
    return jugadores.map(j => {
      if (j.ID === jugadorPropio) {
        // El propio jugador ve todo excepto CodigoPadres
        const s = Object.assign({}, j);
        delete s.CodigoPadres;
        return s;
      }
      // Otros jugadores: solo datos públicos
      return {
        ID:        j.ID,
        Nombre:    j.Nombre,
        Apellidos: j.Apellidos,
        FotoURL:   j.FotoURL   || '',
        Dorsal:    j.Dorsal    || '',
      };
    });
  },
};

