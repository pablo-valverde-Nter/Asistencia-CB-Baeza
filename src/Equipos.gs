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
   * Devuelve todos los equipos de la temporada activa.
   * @returns {Object[]}
   */
  getEquipos() {
    const temporadas = getSheetData(CONFIG.SHEETS.TEMPORADAS);
    const activa = temporadas.find(t => t.Activa === true || t.Activa === 'TRUE');
    if (!activa) return [];
    return findWhere(CONFIG.SHEETS.EQUIPOS, 'ID_Temporada', activa.ID);
  },

  /**
   * Devuelve un equipo por ID con sus horarios, jugadores y entrenadores.
   * @param {string} equipoId
   * @returns {Object}
   */
  getEquipoById(equipoId) {
    const equipo = findById(CONFIG.SHEETS.EQUIPOS, equipoId);
    if (!equipo) throw new Error(`Equipo no encontrado: ${equipoId}`);
    equipo.horarios     = Equipos.getHorariosByEquipo(equipoId);
    equipo.jugadores    = Equipos.getJugadoresByEquipo(equipoId);
    equipo.entrenadores = Equipos.getEntrenadoresByEquipo(equipoId);
    return equipo;
  },

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
   * Elimina un equipo y en cascada sus horarios y asignaciones de jugadores/entrenadores.
   * No borra las sesiones (quedan en el histórico).
   * @param {string} equipoId
   * @returns {boolean}
   */
  eliminarEquipo(equipoId) {
    deleteWhere(CONFIG.SHEETS.HORARIOS,             'ID_Equipo', equipoId);
    deleteWhere(CONFIG.SHEETS.JUGADORES_EQUIPOS,    'ID_Equipo', equipoId);
    deleteWhere(CONFIG.SHEETS.ENTRENADORES_EQUIPOS, 'ID_Equipo', equipoId);
    return deleteRow(CONFIG.SHEETS.EQUIPOS, equipoId);
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // HORARIOS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Devuelve el patrón de horario semanal de un equipo.
   * @param {string} equipoId
   * @returns {Object[]}
   */
  getHorariosByEquipo(equipoId) {
    return findWhere(CONFIG.SHEETS.HORARIOS, 'ID_Equipo', equipoId)
      .sort((a, b) => Number(a.DiaSemana) - Number(b.DiaSemana));
  },

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
   * Devuelve todos los jugadores del club (registro global).
   * @returns {Object[]}
   */
  getJugadores() {
    return getSheetData(CONFIG.SHEETS.JUGADORES);
  },

  /**
   * Devuelve los jugadores asignados a un equipo (principal o secundario),
   * enriquecidos con el tipo de relación.
   * @param {string} equipoId
   * @returns {Object[]}
   */
  getJugadoresByEquipo(equipoId) {
    const relaciones = findWhere(CONFIG.SHEETS.JUGADORES_EQUIPOS, 'ID_Equipo', equipoId)
      .filter(r => r.Activo === true || r.Activo === 'TRUE');

    const jugadoresIds = relaciones.map(r => r.ID_Jugador);
    const jugadores    = findWhereIn(CONFIG.SHEETS.JUGADORES, 'ID', jugadoresIds);

    // Combinar jugador + tipo de relación
    return jugadores.map(j => {
      const rel = relaciones.find(r => r.ID_Jugador === j.ID);
      return { ...j, Tipo: rel ? rel.Tipo : '' };
    }).sort((a, b) => {
      // Primero principales, luego secundarios; dentro de cada grupo, por apellidos
      if (a.Tipo !== b.Tipo) return a.Tipo === CONFIG.TIPOS_JUGADOR_EQUIPO.PRINCIPAL ? -1 : 1;
      return `${a.Apellidos} ${a.Nombre}`.localeCompare(`${b.Apellidos} ${b.Nombre}`);
    });
  },

  /**
   * Crea un nuevo jugador en el registro global.
   * @param {{ Nombre, Apellidos, FechaNac, Telefono, Email, FotoURL, Dorsal }} datos
   * @returns {Object} Jugador creado.
   */
  crearJugador(datos) {
    if (!datos.Nombre || !datos.Apellidos) {
      throw new Error('Nombre y apellidos son obligatorios.');
    }
    return appendRow(CONFIG.SHEETS.JUGADORES, {
      Nombre:    datos.Nombre,
      Apellidos: datos.Apellidos,
      FechaNac:  datos.FechaNac  || '',
      Telefono:  datos.Telefono  || '',
      Email:     datos.Email     || '',
      FotoURL:   datos.FotoURL   || '',
      Dorsal:    datos.Dorsal    || '',
    });
  },

  /**
   * Actualiza los datos de un jugador.
   * @param {string} jugadorId
   * @param {Object} datos
   * @returns {boolean}
   */
  actualizarJugador(jugadorId, datos) {
    const campos = {};
    const permitidos = ['Nombre', 'Apellidos', 'FechaNac', 'Telefono', 'Email', 'FotoURL', 'Dorsal'];
    permitidos.forEach(k => { if (datos[k] !== undefined) campos[k] = datos[k]; });
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
      updateRow(CONFIG.SHEETS.JUGADORES_EQUIPOS, existentes[0].ID, { Activo: true, Tipo: tipo });
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
    if (relaciones.length === 0) return false;
    return updateRow(CONFIG.SHEETS.JUGADORES_EQUIPOS, relaciones[0].ID, { Activo: false });
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // ENTRENADORES
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Devuelve todos los entrenadores del club.
   * @returns {Object[]}
   */
  getEntrenadores() {
    return getSheetData(CONFIG.SHEETS.ENTRENADORES);
  },

  /**
   * Devuelve los entrenadores asignados activamente a un equipo.
   * @param {string} equipoId
   * @returns {Object[]}
   */
  getEntrenadoresByEquipo(equipoId) {
    const relaciones = findWhere(CONFIG.SHEETS.ENTRENADORES_EQUIPOS, 'ID_Equipo', equipoId)
      .filter(r => r.Activo === true || r.Activo === 'TRUE');

    const entrenadorIds = relaciones.map(r => r.ID_Entrenador);
    return findWhereIn(CONFIG.SHEETS.ENTRENADORES, 'ID', entrenadorIds)
      .sort((a, b) => `${a.Apellidos} ${a.Nombre}`.localeCompare(`${b.Apellidos} ${b.Nombre}`));
  },

  /**
   * Crea un nuevo entrenador en el registro global.
   * @param {{ Nombre, Apellidos, Email, Telefono }} datos
   * @returns {Object} Entrenador creado.
   */
  crearEntrenador(datos) {
    if (!datos.Nombre || !datos.Apellidos || !datos.Email) {
      throw new Error('Nombre, apellidos y email son obligatorios.');
    }
    // Evitar emails duplicados
    const existentes = findWhere(CONFIG.SHEETS.ENTRENADORES, 'Email', datos.Email);
    if (existentes.length > 0) {
      throw new Error(`Ya existe un entrenador con el email: ${datos.Email}`);
    }
    return appendRow(CONFIG.SHEETS.ENTRENADORES, {
      Nombre:    datos.Nombre,
      Apellidos: datos.Apellidos,
      Email:     datos.Email,
      Telefono:  datos.Telefono || '',
    });
  },

  /**
   * Actualiza los datos de un entrenador.
   * @param {string} entrenadorId
   * @param {Object} datos
   * @returns {boolean}
   */
  actualizarEntrenador(entrenadorId, datos) {
    const campos = {};
    const permitidos = ['Nombre', 'Apellidos', 'Telefono'];
    // No permitir cambiar el Email (es la clave de autenticación)
    permitidos.forEach(k => { if (datos[k] !== undefined) campos[k] = datos[k]; });
    return updateRow(CONFIG.SHEETS.ENTRENADORES, entrenadorId, campos);
  },

  /**
   * Asigna un entrenador a un equipo. Si ya existe la relación la reactiva.
   * @param {string} entrenadorId
   * @param {string} equipoId
   * @returns {Object}
   */
  asignarEntrenadorAEquipo(entrenadorId, equipoId) {
    const existentes = findWhere(CONFIG.SHEETS.ENTRENADORES_EQUIPOS, 'ID_Entrenador', entrenadorId)
      .filter(r => r.ID_Equipo === equipoId);

    if (existentes.length > 0) {
      updateRow(CONFIG.SHEETS.ENTRENADORES_EQUIPOS, existentes[0].ID, { Activo: true });
      return { ...existentes[0], Activo: true };
    }

    return appendRow(CONFIG.SHEETS.ENTRENADORES_EQUIPOS, {
      ID_Entrenador: entrenadorId,
      ID_Equipo:     equipoId,
      Activo:        true,
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
    if (relaciones.length === 0) return false;
    return updateRow(CONFIG.SHEETS.ENTRENADORES_EQUIPOS, relaciones[0].ID, { Activo: false });
  },
};
