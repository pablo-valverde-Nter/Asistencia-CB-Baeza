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
   * Sincroniza el horario semanal de un equipo sin recrear lo que no cambia: los ID de Horarios
   * los referencian Programaciones_Justificaciones (ON DELETE CASCADE) y Sesiones.
   * - Mismo día y horas → se conserva sin escribir.
   * - Mismo día con otras horas (un único horario ese día antes y después) → updateRow con el mismo ID.
   * - Lo demás se inserta o se borra.
   * Las programaciones de ausencia de un horario que se quita o cambia de hora se eliminan
   * (`_programacionesAfectadas_`): la regla era para esa hora. Con alguna activa falla sin escribir nada
   * salvo `opciones.forzar` (el entrenador lo confirmó tras `previsualizarCambioHorarios`); las pausadas se
   * eliminan siempre. Cada programación eliminada retira sus justificaciones de sesiones no empezadas
   * (`Asistencia._retirarProgramacion_`) y deja un aviso al jugador en Avisos_Jugador.
   * @param {string} equipoId
   * @param {{ DiaSemana: number, HoraInicio: string, HoraFin: string }[]} horarios
   * @param {{ forzar?: boolean }} [opciones]
   * @returns {Object[]} Horarios finales del equipo (con ID), en el orden de `horarios`.
   */
  setHorariosEquipo(equipoId, horarios, opciones) {
    const plan = Equipos._planHorarios_(findWhere(CONFIG.SHEETS.HORARIOS, 'ID_Equipo', equipoId), horarios);
    const afectadas = Equipos._programacionesAfectadas_(plan);
    if (!(opciones && opciones.forzar)) {
      const bloqueos = plan.quitar.map(h => ({ horario: h, cambio: 'quitado' }))
        .concat(plan.actualizar.map(({ existente }) => ({ horario: existente, cambio: 'hora' })))
        .map(({ horario, cambio }) => {
          const n = afectadas.filter(a => a.horario === horario && Equipos._programacionActiva_(a.programacion)).length;
          if (!n) return '';
          return `No se puede ${cambio === 'hora' ? 'cambiar la hora' : 'quitar el horario'} del ` +
            `${Equipos._DIAS_SEMANA_[Number(horario.DiaSemana)] || 'día ' + horario.DiaSemana} ` +
            `${horario.HoraInicio}-${horario.HoraFin}: tiene ${n} ${n === 1 ? 'programación de ausencia activa' : 'programaciones de ausencia activas'}.`;
        }).filter(Boolean);
      if (bloqueos.length) throw new Error(`${bloqueos.join(' ')} Bórralas o edítalas antes.`);
    }

    // Antes de tocar Horarios: _retirarProgramacion_ empareja las sesiones antiguas por día y horas.
    const equipo = afectadas.length ? findById(CONFIG.SHEETS.EQUIPOS, equipoId) : null;
    afectadas.forEach(({ programacion, horario }) => {
      if (Asistencia._retirarProgramacion_(programacion)) Equipos._avisarProgramacionQuitada_(programacion, horario, equipo);
    });
    plan.quitar.forEach(h => deleteRow(CONFIG.SHEETS.HORARIOS, h.ID));
    const finales = plan.finales.slice();
    plan.actualizar.forEach(({ i, existente }) => {
      const cambios = { HoraInicio: plan.deseados[i].HoraInicio, HoraFin: plan.deseados[i].HoraFin };
      updateRow(CONFIG.SHEETS.HORARIOS, existente.ID, cambios);
      finales[i] = { ...existente, ...cambios };
    });
    return plan.deseados.map((h, i) => finales[i] || appendRow(CONFIG.SHEETS.HORARIOS, { ID_Equipo: equipoId, ...h }));
  },

  /**
   * Solo lectura: programaciones que eliminaría `setHorariosEquipo(equipoId, horarios)`, para que el entrenador
   * las confirme. Ordenadas por día, hora y jugador.
   * @returns {{ ID: string, ID_Jugador: string, Jugador: string, ID_Horario: string, DiaSemana: number,
   *   HoraInicio: string, HoraFin: string, Cambio: 'quitado'|'hora', Activo: boolean }[]}
   */
  previsualizarCambioHorarios(equipoId, horarios) {
    const plan = Equipos._planHorarios_(findWhere(CONFIG.SHEETS.HORARIOS, 'ID_Equipo', equipoId), horarios);
    return Equipos._programacionesAfectadas_(plan).map(({ programacion, horario, cambio }) => {
      const jugador = findById(CONFIG.SHEETS.JUGADORES, programacion.ID_Jugador);
      return {
        ID: programacion.ID, ID_Jugador: programacion.ID_Jugador,
        Jugador: jugador ? `${jugador.Nombre || ''} ${jugador.Apellidos || ''}`.trim() : '',
        ID_Horario: horario.ID, DiaSemana: Number(horario.DiaSemana), HoraInicio: horario.HoraInicio, HoraFin: horario.HoraFin,
        Cambio: cambio, Activo: Equipos._programacionActiva_(programacion),
      };
    }).sort((a, b) => a.DiaSemana - b.DiaSemana || String(a.HoraInicio).localeCompare(String(b.HoraInicio)) ||
      a.Jugador.localeCompare(b.Jugador, 'es'));
  },

  /**
   * Plan puro del guardado del horario (sin lecturas ni escrituras); lo comparten setHorariosEquipo y la vista previa.
   * @param {Object[]} existentes Filas actuales de Horarios del equipo.
   * @param {{ DiaSemana: number, HoraInicio: string, HoraFin: string }[]} horarios Horario deseado.
   * @returns {{ deseados: Object[], finales: (Object|null)[], actualizar: { i: number, existente: Object }[], quitar: Object[] }}
   *   `finales[i]`: fila existente idéntica a `deseados[i]` (o null); `actualizar`: mismo día con otras horas;
   *   `quitar`: filas que desaparecen.
   */
  _planHorarios_(existentes, horarios) {
    const deseados = (horarios || []).map(h => ({ DiaSemana: Number(h.DiaSemana), HoraInicio: h.HoraInicio, HoraFin: h.HoraFin }));
    const libres = (existentes || []).slice();
    const delDia = (lista, dia) => lista.filter(h => Number(h.DiaSemana) === dia);

    const finales = deseados.map(h => {
      const i = libres.findIndex(e => Number(e.DiaSemana) === h.DiaSemana && e.HoraInicio === h.HoraInicio && e.HoraFin === h.HoraFin);
      return i < 0 ? null : libres.splice(i, 1)[0];
    });
    const pendientes = deseados.filter((h, i) => !finales[i]);
    const actualizar = [];
    deseados.forEach((h, i) => {
      if (finales[i]) return;
      const candidatos = delDia(libres, h.DiaSemana);
      if (candidatos.length === 1 && delDia(pendientes, h.DiaSemana).length === 1) actualizar.push({ i, existente: candidatos[0] });
    });
    actualizar.forEach(({ existente }) => libres.splice(libres.indexOf(existente), 1));
    return { deseados, finales, actualizar, quitar: libres };
  },

  // Programaciones (activas y pausadas) de los horarios que el plan quita o cambia de hora.
  _programacionesAfectadas_(plan) {
    return plan.quitar.map(h => ({ horario: h, cambio: 'quitado' }))
      .concat(plan.actualizar.map(({ existente }) => ({ horario: existente, cambio: 'hora' })))
      .flatMap(({ horario, cambio }) => findWhere(CONFIG.SHEETS.PROGRAMACIONES_JUSTIFICACIONES, 'ID_Horario', horario.ID)
        .map(programacion => ({ programacion, horario, cambio })));
  },

  _programacionActiva_(programacion) {
    return programacion.Activo === true || programacion.Activo === 'TRUE';
  },

  // Aviso persistente para la familia; solo nombra su equipo y su entrenamiento. Mensaje = la línea destacada de la
  // tarjeta («Infantil Mixto · Jueves 19:00–20:00»); el título y la frase de acción los pone la SPA según el Tipo.
  _avisarProgramacionQuitada_(programacion, horario, equipo) {
    const dia = Equipos._DIAS_SEMANA_PLURAL_[Number(horario.DiaSemana)] || 'día ' + horario.DiaSemana;
    appendRow(CONFIG.SHEETS.AVISOS_JUGADOR, {
      ID_Jugador: programacion.ID_Jugador,
      Tipo: 'programacion-quitada',
      Mensaje: `${(equipo && equipo.Nombre) || 'Tu equipo'} · ${dia.charAt(0).toUpperCase()}${dia.slice(1)} ` +
        `${horario.HoraInicio}–${horario.HoraFin}`,
      FechaCreacion: Asistencia._timestamp_(),
      Leido: false,
    });
  },

  _DIAS_SEMANA_: { 1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves', 5: 'viernes', 6: 'sábado', 7: 'domingo' },
  _DIAS_SEMANA_PLURAL_: { 1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves', 5: 'viernes', 6: 'sábados', 7: 'domingos' },

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
      TelefonoPadre1: datos.TelefonoPadre1 || '',
      TelefonoPadre2: datos.TelefonoPadre2 || '',
      NotificarAusenciasPadre1: datos.NotificarAusenciasPadre1 !== false,
      NotificarAusenciasPadre2: datos.NotificarAusenciasPadre2 !== false,
      NombrePadre1:  datos.NombrePadre1  || '',
      ApellidosPadre1: datos.ApellidosPadre1 || '',
      NombrePadre2:  datos.NombrePadre2  || '',
      ApellidosPadre2: datos.ApellidosPadre2 || '',
    });
  },

  // Inicial del nombre + apellidos sin espacios ni tildes (máx. 10). Si no queda ningún carácter
  // latino (p. ej. nombres en otro alfabeto) usa «jugador» para que Usuario nunca quede vacío.
  _generarUsuario(nombre, apellidos) {
    const n = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    return (n(nombre).charAt(0) + n(apellidos).substring(0, 10)) || 'jugador';
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
      'EmailPadre1', 'EmailPadre2', 'NombrePadre1', 'ApellidosPadre1', 'NombrePadre2', 'ApellidosPadre2',
      'TelefonoPadre1', 'TelefonoPadre2', 'NotificarAusenciasPadre1', 'NotificarAusenciasPadre2'
    ];
    permitidos.forEach(k => { if (datos[k] !== undefined) campos[k] = datos[k]; });
    // Avisos por email: solo llegan aquí desde entrenador/admin (el perfil del jugador los filtra) y se guardan como booleano.
    ['NotificarAusenciasPadre1', 'NotificarAusenciasPadre2'].forEach(k => {
      if (campos[k] !== undefined) campos[k] = campos[k] === true || String(campos[k]).toUpperCase() === 'TRUE';
    });
    if (campos.Dorsal !== undefined) {
      const actual = findById(CONFIG.SHEETS.JUGADORES, jugadorId);
      // Solo se valida un cambio de dorsal: los duplicados heredados no bloquean editar otros datos.
      if (!actual || Equipos._normalizarDorsal_(actual.Dorsal) !== Equipos._normalizarDorsal_(campos.Dorsal)) {
        const equipoIds = findWhere(CONFIG.SHEETS.JUGADORES_EQUIPOS, 'ID_Jugador', jugadorId)
          .filter(r => r.Activo === true || r.Activo === 'TRUE')
          .map(r => r.ID_Equipo);
        Equipos._validarDorsalUnico_(jugadorId, campos.Dorsal, equipoIds);
      }
    }
    return updateRow(CONFIG.SHEETS.JUGADORES, jugadorId, campos);
  },

  /** Dorsal comparable: sin espacios y sin ceros a la izquierda ("04" y "4" son el mismo). '' = sin dorsal. */
  _normalizarDorsal_(dorsal) {
    const texto = String(dorsal == null ? '' : dorsal).trim();
    return /^\d+$/.test(texto) ? String(Number(texto)) : texto.toLowerCase();
  },

  /** Lanza un error si otro jugador activo de alguno de `equipoIds` ya lleva `dorsal`. */
  _validarDorsalUnico_(jugadorId, dorsal, equipoIds) {
    const buscado = Equipos._normalizarDorsal_(dorsal);
    if (!buscado) return;
    for (const equipoId of new Set(equipoIds)) {
      for (const rel of findWhere(CONFIG.SHEETS.JUGADORES_EQUIPOS, 'ID_Equipo', equipoId)) {
        if (rel.ID_Jugador === jugadorId || (rel.Activo !== true && rel.Activo !== 'TRUE')) continue;
        const otro = findById(CONFIG.SHEETS.JUGADORES, rel.ID_Jugador);
        if (!otro || Equipos._normalizarDorsal_(otro.Dorsal) !== buscado) continue;
        const equipo = findById(CONFIG.SHEETS.EQUIPOS, equipoId);
        throw new Error(`El dorsal ${String(dorsal).trim()} ya lo lleva ${otro.Nombre} ${otro.Apellidos} en ${equipo ? equipo.Nombre : 'este equipo'}. Elige otro dorsal.`);
      }
    }
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
      const duplicado = jugadores.find(j => j.ID !== jugadorId && String(j.Usuario || '').toLowerCase().trim() === nuevoUsuario);
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
   * Si ya existe una relación activa, actualiza el tipo; conserva las bajas como historial.
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

    const existentes = findWhere(CONFIG.SHEETS.JUGADORES_EQUIPOS, 'ID_Jugador', jugadorId)
      .filter(r => r.ID_Equipo === equipoId && (r.Activo === true || r.Activo === 'TRUE'));

    if (existentes.length > 0) {
      const actualizado = updateRow(CONFIG.SHEETS.JUGADORES_EQUIPOS, existentes[0].ID, { Tipo: tipo });
      if (!actualizado) throw new Error('No se pudo actualizar la asignación del jugador.');
      return { ...existentes[0], Tipo: tipo };
    }

    const jugador = findById(CONFIG.SHEETS.JUGADORES, jugadorId);
    if (jugador) Equipos._validarDorsalUnico_(jugadorId, jugador.Dorsal, [equipoId]);

    return appendRow(CONFIG.SHEETS.JUGADORES_EQUIPOS, {
      ID_Jugador: jugadorId,
      ID_Equipo:  equipoId,
      Tipo:       tipo,
      Activo:     true,
      FechaAlta:  Asistencia._timestamp_().slice(0, 10),
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
      .filter(r => r.ID_Equipo === equipoId && (r.Activo === true || r.Activo === 'TRUE'));
    const hoy = Asistencia._timestamp_().slice(0, 10);
    let actualizado = true;
    relaciones.forEach(r => {
      if (!updateRow(CONFIG.SHEETS.JUGADORES_EQUIPOS, r.ID, { Activo: false, FechaBaja: hoy })) actualizado = false;
    });
    return actualizado;
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
    const esAdmin = datos.EsAdmin === true || datos.EsAdmin === 'TRUE';
    const pin = datos.PIN || '1234';
    const entrenador = appendRow(CONFIG.SHEETS.ENTRENADORES, {
      Nombre:    datos.Nombre,
      Apellidos: datos.Apellidos,
      Email:     datos.Email,
      Telefono:  datos.Telefono || '',
      FotoURL:   datos.FotoURL || '',
      PIN:       pin,
      EsAdmin:   esAdmin,
    });
    if (esAdmin) Equipos._syncAdministrador_(datos.Email, pin, true);
    return entrenador;
  },

  /**
   * Elimina un entrenador y en cascada sus asistencias y asignaciones a equipos.
   * @param {string} entrenadorId
   * @returns {boolean}
   */
  eliminarEntrenador(entrenadorId) {
    const entrenador = findById(CONFIG.SHEETS.ENTRENADORES, entrenadorId);
    if (entrenador && (entrenador.EsAdmin === true || entrenador.EsAdmin === 'TRUE')) {
      Equipos._syncAdministrador_(entrenador.Email, null, false);
    }
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
    const actual = findById(CONFIG.SHEETS.ENTRENADORES, entrenadorId);
    if (!actual) return false;
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
    const administradorActual = Auth._getAdministradorByEmail_(actual.Email);
    const esAdminFinal = datos.EsAdmin !== undefined
      ? campos.EsAdmin
      : Boolean(administradorActual && (administradorActual.Activo === true || administradorActual.Activo === 'TRUE'));
    const emailFinal = campos.Email || actual.Email;
    // El administrador usa el mismo PIN que su ficha de entrenador.
    const pinFinal = campos.PIN || actual.PIN;

    if (esAdminFinal) {
      if (emailFinal !== actual.Email) Equipos._syncAdministrador_(actual.Email, null, false);
      Equipos._syncAdministrador_(emailFinal, pinFinal, true);
    } else if (administradorActual) {
      Equipos._syncAdministrador_(actual.Email, null, false);
    }

    return updateRow(CONFIG.SHEETS.ENTRENADORES, entrenadorId, campos);
  },

  _syncAdministrador_(email, pin, activo) {
    const normalizedEmail = String(email || '').toLowerCase().trim();
    const administradores = getSheetData(CONFIG.SHEETS.ADMINISTRADORES);
    const existente = administradores.find(row => String(row.Email || '').toLowerCase().trim() === normalizedEmail);

    if (activo) {
      if (existente) {
        return updateRow(CONFIG.SHEETS.ADMINISTRADORES, existente.ID, {
          Email: normalizedEmail,
          PIN: pin,
          Activo: true,
        });
      }
      appendRow(CONFIG.SHEETS.ADMINISTRADORES, { Email: normalizedEmail, PIN: pin, Activo: true });
      return true;
    }

    if (!existente || !(existente.Activo === true || existente.Activo === 'TRUE')) return true;
    const activos = administradores.filter(row => row.Activo === true || row.Activo === 'TRUE');
    if (activos.length <= 1) throw new Error('No se puede desactivar al último administrador activo.');
    return updateRow(CONFIG.SHEETS.ADMINISTRADORES, existente.ID, { Activo: false });
  },

  /**
   * Asigna un entrenador a un equipo con el único rol 'Entrenador'. Si ya tiene una relación activa
   * (incluidas las antiguas 'Visor'), la devuelve sin crear otra.
   * @param {string} entrenadorId
   * @param {string} equipoId
   * @returns {Object}
   */
  asignarEntrenadorAEquipo(entrenadorId, equipoId) {
    const tipoRol = CONFIG.TIPOS_ROL_ENTRENADOR.ENTRENADOR;
    const existente = findWhere(CONFIG.SHEETS.ENTRENADORES_EQUIPOS, 'ID_Entrenador', entrenadorId)
      .find(r => r.ID_Equipo === equipoId && (r.Activo === true || r.Activo === 'TRUE'));
    if (existente) return { ...existente, TipoRol: tipoRol };

    return appendRow(CONFIG.SHEETS.ENTRENADORES_EQUIPOS, {
      ID_Entrenador: entrenadorId,
      ID_Equipo:     equipoId,
      Activo:        true,
      TipoRol:       tipoRol,
      FechaAlta:     Asistencia._timestamp_().slice(0, 10),
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
      .filter(r => r.ID_Equipo === equipoId && (r.Activo === true || r.Activo === 'TRUE'));
    const hoy = Asistencia._timestamp_().slice(0, 10);
    let actualizado = true;
    relaciones.forEach(r => {
      if (!updateRow(CONFIG.SHEETS.ENTRENADORES_EQUIPOS, r.ID, { Activo: false, FechaBaja: hoy })) actualizado = false;
    });
    return actualizado;
  },
};
