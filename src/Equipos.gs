/**
 * Equipos.gs
 * Lógica de negocio para equipos, jugadores, entrenadores y horarios.
 * Todas las funciones son internas; se exponen al cliente a través de Code.gs.
 */

const Equipos = {

  // ══════════════════════════════════════════════════════════════════════════════
  // EQUIPOS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Crea un nuevo equipo en la temporada activa.
   * @param {{ Nombre: string, Categoria: string, Modalidad: string }} datos
   * @returns {Object} Equipo creado.
   */
  crearEquipo(datos) {
    if (!CONFIG.CATEGORIAS.includes(datos.Categoria)) {
      throw new Error(`Categoría inválida: ${datos.Categoria}`);
    }
    if (!CONFIG.MODALIDADES.includes(datos.Modalidad)) {
      throw new Error(`Modalidad inválida: ${datos.Modalidad}`);
    }
    const temporadas = getSheetData(CONFIG.SHEETS.TEMPORADAS);
    const activa = temporadas.find(t => t.Activa === true || t.Activa === 'TRUE');
    if (!activa) throw new Error('No hay ninguna temporada activa.');

    return appendRow(CONFIG.SHEETS.EQUIPOS, {
      Nombre:       datos.Nombre,
      Categoria:    datos.Categoria,
      Modalidad:    datos.Modalidad,
      ID_Temporada: activa.ID,
    });
  },

  /**
   * Actualiza los datos básicos de un equipo (nombre, categoría, modalidad).
   * @param {string} equipoId
   * @param {Object} datos
   * @returns {boolean}
   */
  actualizarEquipo(equipoId, datos) {
    const campos = {};
    if (datos.Nombre)    campos.Nombre    = datos.Nombre;
    if (datos.Categoria) campos.Categoria = datos.Categoria;
    if (datos.Modalidad) campos.Modalidad = datos.Modalidad;
    return updateRow(CONFIG.SHEETS.EQUIPOS, equipoId, campos);
  },

  /**
   * Elimina un equipo y en cascada todas sus sesiones, asistencias, horarios
   * y asignaciones de jugadores/entrenadores. No borra los jugadores ni entrenadores.
   * @param {string} equipoId
   * @returns {boolean}
   */
  eliminarEquipo(equipoId) {
    // Borrar asistencias de todas las sesiones del equipo
    const sesiones = findWhere(CONFIG.SHEETS.SESIONES, 'ID_Equipo', equipoId);
    sesiones.forEach(s => {
      deleteWhere(CONFIG.SHEETS.ASIST_JUGADORES,    'ID_Sesion', s.ID);
      deleteWhere(CONFIG.SHEETS.ASIST_ENTRENADORES, 'ID_Sesion', s.ID);
    });
    // Borrar sesiones, horarios y relaciones
    deleteWhere(CONFIG.SHEETS.SESIONES,             'ID_Equipo', equipoId);
    deleteWhere(CONFIG.SHEETS.HORARIOS,             'ID_Equipo', equipoId);
    deleteWhere(CONFIG.SHEETS.JUGADORES_EQUIPOS,    'ID_Equipo', equipoId);
    deleteWhere(CONFIG.SHEETS.ENTRENADORES_EQUIPOS, 'ID_Equipo', equipoId);
    return deleteRow(CONFIG.SHEETS.EQUIPOS, equipoId);
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // HORARIOS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Reemplaza el horario semanal completo de un equipo.
   * Elimina las filas anteriores e inserta las nuevas.
   * @param {string} equipoId
   * @param {{ DiaSemana: number, HoraInicio: string, HoraFin: string }[]} horarios
   * @returns {Object[]} Nuevos registros creados.
   */
  setHorariosEquipo(equipoId, horarios) {
    deleteWhere(CONFIG.SHEETS.HORARIOS, 'ID_Equipo', equipoId);
    return horarios.map(h => appendRow(CONFIG.SHEETS.HORARIOS, {
      ID_Equipo:  equipoId,
      DiaSemana:  Number(h.DiaSemana),
      HoraInicio: h.HoraInicio,
      HoraFin:    h.HoraFin,
    }));
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // JUGADORES
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Crea un nuevo jugador en el registro global.
   * Auto-genera Usuario, PIN y CodigoPadres si no se proporcionan.
   */
  crearJugador(datos) {
    if (!datos.Nombre || !datos.Apellidos) {
      throw new Error('Nombre y apellidos son obligatorios.');
    }

    // Auto-generar credenciales
    let usuario = datos.Usuario || Equipos._generarUsuario(datos.Nombre, datos.Apellidos);
    // Garantizar unicidad de usuario
    const jugadoresExistentes = getSheetData(CONFIG.SHEETS.JUGADORES);
    const usersExistentes     = jugadoresExistentes.map(j => String(j.Usuario || '').toLowerCase());
    let base = usuario; let suf = 2;
    while (usersExistentes.includes(usuario.toLowerCase())) { usuario = base + suf++; }

    const pin          = datos.PIN          || Equipos._generarPIN4();
    const codigoPadres = datos.CodigoPadres || Equipos._generarCodigoPadres();

    return appendRow(CONFIG.SHEETS.JUGADORES, {
      Nombre:        datos.Nombre,
      Apellidos:     datos.Apellidos,
      FechaNac:      datos.FechaNac      || '',
      Telefono:      datos.Telefono      || '',
      Email:         datos.Email         || '',
      FotoURL:       datos.FotoURL       || '',
      Dorsal:        datos.Dorsal        || '',
      Usuario:       usuario,
      PIN:           pin,
      CodigoPadres:  codigoPadres,
      EmailPadre1:   datos.EmailPadre1   || '',
      EmailPadre2:   datos.EmailPadre2   || '',
      NombrePadre1:  datos.NombrePadre1  || '',
      NombrePadre2:  datos.NombrePadre2  || '',
    });
  },

  _generarUsuario(nombre, apellidos) {
    const n = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    return n(nombre).charAt(0) + n(apellidos).replace(/\s+/g, '').substring(0, 10);
  },

  _generarPIN4() {
    return String(Math.floor(1000 + Math.random() * 9000));
  },

  _generarCodigoPadres() {
    return Utilities.getUuid().replace(/-/g, '').substring(0, 6).toUpperCase();
  },

  /**
   * Elimina un jugador y en cascada sus asistencias y asignaciones a equipos.
   * @param {string} jugadorId
   * @returns {boolean}
   */
  eliminarJugador(jugadorId) {
    deleteWhere(CONFIG.SHEETS.ASIST_JUGADORES,   'ID_Jugador', jugadorId);
    deleteWhere(CONFIG.SHEETS.JUGADORES_EQUIPOS, 'ID_Jugador', jugadorId);
    return deleteRow(CONFIG.SHEETS.JUGADORES, jugadorId);
  },

  /**
   * Actualiza los datos de un jugador (incluye campos de tutores).
   * La actualización de Usuario y PIN se hace por actualizarCredencialesJugador().
   */
  actualizarJugador(jugadorId, datos) {
    const campos = {};
    const permitidos = [
      'Nombre', 'Apellidos', 'FechaNac', 'Telefono', 'Email', 'FotoURL', 'Dorsal',
      'EmailPadre1', 'EmailPadre2', 'NombrePadre1', 'NombrePadre2',
      'TelefonoPadre1', 'TelefonoPadre2'
    ];
    permitidos.forEach(k => { if (datos[k] !== undefined) campos[k] = datos[k]; });
    return updateRow(CONFIG.SHEETS.JUGADORES, jugadorId, campos);
  },

  /**
   * Actualiza las credenciales de login de un jugador (Usuario y/o PIN).
   * El propio jugador puede actualizar las suyas; entrenadores/admins cualquiera.
   * @param {string} jugadorId
   * @param {string|null} nuevoUsuario
   * @param {string|null} nuevoPin
   * @returns {boolean}
   */
  actualizarCredencialesJugador(jugadorId, nuevoUsuario, nuevoPin, nuevoCodigoPadres) {
    const campos = {};
    if (nuevoUsuario) {
      nuevoUsuario = String(nuevoUsuario).trim().toLowerCase();
      if (nuevoUsuario.length < 3) throw new Error('El usuario debe tener al menos 3 caracteres.');
      // Verificar unicidad
      const jugadores = getSheetData(CONFIG.SHEETS.JUGADORES);
      const duplicado = jugadores.find(j => j.ID !== jugadorId && String(j.Usuario || '').toLowerCase() === nuevoUsuario);
      if (duplicado) throw new Error(`El usuario "${nuevoUsuario}" ya está en uso.`);
      campos.Usuario = nuevoUsuario;
    }
    if (nuevoPin) {
      const pin = String(nuevoPin).trim();
      if (!/^[0-9]{4,6}$/.test(pin)) throw new Error('El PIN debe tener entre 4 y 6 dígitos numéricos.');
      campos.PIN = pin;
    }
    if (nuevoCodigoPadres) {
      const cod = String(nuevoCodigoPadres).trim().toUpperCase();
      if (cod.length < 4) throw new Error('El código de familias debe tener al menos 4 caracteres.');
      campos.CodigoPadres = cod;
    }
    if (Object.keys(campos).length === 0) return false;
    return updateRow(CONFIG.SHEETS.JUGADORES, jugadorId, campos);
  },

  /**
   * Asigna un jugador a un equipo con el tipo indicado.
   * Si ya existe la relación (activa o inactiva), la reactiva y actualiza el tipo.
   * @param {string} jugadorId
   * @param {string} equipoId
   * @param {string} tipo - 'Principal' | 'Secundario'
   * @returns {Object}
   */
  asignarJugadorAEquipo(jugadorId, equipoId, tipo) {
    if (!Object.values(CONFIG.TIPOS_JUGADOR_EQUIPO).includes(tipo)) {
      throw new Error(`Tipo inválido: ${tipo}. Usa 'Principal' o 'Secundario'.`);
    }

    // Si se asigna como Principal, verificar que no tenga ya otro equipo principal activo
    if (tipo === CONFIG.TIPOS_JUGADOR_EQUIPO.PRINCIPAL) {
      const relacionesActivas = findWhere(CONFIG.SHEETS.JUGADORES_EQUIPOS, 'ID_Jugador', jugadorId)
        .filter(r => (r.Activo === true || r.Activo === 'TRUE') && r.Tipo === CONFIG.TIPOS_JUGADOR_EQUIPO.PRINCIPAL && r.ID_Equipo !== equipoId);
      if (relacionesActivas.length > 0) {
        throw new Error('El jugador ya tiene un equipo principal. Desasígnalo primero o cámbialo a Secundario.');
      }
    }

    // Comprobar si ya existe la relación (para reutilizarla)
    const existentes = findWhere(CONFIG.SHEETS.JUGADORES_EQUIPOS, 'ID_Jugador', jugadorId)
      .filter(r => r.ID_Equipo === equipoId);

    if (existentes.length > 0) {
      const actualizado = updateRow(CONFIG.SHEETS.JUGADORES_EQUIPOS, existentes[0].ID, { Activo: true, Tipo: tipo });
      if (!actualizado) throw new Error('No se pudo actualizar la asignación del jugador.');
      return { ...existentes[0], Activo: true, Tipo: tipo };
    }

    return appendRow(CONFIG.SHEETS.JUGADORES_EQUIPOS, {
      ID_Jugador: jugadorId,
      ID_Equipo:  equipoId,
      Tipo:       tipo,
      Activo:     true,
    });
  },

  /**
   * Desactiva la relación jugador-equipo (no borra el historial).
   * @param {string} jugadorId
   * @param {string} equipoId
   * @returns {boolean}
   */
  desasignarJugadorDeEquipo(jugadorId, equipoId) {
    const relaciones = findWhere(CONFIG.SHEETS.JUGADORES_EQUIPOS, 'ID_Jugador', jugadorId)
      .filter(r => r.ID_Equipo === equipoId);
    if (relaciones.length === 0) return true;
    return updateRow(CONFIG.SHEETS.JUGADORES_EQUIPOS, relaciones[0].ID, { Activo: false });
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // ENTRENADORES
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Crea un nuevo entrenador en el registro global.
   * @param {{ Nombre, Apellidos, Email, Telefono }} datos
   * @returns {Object} Entrenador creado.
   */
  crearEntrenador(datos) {
    if (!datos.Nombre || !datos.Apellidos || !datos.Email) {
      throw new Error('Nombre, apellidos y email son obligatorios.');
    }
    const existentes = findWhere(CONFIG.SHEETS.ENTRENADORES, 'Email', datos.Email);
    if (existentes.length > 0) {
      throw new Error(`Ya existe un entrenador con el email: ${datos.Email}`);
    }
    const pin = datos.PIN || '1234';
    return appendRow(CONFIG.SHEETS.ENTRENADORES, {
      Nombre:    datos.Nombre,
      Apellidos: datos.Apellidos,
      Email:     datos.Email,
      Telefono:  datos.Telefono || '',
      PIN:       pin,
      EsAdmin:   datos.EsAdmin === true || datos.EsAdmin === 'TRUE' ? true : false,
    });
  },

  /**
   * Elimina un entrenador y en cascada sus asistencias y asignaciones a equipos.
   * @param {string} entrenadorId
   * @returns {boolean}
   */
  eliminarEntrenador(entrenadorId) {
    deleteWhere(CONFIG.SHEETS.ASIST_ENTRENADORES,  'ID_Entrenador', entrenadorId);
    deleteWhere(CONFIG.SHEETS.ENTRENADORES_EQUIPOS,'ID_Entrenador', entrenadorId);
    return deleteRow(CONFIG.SHEETS.ENTRENADORES, entrenadorId);
  },

  /**
   * Actualiza los datos de un entrenador.
   * @param {string} entrenadorId
   * @param {Object} datos
   * @returns {boolean}
   */
  /**
   * Actualiza los datos de un entrenador.
   * El Email solo puede cambiarlo un administrador (guard en Code.gs).
   * Si se cambia el Email, la sesión activa del entrenador quedará invalidada.
   */
  actualizarEntrenador(entrenadorId, datos, permiteEmail) {
    const campos = {};
    const permitidos = ['Nombre', 'Apellidos', 'Telefono', 'PIN'];
    permitidos.forEach(k => { if (datos[k] !== undefined) campos[k] = datos[k]; });
    if (permiteEmail && datos.Email !== undefined) {
      // Verificar unicidad del nuevo email
      const existentes = findWhere(CONFIG.SHEETS.ENTRENADORES, 'Email', datos.Email);
      if (existentes.length > 0 && existentes[0].ID !== entrenadorId) {
        throw new Error(`El email "${datos.Email}" ya está en uso por otro entrenador.`);
      }
      campos.Email = datos.Email;
    }
    if (datos.EsAdmin !== undefined) {
      campos.EsAdmin = datos.EsAdmin === true || datos.EsAdmin === 'TRUE';
    }
    return updateRow(CONFIG.SHEETS.ENTRENADORES, entrenadorId, campos);
  },

  /**
   * Asigna un entrenador a un equipo. Si ya existe la relación la reactiva.
   * @param {string} entrenadorId
   * @param {string} equipoId
   * @returns {Object}
   */
  /**
   * Asigna un entrenador a un equipo con el rol indicado.
   * @param {string} entrenadorId
   * @param {string} equipoId
   * @param {string} [tipoRol='Entrenador'] - 'Entrenador' | 'Visor'
   */
  asignarEntrenadorAEquipo(entrenadorId, equipoId, tipoRol) {
    tipoRol = tipoRol || CONFIG.TIPOS_ROL_ENTRENADOR.ENTRENADOR;
    if (!Object.values(CONFIG.TIPOS_ROL_ENTRENADOR).includes(tipoRol)) {
      throw new Error(`TipoRol inválido: ${tipoRol}.`);
    }

    const existentes = findWhere(CONFIG.SHEETS.ENTRENADORES_EQUIPOS, 'ID_Entrenador', entrenadorId)
      .filter(r => r.ID_Equipo === equipoId);

    if (existentes.length > 0) {
      const actualizado = updateRow(CONFIG.SHEETS.ENTRENADORES_EQUIPOS, existentes[0].ID, { Activo: true, TipoRol: tipoRol });
      if (!actualizado) throw new Error('No se pudo actualizar la asignación del entrenador.');
      return { ...existentes[0], Activo: true, TipoRol: tipoRol };
    }

    return appendRow(CONFIG.SHEETS.ENTRENADORES_EQUIPOS, {
      ID_Entrenador: entrenadorId,
      ID_Equipo:     equipoId,
      Activo:        true,
      TipoRol:       tipoRol,
    });
  },

  /**
   * Desactiva la relación entrenador-equipo (no borra el historial).
   * @param {string} entrenadorId
   * @param {string} equipoId
   * @returns {boolean}
   */
  desasignarEntrenadorDeEquipo(entrenadorId, equipoId) {
    const relaciones = findWhere(CONFIG.SHEETS.ENTRENADORES_EQUIPOS, 'ID_Entrenador', entrenadorId)
      .filter(r => r.ID_Equipo === equipoId);
    if (relaciones.length === 0) return true;
    return updateRow(CONFIG.SHEETS.ENTRENADORES_EQUIPOS, relaciones[0].ID, { Activo: false });
  },
};
