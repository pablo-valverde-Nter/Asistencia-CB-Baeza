/**
 * SeedData.gs
 * Datos de ejemplo para CB Baeza — Gestión de Asistencia.
 *
 * INSTRUCCIONES:
 *   1. Asegúrate de que la estructura de hojas ya existe (ejecutar crearBaseDatos() en Setup.gs).
 *   2. Ejecuta cargarDatosEjemplo() desde el editor de Apps Script.
 *
 * CONTENIDO:
 *   • 1 temporada: 2025-2026
 *   • 4 equipos: Minibasket Masculino, Infantil Femenino, Cadete Masculino, Senior Masculino
 *   • 4 entrenadores (con asignaciones a equipos)
 *   • 40 jugadores (10 por equipo; 2 cadetes doblan en Senior como secundarios)
 *   • Horarios semanales para cada equipo
 *   • 8 sesiones pasadas (AsistenciaGuardada=true) + 2 futuras por equipo (40 en total)
 *   • Registros de asistencia con variedad realista P/A/R y justificaciones de ejemplo
 */

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIÓN PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Carga todos los datos de ejemplo en el Spreadsheet.
 * Requiere que las hojas existan con sus cabeceras (Setup.gs → crearBaseDatos).
 * Si ya hay datos, ejecutar limpiarDatosEjemplo() antes para evitar duplicados.
 */
function cargarDatosEjemplo() {
  Logger.log('════════════════════════════════════════════');
  Logger.log('🏀 CB Baeza — Cargando datos de ejemplo...');
  Logger.log('════════════════════════════════════════════');

  const ids = {};

  // ── 1. TEMPORADA ───────────────────────────────────────────────────────────
  Logger.log('\n📅 Creando temporada...');
  const temporada = appendRow(CONFIG.SHEETS.TEMPORADAS, {
    Nombre:      '2025-2026',
    FechaInicio: '2025-09-01',
    FechaFin:    '2026-06-30',
    Activa:      true,
  });
  ids.temporada = temporada.ID;
  Logger.log(`  ✅ Temporada "${temporada.Nombre}" creada (ID: ${temporada.ID})`);

  // ── 2. ENTRENADORES ────────────────────────────────────────────────────────
  Logger.log('\n👨‍🏫 Creando entrenadores...');
  const entrenadorDefs = [
    { Nombre: 'Carlos',  Apellidos: 'Moreno Rivas',    Email: 'carlos.moreno@cbbaeza.es',  Telefono: '622111001', PIN: '1234', EsAdmin: false },
    { Nombre: 'Ana',     Apellidos: 'Martínez López',  Email: 'ana.martinez@cbbaeza.es',   Telefono: '622111002', PIN: '1234', EsAdmin: false },
    { Nombre: 'Pedro',   Apellidos: 'Ruiz García',     Email: 'pedro.ruiz@cbbaeza.es',     Telefono: '622111003', PIN: '1234', EsAdmin: false },
    { Nombre: 'Laura',   Apellidos: 'Sánchez Jiménez', Email: 'laura.sanchez@cbbaeza.es',  Telefono: '622111004', PIN: '1234', EsAdmin: false },
  ];
  ids.entrenadores = entrenadorDefs.map(e => {
    const row = appendRow(CONFIG.SHEETS.ENTRENADORES, e);
    Logger.log(`  ✅ ${e.Nombre} ${e.Apellidos}`);
    return row.ID;
  });
  const [eCarlos, eAna, ePedro, eLaura] = ids.entrenadores;

  // ── 3. EQUIPOS ─────────────────────────────────────────────────────────────
  Logger.log('\n🏆 Creando equipos...');
  const equipoDefs = [
    { Nombre: 'Minibasket Masculino', Categoria: 'minibasket', Modalidad: 'Masculino' },
    { Nombre: 'Infantil Femenino',    Categoria: 'infantil',   Modalidad: 'Femenino'  },
    { Nombre: 'Cadete Masculino',     Categoria: 'cadete',     Modalidad: 'Masculino' },
    { Nombre: 'Senior Masculino',     Categoria: 'senior',     Modalidad: 'Masculino' },
  ];
  ids.equipos = equipoDefs.map(eq => {
    const row = appendRow(CONFIG.SHEETS.EQUIPOS, { ...eq, ID_Temporada: ids.temporada });
    Logger.log(`  ✅ ${eq.Nombre}`);
    return row.ID;
  });
  const [eqMini, eqInfF, eqCad, eqSen] = ids.equipos;

  // ── 4. ENTRENADORES_EQUIPOS ────────────────────────────────────────────────
  // Carlos  → Minibasket + Senior
  // Ana     → Infantil Femenino (principal)
  // Pedro   → Cadete + Senior (asistente)
  // Laura   → Infantil Femenino (asistente)
  Logger.log('\n🔗 Asignando entrenadores a equipos...');
  const asignaciones = [
    { ID_Entrenador: eCarlos, ID_Equipo: eqMini, TipoRol: 'Entrenador', Activo: true },
    { ID_Entrenador: eCarlos, ID_Equipo: eqSen,  TipoRol: 'Entrenador', Activo: true },
    { ID_Entrenador: eAna,    ID_Equipo: eqInfF, TipoRol: 'Entrenador', Activo: true },
    { ID_Entrenador: ePedro,  ID_Equipo: eqCad,  TipoRol: 'Entrenador', Activo: true },
    { ID_Entrenador: ePedro,  ID_Equipo: eqSen,  TipoRol: 'Entrenador', Activo: true },
    { ID_Entrenador: eLaura,  ID_Equipo: eqInfF, TipoRol: 'Entrenador', Activo: true },
  ];
  asignaciones.forEach(a => appendRow(CONFIG.SHEETS.ENTRENADORES_EQUIPOS, a));
  Logger.log(`  ✅ ${asignaciones.length} asignaciones creadas`);

  // ── 5. HORARIOS ────────────────────────────────────────────────────────────
  // DiaSemana: 1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes, 6=Sábado
  Logger.log('\n🕐 Creando horarios semanales...');
  const horarios = [
    // Minibasket: Lunes y Miércoles 18:00–19:00
    { ID_Equipo: eqMini, DiaSemana: 1, HoraInicio: '18:00', HoraFin: '19:00' },
    { ID_Equipo: eqMini, DiaSemana: 3, HoraInicio: '18:00', HoraFin: '19:00' },
    // Infantil Femenino: Martes y Jueves 18:30–20:00
    { ID_Equipo: eqInfF, DiaSemana: 2, HoraInicio: '18:30', HoraFin: '20:00' },
    { ID_Equipo: eqInfF, DiaSemana: 4, HoraInicio: '18:30', HoraFin: '20:00' },
    // Cadete: Lunes, Miércoles y Viernes 19:00–21:00
    { ID_Equipo: eqCad,  DiaSemana: 1, HoraInicio: '19:00', HoraFin: '21:00' },
    { ID_Equipo: eqCad,  DiaSemana: 3, HoraInicio: '19:00', HoraFin: '21:00' },
    { ID_Equipo: eqCad,  DiaSemana: 5, HoraInicio: '19:00', HoraFin: '21:00' },
    // Senior: Martes, Jueves y Sábado 20:00–22:00
    { ID_Equipo: eqSen,  DiaSemana: 2, HoraInicio: '20:00', HoraFin: '22:00' },
    { ID_Equipo: eqSen,  DiaSemana: 4, HoraInicio: '20:00', HoraFin: '22:00' },
    { ID_Equipo: eqSen,  DiaSemana: 6, HoraInicio: '20:00', HoraFin: '22:00' },
  ];
  horarios.forEach(h => appendRow(CONFIG.SHEETS.HORARIOS, h));
  Logger.log(`  ✅ ${horarios.length} franjas horarias creadas`);

  // ── 6. JUGADORES ───────────────────────────────────────────────────────────
  Logger.log('\n🏀 Creando jugadores...');

  // ── Minibasket Masculino (nacidos 2015–2016) ──
  const miniJugadores = [
    { Nombre: 'Pablo',   Apellidos: 'García Rodríguez',  FechaNac: '2015-03-12', Telefono: '633200001', Email: '',                       FotoURL: '', Dorsal: '4'  },
    { Nombre: 'Miguel',  Apellidos: 'Fernández Pérez',   FechaNac: '2015-07-24', Telefono: '633200002', Email: '',                       FotoURL: '', Dorsal: '6'  },
    { Nombre: 'Adrián',  Apellidos: 'López Torres',      FechaNac: '2016-01-15', Telefono: '633200003', Email: '',                       FotoURL: '', Dorsal: '7'  },
    { Nombre: 'Jaime',   Apellidos: 'Martínez Ruiz',     FechaNac: '2015-11-03', Telefono: '633200004', Email: '',                       FotoURL: '', Dorsal: '8'  },
    { Nombre: 'Tomás',   Apellidos: 'Sánchez Castro',    FechaNac: '2016-04-22', Telefono: '633200005', Email: '',                       FotoURL: '', Dorsal: '9'  },
    { Nombre: 'Álvaro',  Apellidos: 'Jiménez Moreno',    FechaNac: '2015-09-08', Telefono: '633200006', Email: '',                       FotoURL: '', Dorsal: '10' },
    { Nombre: 'Iker',    Apellidos: 'Romero Díaz',       FechaNac: '2016-02-17', Telefono: '633200007', Email: '',                       FotoURL: '', Dorsal: '11' },
    { Nombre: 'Hugo',    Apellidos: 'Navarro Gil',        FechaNac: '2015-06-30', Telefono: '633200008', Email: '',                       FotoURL: '', Dorsal: '12' },
    { Nombre: 'Nicolás', Apellidos: 'Herrera Vega',       FechaNac: '2016-08-11', Telefono: '633200009', Email: '',                       FotoURL: '', Dorsal: '14' },
    { Nombre: 'Marcos',  Apellidos: 'Delgado Ortiz',      FechaNac: '2015-12-05', Telefono: '633200010', Email: '',                       FotoURL: '', Dorsal: '15' },
  ];

  // ── Infantil Femenino (nacidas 2011–2012) ──
  const infFJugadoras = [
    { Nombre: 'Lucía',   Apellidos: 'García López',       FechaNac: '2011-04-08', Telefono: '633300001', Email: 'lucia.garcia@email.com', FotoURL: '', Dorsal: '4'  },
    { Nombre: 'Marta',   Apellidos: 'Fernández Ruiz',     FechaNac: '2011-09-15', Telefono: '633300002', Email: 'marta.fdez@email.com',   FotoURL: '', Dorsal: '5'  },
    { Nombre: 'Claudia', Apellidos: 'Martínez Torres',    FechaNac: '2012-01-22', Telefono: '633300003', Email: '',                       FotoURL: '', Dorsal: '6'  },
    { Nombre: 'Laura',   Apellidos: 'Sánchez Pérez',      FechaNac: '2011-07-03', Telefono: '633300004', Email: '',                       FotoURL: '', Dorsal: '7'  },
    { Nombre: 'Sara',    Apellidos: 'Jiménez Morales',    FechaNac: '2012-05-14', Telefono: '633300005', Email: '',                       FotoURL: '', Dorsal: '8'  },
    { Nombre: 'Andrea',  Apellidos: 'Romero Castillo',    FechaNac: '2011-11-27', Telefono: '633300006', Email: '',                       FotoURL: '', Dorsal: '9'  },
    { Nombre: 'Nerea',   Apellidos: 'Navarro Serrano',    FechaNac: '2012-03-09', Telefono: '633300007', Email: '',                       FotoURL: '', Dorsal: '10' },
    { Nombre: 'Sofía',   Apellidos: 'Delgado Campos',     FechaNac: '2011-06-18', Telefono: '633300008', Email: '',                       FotoURL: '', Dorsal: '11' },
    { Nombre: 'Elena',   Apellidos: 'Herrera Blanco',     FechaNac: '2012-08-25', Telefono: '633300009', Email: '',                       FotoURL: '', Dorsal: '12' },
    { Nombre: 'Carla',   Apellidos: 'Torres Medina',      FechaNac: '2011-12-14', Telefono: '633300010', Email: '',                       FotoURL: '', Dorsal: '14' },
  ];

  // ── Cadete Masculino (nacidos 2009–2010) ──
  const cadJugadores = [
    { Nombre: 'Alejandro', Apellidos: 'García Moreno',    FechaNac: '2009-03-15', Telefono: '633400001', Email: 'alex.garcia@email.com',  FotoURL: '', Dorsal: '4'  },
    { Nombre: 'Diego',     Apellidos: 'Fernández Ruiz',   FechaNac: '2009-08-22', Telefono: '633400002', Email: '',                       FotoURL: '', Dorsal: '5'  },
    { Nombre: 'Samuel',    Apellidos: 'López Castro',     FechaNac: '2010-01-07', Telefono: '633400003', Email: '',                       FotoURL: '', Dorsal: '6'  },
    { Nombre: 'Rubén',     Apellidos: 'Martínez Jiménez', FechaNac: '2009-11-18', Telefono: '633400004', Email: '',                       FotoURL: '', Dorsal: '7'  },
    { Nombre: 'Marcos',    Apellidos: 'Sánchez Navarro',  FechaNac: '2010-04-30', Telefono: '633400005', Email: '',                       FotoURL: '', Dorsal: '8'  },
    { Nombre: 'Adrián',    Apellidos: 'Jiménez Torres',   FechaNac: '2009-07-12', Telefono: '633400006', Email: '',                       FotoURL: '', Dorsal: '9'  },
    { Nombre: 'Carlos',    Apellidos: 'Romero Gil',       FechaNac: '2010-02-25', Telefono: '633400007', Email: '',                       FotoURL: '', Dorsal: '10' },
    { Nombre: 'Pablo',     Apellidos: 'Navarro Delgado',  FechaNac: '2009-09-03', Telefono: '633400008', Email: '',                       FotoURL: '', Dorsal: '11' },
    { Nombre: 'Javier',    Apellidos: 'Herrera Ortiz',    FechaNac: '2010-06-17', Telefono: '633400009', Email: '',                       FotoURL: '', Dorsal: '12' },
    { Nombre: 'Álvaro',    Apellidos: 'Torres Vega',      FechaNac: '2009-12-28', Telefono: '633400010', Email: '',                       FotoURL: '', Dorsal: '14' },
  ];

  // ── Senior Masculino (nacidos 1993–2005) ──
  const senJugadores = [
    { Nombre: 'Antonio',   Apellidos: 'García Romero',    FechaNac: '1998-04-10', Telefono: '633500001', Email: 'antonio.garcia@email.com', FotoURL: '', Dorsal: '4'  },
    { Nombre: 'Francisco', Apellidos: 'Fernández López',  FechaNac: '1995-09-23', Telefono: '633500002', Email: 'fran.fdez@email.com',      FotoURL: '', Dorsal: '5'  },
    { Nombre: 'Juan',      Apellidos: 'Martínez Sánchez', FechaNac: '2001-02-14', Telefono: '633500003', Email: 'juan.martinez@email.com',  FotoURL: '', Dorsal: '6'  },
    { Nombre: 'Manuel',    Apellidos: 'Sánchez Jiménez',  FechaNac: '1997-07-31', Telefono: '633500004', Email: '',                        FotoURL: '', Dorsal: '7'  },
    { Nombre: 'Roberto',   Apellidos: 'Jiménez Torres',   FechaNac: '2000-11-06', Telefono: '633500005', Email: '',                        FotoURL: '', Dorsal: '8'  },
    { Nombre: 'Sergio',    Apellidos: 'Romero Navarro',   FechaNac: '1996-03-19', Telefono: '633500006', Email: 'sergio.romero@email.com', FotoURL: '', Dorsal: '9'  },
    { Nombre: 'David',     Apellidos: 'Navarro García',   FechaNac: '2003-08-27', Telefono: '633500007', Email: '',                        FotoURL: '', Dorsal: '10' },
    { Nombre: 'Jesús',     Apellidos: 'Torres Herrera',   FechaNac: '1994-05-15', Telefono: '633500008', Email: '',                        FotoURL: '', Dorsal: '11' },
    { Nombre: 'Raúl',      Apellidos: 'Delgado Martínez', FechaNac: '2002-01-22', Telefono: '633500009', Email: '',                        FotoURL: '', Dorsal: '12' },
    { Nombre: 'Iván',      Apellidos: 'Herrera Delgado',  FechaNac: '1999-10-08', Telefono: '633500010', Email: '',                        FotoURL: '', Dorsal: '14' },
  ];

  /**
   * Inserta jugadores usando Equipos.crearJugador() para auto-generar credenciales
   * (Usuario, PIN, CodigoPadres) y los vincula al equipo como Principal.
   * @returns {string[]} Array de IDs de jugadores insertados.
   */
  function insertarJugadoresEquipo(jugadores, equipoId) {
    return jugadores.map(j => {
      // crearJugador auto-genera Usuario, PIN y CodigoPadres
      const row = Equipos.crearJugador(j);
      appendRow(CONFIG.SHEETS.JUGADORES_EQUIPOS, {
        ID_Jugador: row.ID,
        ID_Equipo:  equipoId,
        Tipo:       'Principal',
        Activo:     true,
      });
      return row.ID;
    });
  }

  ids.jMini = insertarJugadoresEquipo(miniJugadores, eqMini);
  Logger.log(`  ✅ ${miniJugadores.length} jugadores → Minibasket Masculino`);

  ids.jInfF = insertarJugadoresEquipo(infFJugadoras, eqInfF);
  Logger.log(`  ✅ ${infFJugadoras.length} jugadoras → Infantil Femenino`);

  ids.jCad = insertarJugadoresEquipo(cadJugadores, eqCad);
  Logger.log(`  ✅ ${cadJugadores.length} jugadores → Cadete Masculino`);

  ids.jSen = insertarJugadoresEquipo(senJugadores, eqSen);
  Logger.log(`  ✅ ${senJugadores.length} jugadores → Senior Masculino`);

  // Alejandro García y Diego Fernández (cadetes) doblan en Senior como secundarios
  [ids.jCad[0], ids.jCad[1]].forEach(jId => {
    appendRow(CONFIG.SHEETS.JUGADORES_EQUIPOS, {
      ID_Jugador: jId,
      ID_Equipo:  eqSen,
      Tipo:       'Secundario',
      Activo:     true,
    });
  });
  Logger.log('  ✅ 2 cadetes asignados como secundarios en Senior');

  // ── 7. SESIONES ────────────────────────────────────────────────────────────
  Logger.log('\n📋 Creando sesiones (marzo–mayo 2026)...');

  // Minibasket: Lunes y Miércoles (+ 1 sesión extra sábado)  ← todas pasadas → guardadas
  const miniSesiones = [
    { Fecha: '2026-03-02', HoraInicio: '18:00', HoraFin: '19:00', EsExtra: false, Notas: '',                             AsistenciaGuardada: true  },
    { Fecha: '2026-03-09', HoraInicio: '18:00', HoraFin: '19:00', EsExtra: false, Notas: '',                             AsistenciaGuardada: true  },
    { Fecha: '2026-03-25', HoraInicio: '18:00', HoraFin: '19:00', EsExtra: false, Notas: '',                             AsistenciaGuardada: true  },
    { Fecha: '2026-04-06', HoraInicio: '18:00', HoraFin: '19:00', EsExtra: false, Notas: '',                             AsistenciaGuardada: true  },
    { Fecha: '2026-04-22', HoraInicio: '18:00', HoraFin: '19:00', EsExtra: false, Notas: '',                             AsistenciaGuardada: true  },
    { Fecha: '2026-05-04', HoraInicio: '18:00', HoraFin: '19:00', EsExtra: false, Notas: 'Repaso de defensa en zona',   AsistenciaGuardada: true  },
    { Fecha: '2026-05-11', HoraInicio: '18:00', HoraFin: '19:00', EsExtra: false, Notas: '',                             AsistenciaGuardada: true  },
    { Fecha: '2026-05-10', HoraInicio: '10:00', HoraFin: '11:30', EsExtra: true,  Notas: 'Sesión extra previa a torneo', AsistenciaGuardada: true  },
    // Futuras (sin guardar) para probar el modo formulario
    { Fecha: '2026-06-02', HoraInicio: '18:00', HoraFin: '19:00', EsExtra: false, Notas: '',                             AsistenciaGuardada: false },
    { Fecha: '2026-06-04', HoraInicio: '18:00', HoraFin: '19:00', EsExtra: false, Notas: '',                             AsistenciaGuardada: false },
  ];

  // Infantil Femenino: Martes y Jueves
  const infFSesiones = [
    { Fecha: '2026-03-03', HoraInicio: '18:30', HoraFin: '20:00', EsExtra: false, Notas: '',                        AsistenciaGuardada: true  },
    { Fecha: '2026-03-10', HoraInicio: '18:30', HoraFin: '20:00', EsExtra: false, Notas: '',                        AsistenciaGuardada: true  },
    { Fecha: '2026-03-24', HoraInicio: '18:30', HoraFin: '20:00', EsExtra: false, Notas: '',                        AsistenciaGuardada: true  },
    { Fecha: '2026-04-07', HoraInicio: '18:30', HoraFin: '20:00', EsExtra: false, Notas: '',                        AsistenciaGuardada: true  },
    { Fecha: '2026-04-21', HoraInicio: '18:30', HoraFin: '20:00', EsExtra: false, Notas: '',                        AsistenciaGuardada: true  },
    { Fecha: '2026-05-05', HoraInicio: '18:30', HoraFin: '20:00', EsExtra: false, Notas: '',                        AsistenciaGuardada: true  },
    { Fecha: '2026-05-12', HoraInicio: '18:30', HoraFin: '20:00', EsExtra: false, Notas: 'Trabajo de tiro libre',   AsistenciaGuardada: true  },
    { Fecha: '2026-05-19', HoraInicio: '18:30', HoraFin: '20:00', EsExtra: false, Notas: '',                        AsistenciaGuardada: true  },
    // Futuras
    { Fecha: '2026-06-02', HoraInicio: '18:30', HoraFin: '20:00', EsExtra: false, Notas: '',                        AsistenciaGuardada: false },
    { Fecha: '2026-06-04', HoraInicio: '18:30', HoraFin: '20:00', EsExtra: false, Notas: '',                        AsistenciaGuardada: false },
  ];

  // Cadete Masculino: Lunes, Miércoles y Viernes
  const cadSesiones = [
    { Fecha: '2026-03-02', HoraInicio: '19:00', HoraFin: '21:00', EsExtra: false, Notas: '',                     AsistenciaGuardada: true  },
    { Fecha: '2026-03-04', HoraInicio: '19:00', HoraFin: '21:00', EsExtra: false, Notas: '',                     AsistenciaGuardada: true  },
    { Fecha: '2026-03-09', HoraInicio: '19:00', HoraFin: '21:00', EsExtra: false, Notas: '',                     AsistenciaGuardada: true  },
    { Fecha: '2026-04-06', HoraInicio: '19:00', HoraFin: '21:00', EsExtra: false, Notas: '',                     AsistenciaGuardada: true  },
    { Fecha: '2026-04-08', HoraInicio: '19:00', HoraFin: '21:00', EsExtra: false, Notas: '',                     AsistenciaGuardada: true  },
    { Fecha: '2026-05-04', HoraInicio: '19:00', HoraFin: '21:00', EsExtra: false, Notas: '',                     AsistenciaGuardada: true  },
    { Fecha: '2026-05-06', HoraInicio: '19:00', HoraFin: '21:00', EsExtra: false, Notas: '',                     AsistenciaGuardada: true  },
    { Fecha: '2026-05-11', HoraInicio: '19:00', HoraFin: '21:00', EsExtra: false, Notas: 'Preparación playoff',  AsistenciaGuardada: true  },
    // Futuras
    { Fecha: '2026-06-01', HoraInicio: '19:00', HoraFin: '21:00', EsExtra: false, Notas: '',                     AsistenciaGuardada: false },
    { Fecha: '2026-06-03', HoraInicio: '19:00', HoraFin: '21:00', EsExtra: false, Notas: '',                     AsistenciaGuardada: false },
  ];

  // Senior Masculino: Martes, Jueves y Sábado
  const senSesiones = [
    { Fecha: '2026-03-03', HoraInicio: '20:00', HoraFin: '22:00', EsExtra: false, Notas: '',                           AsistenciaGuardada: true  },
    { Fecha: '2026-03-05', HoraInicio: '20:00', HoraFin: '22:00', EsExtra: false, Notas: '',                           AsistenciaGuardada: true  },
    { Fecha: '2026-03-10', HoraInicio: '20:00', HoraFin: '22:00', EsExtra: false, Notas: '',                           AsistenciaGuardada: true  },
    { Fecha: '2026-04-07', HoraInicio: '20:00', HoraFin: '22:00', EsExtra: false, Notas: '',                           AsistenciaGuardada: true  },
    { Fecha: '2026-04-09', HoraInicio: '20:00', HoraFin: '22:00', EsExtra: false, Notas: '',                           AsistenciaGuardada: true  },
    { Fecha: '2026-05-05', HoraInicio: '20:00', HoraFin: '22:00', EsExtra: false, Notas: '',                           AsistenciaGuardada: true  },
    { Fecha: '2026-05-07', HoraInicio: '20:00', HoraFin: '22:00', EsExtra: false, Notas: '',                           AsistenciaGuardada: true  },
    { Fecha: '2026-05-12', HoraInicio: '20:00', HoraFin: '22:00', EsExtra: false, Notas: 'Última sesión liga regular', AsistenciaGuardada: true  },
    // Futuras
    { Fecha: '2026-06-02', HoraInicio: '20:00', HoraFin: '22:00', EsExtra: false, Notas: '',                           AsistenciaGuardada: false },
    { Fecha: '2026-06-05', HoraInicio: '20:00', HoraFin: '22:00', EsExtra: false, Notas: '',                           AsistenciaGuardada: false },
  ];

  /**
   * Inserta sesiones para un equipo y devuelve sus IDs.
   */
  function insertarSesiones(sesionesDef, equipoId) {
    return sesionesDef.map(s => {
      const row = appendRow(CONFIG.SHEETS.SESIONES, {
        ...s,
        ID_Equipo:    equipoId,
        ID_Temporada: ids.temporada,
      });
      return row.ID;
    });
  }

  ids.sMini = insertarSesiones(miniSesiones, eqMini);
  ids.sInfF = insertarSesiones(infFSesiones, eqInfF);
  ids.sCad  = insertarSesiones(cadSesiones,  eqCad);
  ids.sSen  = insertarSesiones(senSesiones,  eqSen);

  const totalSesiones = miniSesiones.length + infFSesiones.length + cadSesiones.length + senSesiones.length;
  Logger.log(`  ✅ ${totalSesiones} sesiones creadas`);

  // ── 8. ASISTENCIA ──────────────────────────────────────────────────────────
  Logger.log('\n✅ Creando registros de asistencia...');

  // Tabla de estados por posición (jugador x sesión) para generar variedad realista
  // Mayoría presentes (P), algunos ausentes (A), pocos con retraso (R)
  const PATRON_ESTADOS = [
    //  j0   j1   j2   j3   j4   j5   j6   j7   j8   j9
    [  'P', 'P', 'P', 'P', 'P', 'P', 'A', 'P', 'P', 'P'],  // sesión 0
    [  'P', 'P', 'R', 'P', 'P', 'A', 'P', 'P', 'P', 'P'],  // sesión 1
    [  'P', 'A', 'P', 'P', 'P', 'P', 'P', 'R', 'A', 'P'],  // sesión 2
    [  'P', 'P', 'P', 'A', 'P', 'P', 'P', 'P', 'P', 'R'],  // sesión 3
    [  'R', 'P', 'P', 'P', 'A', 'P', 'P', 'P', 'P', 'P'],  // sesión 4
    [  'P', 'P', 'P', 'P', 'P', 'P', 'P', 'A', 'P', 'P'],  // sesión 5
    [  'P', 'P', 'A', 'R', 'P', 'P', 'P', 'P', 'P', 'A'],  // sesión 6
    [  'P', 'P', 'P', 'P', 'P', 'R', 'P', 'P', 'A', 'P'],  // sesión 7
  ];

  const HOY = '2026-05-20';

  // Justificaciones de ejemplo para que los indicadores visuales tengan datos
  // idx jugador → { tipo, categoria, detalle }
  const JUSTIFICACIONES = {
    0: { tipo: 'pre', categoria: 'Enfermedad',   detalle: 'Visita médica programada' },
    2: { tipo: 'post', categoria: 'Familiar',     detalle: 'Compromiso familiar ineludible' },
    7: { tipo: 'post', categoria: 'Académico',    detalle: 'Examen de recuperación' },
    8: { tipo: 'pre', categoria: 'Lesión',       detalle: 'Esguince tobillo derecho' },
    9: { tipo: 'post', categoria: 'Transporte',   detalle: 'Sin medio de transporte' },
  };

  /**
   * Registra asistencia de jugadores y entrenadores para un conjunto de sesiones.
   * @param {string[]} sesionesIds
   * @param {string[]} jugadoresIds
   * @param {string}   entrenador1Id   - Siempre asistente
   * @param {string}   [entrenador2Id] - Asistente ocasional (ausente 1 de cada 4)
   */
  function registrarAsistencias(sesionesIds, jugadoresIds, entrenador1Id, entrenador2Id) {
    sesionesIds.forEach((sesId, si) => {
      const patronSesion = PATRON_ESTADOS[si % PATRON_ESTADOS.length];

      // Jugadores
      jugadoresIds.forEach((jId, ji) => {
        const estado = patronSesion[ji % patronSesion.length];
        const tieneIncidencia = estado === 'A' || estado === 'R';
        const justif = tieneIncidencia && JUSTIFICACIONES[ji] ? JUSTIFICACIONES[ji] : null;
        appendRow(CONFIG.SHEETS.ASIST_JUGADORES, {
          ID_Sesion:           sesId,
          ID_Jugador:          jId,
          Estado:              estado,
          EsInvitado:          false,
          FechaRegistro:       HOY,
          TieneJustificacion:  justif ? true : false,
          TipoJustificacion:   justif ? justif.tipo    : '',
          MotivoCategoria:     justif ? justif.categoria : '',
          MotivoDetalle:       justif ? justif.detalle   : '',
          FechaJustificacion:  justif ? HOY              : '',
          JustificadoPor:      justif ? 'padres'         : '',
          MensajeGenerado:     false,
          NotificadoEntrenador: justif ? true            : false,
        });
      });

      // Entrenador principal: siempre presente
      appendRow(CONFIG.SHEETS.ASIST_ENTRENADORES, {
        ID_Sesion:     sesId,
        ID_Entrenador: entrenador1Id,
        Asistio:       true,
        EsInvitado:    false,
        FechaRegistro: HOY,
      });

      // Entrenador asistente: ausente 1 de cada 4 sesiones
      if (entrenador2Id) {
        appendRow(CONFIG.SHEETS.ASIST_ENTRENADORES, {
          ID_Sesion:     sesId,
          ID_Entrenador: entrenador2Id,
          Asistio:       (si % 4 !== 3),
          EsInvitado:    false,
          FechaRegistro: HOY,
        });
      }
    });
  }

  registrarAsistencias(ids.sMini, ids.jMini, eCarlos,  null  );
  registrarAsistencias(ids.sInfF, ids.jInfF, eAna,     eLaura);
  registrarAsistencias(ids.sCad,  ids.jCad,  ePedro,   null  );
  registrarAsistencias(ids.sSen,  ids.jSen,  eCarlos,  ePedro);

  Logger.log('  ✅ Registros de asistencia creados');

  // ── RESUMEN FINAL ──────────────────────────────────────────────────────────
  Logger.log('\n════════════════════════════════════════════');
  Logger.log('🎉 ¡Datos de ejemplo cargados correctamente!');
  Logger.log('');
  Logger.log('   RESUMEN:');
  Logger.log('   • 1 temporada (2025-2026)');
  Logger.log('   • 4 equipos');
  Logger.log('   • 4 entrenadores');
  Logger.log('   • 40 jugadores (10 por equipo)');
  Logger.log('   • 2 cadetes con equipo secundario en Senior');
  Logger.log(`   • ${totalSesiones} sesiones (marzo–junio 2026, 8 pasadas + 2 futuras por equipo)`);
  Logger.log('   • Asistencias guardadas en sesiones pasadas con justificaciones de ejemplo');
  Logger.log('════════════════════════════════════════════');
}


// ─────────────────────────────────────────────────────────────────────────────
// FUNCIÓN DE LIMPIEZA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Elimina TODOS los registros de datos de todas las hojas, conservando las cabeceras.
 *
 * ⚠️  ATENCIÓN: Esta función borra TODO el contenido de datos, no solo los datos
 * de ejemplo. Úsala únicamente en entornos de desarrollo o prueba.
 */
function limpiarDatosEjemplo() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  Object.values(CONFIG.SHEETS).forEach(nombre => {
    const sheet = ss.getSheetByName(nombre);
    if (!sheet) {
      Logger.log(`⚠️  Hoja no encontrada: ${nombre}`);
      return;
    }
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
      Logger.log(`🗑️  ${nombre}: ${lastRow - 1} filas eliminadas`);
    } else {
      Logger.log(`   ${nombre}: sin datos`);
    }
  });

  Logger.log('\n✅ Limpieza completada. Las cabeceras se han conservado.');
}
