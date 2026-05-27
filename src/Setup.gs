/**
 * Setup.gs
 * Funciones de inicialización única del Spreadsheet.
 * Ejecutar manualmente desde el editor de Apps Script por el administrador.
 */

/**
 * Define la estructura completa de la base de datos:
 * nombre de hoja → cabeceras en orden.
 */
const SCHEMA = {
  Temporadas: [
    'ID', 'Nombre', 'FechaInicio', 'FechaFin', 'Activa'
  ],
  Equipos: [
    'ID', 'Nombre', 'Categoria', 'Modalidad', 'ID_Temporada'
  ],
  Horarios: [
    'ID', 'ID_Equipo', 'DiaSemana', 'HoraInicio', 'HoraFin'
  ],
  // Nuevos campos v2: Usuario, PIN, CodigoPadres, EmailPadre1, EmailPadre2, NombrePadre1, NombrePadre2
  Jugadores: [
    'ID', 'Nombre', 'Apellidos', 'FechaNac', 'Telefono', 'Email', 'FotoURL', 'Dorsal',
    'Usuario', 'PIN', 'CodigoPadres', 'EmailPadre1', 'EmailPadre2', 'NombrePadre1', 'NombrePadre2'
  ],
  Jugadores_Equipos: [
    'ID', 'ID_Jugador', 'ID_Equipo', 'Tipo', 'Activo'
  ],
  // Nuevo campo v2: EsAdmin
  Entrenadores: [
    'ID', 'Nombre', 'Apellidos', 'Email', 'Telefono', 'PIN', 'EsAdmin'
  ],
  // Nuevo campo v2: TipoRol ('Entrenador' | 'Visor')
  Entrenadores_Equipos: [
    'ID', 'ID_Entrenador', 'ID_Equipo', 'Activo', 'TipoRol'
  ],
  Sesiones: [
    'ID', 'ID_Equipo', 'ID_Temporada', 'Fecha', 'HoraInicio', 'HoraFin', 'EsExtra', 'Notas', 'AsistenciaGuardada'
  ],
  // Nuevos campos v2: justificación de ausencia/retraso
  Asist_Jugadores: [
    'ID', 'ID_Sesion', 'ID_Jugador', 'Estado', 'EsInvitado', 'FechaRegistro',
    'TieneJustificacion', 'TipoJustificacion', 'MotivoCategoria', 'MotivoDetalle',
    'FechaJustificacion', 'JustificadoPor', 'MensajeGenerado', 'NotificadoEntrenador'
  ],
  Asist_Entrenadores: [
    'ID', 'ID_Sesion', 'ID_Entrenador', 'Asistio', 'EsInvitado', 'FechaRegistro'
  ],
};

/**
 * EJECUTAR UNA SOLA VEZ.
 * Crea el Google Spreadsheet, genera todas las hojas con sus cabeceras
 * y muestra el ID en los logs para actualizar Config.gs.
 */
function crearBaseDatos() {
  // Crear nuevo Spreadsheet en Google Drive
  const ss = SpreadsheetApp.create('CB Baeza — Asistencia');

  // Eliminar la hoja por defecto que crea Google
  const defaultSheet = ss.getSheets()[0];

  // Crear cada hoja con sus cabeceras
  Object.entries(SCHEMA).forEach(([nombre, cabeceras], index) => {
    let sheet;
    if (index === 0) {
      // Reutilizar la hoja por defecto para la primera
      sheet = defaultSheet;
      sheet.setName(nombre);
    } else {
      sheet = ss.insertSheet(nombre);
    }
    _aplicarCabeceras(sheet, cabeceras);
  });

  const id = ss.getId();
  const url = ss.getUrl();

  Logger.log('════════════════════════════════════════════');
  Logger.log('✅ Spreadsheet creado correctamente');
  Logger.log(`📋 ID: ${id}`);
  Logger.log(`🔗 URL: ${url}`);
  Logger.log('');
  Logger.log('👉 Copia el ID y actualiza Config.gs → SPREADSHEET_ID');
  Logger.log('════════════════════════════════════════════');
}

/**
 * Aplica formato de cabecera a la primera fila de una hoja.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string[]} cabeceras
 */
function _aplicarCabeceras(sheet, cabeceras) {
  const headerRange = sheet.getRange(1, 1, 1, cabeceras.length);
  headerRange.setValues([cabeceras]);
  headerRange.setBackground('#1a237e');    // Azul oscuro
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(10);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 220);            // Columna ID más ancha
}

/**
 * Verifica que todas las hojas existen y tienen las cabeceras correctas.
 * Útil para detectar problemas tras cambios manuales en el Sheet.
 * No modifica datos, solo informa.
 */
function verificarEstructura() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let ok = true;

  Object.entries(SCHEMA).forEach(([nombre, cabeceras]) => {
    const sheet = ss.getSheetByName(nombre);
    if (!sheet) {
      Logger.log(`❌ Hoja faltante: ${nombre}`);
      ok = false;
      return;
    }
    const actual = sheet.getRange(1, 1, 1, cabeceras.length).getValues()[0];
    const diferencias = cabeceras.filter((h, i) => h !== actual[i]);
    if (diferencias.length > 0) {
      Logger.log(`⚠️  Hoja "${nombre}" — cabeceras incorrectas: ${diferencias.join(', ')}`);
      ok = false;
    } else {
      Logger.log(`✅ ${nombre}`);
    }
  });

  if (ok) Logger.log('\n✅ Estructura verificada correctamente.');
  else Logger.log('\n⚠️  Hay problemas en la estructura. Revisa los logs anteriores.');
}

/**
 * MIGRACIÓN: Añade la columna AsistenciaGuardada a la hoja Sesiones.
 * Ejecutar una sola vez si la base de datos ya existe y no tiene esa columna.
 * Para sesiones pasadas con asistencias registradas, marca la columna como TRUE.
 */
function migrarAsistenciaGuardada() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEETS.SESIONES);
  if (!sheet) { Logger.log('❌ Hoja Sesiones no encontrada.'); return; }

  // Verificar si la columna ya existe
  const cabeceras = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (cabeceras.includes('AsistenciaGuardada')) {
    Logger.log('ℹ️  La columna AsistenciaGuardada ya existe. No se realiza ningún cambio.');
    return;
  }

  // Añadir cabecera en la siguiente columna disponible
  const colNueva = sheet.getLastColumn() + 1;
  const headerCell = sheet.getRange(1, colNueva);
  headerCell.setValue('AsistenciaGuardada');
  headerCell.setBackground('#1a237e');
  headerCell.setFontColor('#ffffff');
  headerCell.setFontWeight('bold');
  headerCell.setFontSize(10);

  // Calcular qué sesiones ya tienen asistencias registradas
  const sheetAsistJug = ss.getSheetByName(CONFIG.SHEETS.ASIST_JUGADORES);
  const asistData = sheetAsistJug.getDataRange().getValues();
  const idxSesionAsist = asistData[0].indexOf('ID_Sesion');
  const sesionesConAsist = new Set(asistData.slice(1).map(r => r[idxSesionAsist]).filter(Boolean));

  // Obtener filas de sesiones para marcar las que ya tienen asistencia
  const idxId = cabeceras.indexOf('ID');
  const numFilas = sheet.getLastRow() - 1;
  if (numFilas > 0) {
    const dataSesiones = sheet.getRange(2, 1, numFilas, sheet.getLastColumn()).getValues();
    const valores = dataSesiones.map(function(row) {
      var sesionId = row[idxId];
      return [sesionesConAsist.has(sesionId) ? true : ''];
    });
    sheet.getRange(2, colNueva, numFilas, 1).setValues(valores);
  }

  Logger.log('✅ Columna AsistenciaGuardada añadida a Sesiones.');
  Logger.log('   Sesiones con asistencia pre-existente marcadas como TRUE: ' + sesionesConAsist.size);
}

/**
 * Crea la temporada inicial 2025-2026 como activa.
 * Ejecutar después de crearBaseDatos() y de actualizar SPREADSHEET_ID.
 */
function crearTemporadaInicial() {
  const temporada = appendRow(CONFIG.SHEETS.TEMPORADAS, {
    Nombre:      '2025-2026',
    FechaInicio: '2025-09-01',
    FechaFin:    '2026-06-30',
    Activa:      true,
  });
  Logger.log(`✅ Temporada creada con ID: ${temporada.ID}`);
  Logger.log('👉 Copia este ID si necesitas referenciarla manualmente.');
}

/**
 * MIGRACIÓN: Añade la columna PIN a la hoja Entrenadores.
 * Ejecuta esta función si ya tenías la hoja creada para añadir el campo de contraseña.
 * Rellena automáticamente los entrenadores con un PIN por defecto '1234'.
 */
function migrarPINEntrenadores() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEETS.ENTRENADORES);
  if (!sheet) { Logger.log('❌ Hoja Entrenadores no encontrada.'); return; }

  // Verificar si la columna ya existe
  const cabeceras = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (cabeceras.includes('PIN')) {
    Logger.log('ℹ️ La columna PIN ya existe. No se realiza ningún cambio.');
    return;
  }

  // Añadir cabecera en la siguiente columna disponible
  const colNueva = sheet.getLastColumn() + 1;
  const headerCell = sheet.getRange(1, colNueva);
  headerCell.setValue('PIN');
  headerCell.setBackground('#1a237e');
  headerCell.setFontColor('#ffffff');
  headerCell.setFontWeight('bold');
  headerCell.setFontSize(10);

  // Rellenar filas existentes con PIN por defecto '1234'
  const numFilas = sheet.getLastRow() - 1;
  if (numFilas > 0) {
    const valores = Array(numFilas).fill(['1234']);
    sheet.getRange(2, colNueva, numFilas, 1).setValues(valores);
  }

  Logger.log('✅ Columna PIN añadida a Entrenadores con valor por defecto "1234".');
}

// ══════════════════════════════════════════════════════════════════════════════
// MIGRACIONES v2 — Sistema de 4 roles
// Ejecutar cada función UNA SOLA VEZ sobre una BD existente.
// Si la BD se crea desde cero con crearBaseDatos(), estas migraciones NO son necesarias.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * MIGRACIÓN v2: Añade los campos de autenticación de jugadores y datos de tutores.
 * Campos nuevos en Jugadores: Usuario, PIN, CodigoPadres, EmailPadre1, EmailPadre2,
 *   NombrePadre1, NombrePadre2
 * Los campos se dejan vacíos; usar migrarGenerarCredencialesJugadores() después
 * para rellenar Usuario, PIN y CodigoPadres automáticamente.
 */
function migrarCamposJugadores() {
  const ss     = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet  = ss.getSheetByName(CONFIG.SHEETS.JUGADORES);
  if (!sheet) { Logger.log('❌ Hoja Jugadores no encontrada.'); return; }

  const cabeceras   = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const nuevosCampos = ['Usuario', 'PIN', 'CodigoPadres', 'EmailPadre1', 'EmailPadre2', 'NombrePadre1', 'NombrePadre2'];
  let añadidos = 0;

  nuevosCampos.forEach(campo => {
    if (!cabeceras.includes(campo)) {
      const col = sheet.getLastColumn() + 1;
      const hdr = sheet.getRange(1, col);
      hdr.setValue(campo);
      hdr.setBackground('#1a237e');
      hdr.setFontColor('#ffffff');
      hdr.setFontWeight('bold');
      hdr.setFontSize(10);
      añadidos++;
      Logger.log(`  ✅ Campo "${campo}" añadido a Jugadores.`);
    } else {
      Logger.log(`  ℹ️  Campo "${campo}" ya existe en Jugadores.`);
    }
  });

  Logger.log(`\n✅ Migración Jugadores completada. ${añadidos} campos nuevos añadidos.`);
}

/**
 * MIGRACIÓN v2: Genera Usuario, PIN y CodigoPadres para todos los jugadores
 * que aún no los tengan. Ejecutar DESPUÉS de migrarCamposJugadores().
 */
function migrarGenerarCredencialesJugadores() {
  const ss     = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet  = ss.getSheetByName(CONFIG.SHEETS.JUGADORES);
  if (!sheet) { Logger.log('❌ Hoja Jugadores no encontrada.'); return; }

  const data    = sheet.getDataRange().getValues();
  const hdrs    = data[0];
  const iId     = hdrs.indexOf('ID');
  const iNombre = hdrs.indexOf('Nombre');
  const iApell  = hdrs.indexOf('Apellidos');
  const iUser   = hdrs.indexOf('Usuario');
  const iPin    = hdrs.indexOf('PIN');
  const iCod    = hdrs.indexOf('CodigoPadres');

  if (iUser < 0 || iPin < 0 || iCod < 0) {
    Logger.log('❌ Faltan columnas. Ejecuta migrarCamposJugadores() primero.');
    return;
  }

  let actualizados = 0;
  for (let i = 1; i < data.length; i++) {
    const row       = data[i];
    const nombre    = String(row[iNombre] || '');
    const apellidos = String(row[iApell]  || '');
    let   usuario   = String(row[iUser]   || '').trim();
    let   pin       = String(row[iPin]    || '').trim();
    let   codigo    = String(row[iCod]    || '').trim();

    let changed = false;

    if (!usuario) {
      usuario = _generarUsuarioJugador(nombre, apellidos);
      // Garantizar unicidad: si ya existe, añadir sufijo numérico
      const usersExistentes = data.slice(1).map(r => String(r[iUser] || '').toLowerCase());
      let base = usuario; let suf = 2;
      while (usersExistentes.includes(usuario.toLowerCase())) {
        usuario = base + suf++;
      }
      sheet.getRange(i + 1, iUser + 1).setValue(usuario);
      changed = true;
    }
    if (!pin) {
      pin = _generarPIN4();
      sheet.getRange(i + 1, iPin + 1).setValue(pin);
      changed = true;
    }
    if (!codigo) {
      codigo = _generarCodigoPadres();
      sheet.getRange(i + 1, iCod + 1).setValue(codigo);
      changed = true;
    }

    if (changed) {
      actualizados++;
      Logger.log(`  ✅ ${nombre} ${apellidos} → usuario="${usuario}" pin="${pin}" codigo="${codigo}"`);
    }
  }

  Logger.log(`\n✅ ${actualizados} jugadores actualizados con credenciales.`);
}

/**
 * MIGRACIÓN v2: Añade el campo EsAdmin a la hoja Entrenadores.
 */
function migrarCamposEntrenadores() {
  const ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEETS.ENTRENADORES);
  if (!sheet) { Logger.log('❌ Hoja Entrenadores no encontrada.'); return; }

  const cabeceras = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (cabeceras.includes('EsAdmin')) {
    Logger.log('ℹ️  Campo EsAdmin ya existe en Entrenadores.');
    return;
  }

  const col = sheet.getLastColumn() + 1;
  const hdr = sheet.getRange(1, col);
  hdr.setValue('EsAdmin');
  hdr.setBackground('#1a237e');
  hdr.setFontColor('#ffffff');
  hdr.setFontWeight('bold');
  hdr.setFontSize(10);

  // Rellenar con false por defecto
  const numFilas = sheet.getLastRow() - 1;
  if (numFilas > 0) {
    sheet.getRange(2, col, numFilas, 1).setValues(Array(numFilas).fill([false]));
  }

  Logger.log('✅ Campo EsAdmin añadido a Entrenadores (false por defecto).');
}

/**
 * MIGRACIÓN v2: Añade el campo TipoRol a la hoja Entrenadores_Equipos.
 * Las relaciones existentes se marcan como 'Entrenador' por defecto.
 */
function migrarTipoRolEntrenadorEquipo() {
  const ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEETS.ENTRENADORES_EQUIPOS);
  if (!sheet) { Logger.log('❌ Hoja Entrenadores_Equipos no encontrada.'); return; }

  const cabeceras = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (cabeceras.includes('TipoRol')) {
    Logger.log('ℹ️  Campo TipoRol ya existe en Entrenadores_Equipos.');
    return;
  }

  const col = sheet.getLastColumn() + 1;
  const hdr = sheet.getRange(1, col);
  hdr.setValue('TipoRol');
  hdr.setBackground('#1a237e');
  hdr.setFontColor('#ffffff');
  hdr.setFontWeight('bold');
  hdr.setFontSize(10);

  const numFilas = sheet.getLastRow() - 1;
  if (numFilas > 0) {
    sheet.getRange(2, col, numFilas, 1).setValues(Array(numFilas).fill(['Entrenador']));
  }

  Logger.log('✅ Campo TipoRol añadido a Entrenadores_Equipos (Entrenador por defecto).');
}

/**
 * MIGRACIÓN v2: Añade los campos de justificación a la hoja Asist_Jugadores.
 */
function migrarCamposJustificacion() {
  const ss     = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet  = ss.getSheetByName(CONFIG.SHEETS.ASIST_JUGADORES);
  if (!sheet) { Logger.log('❌ Hoja Asist_Jugadores no encontrada.'); return; }

  const cabeceras   = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const nuevosCampos = [
    'TieneJustificacion', 'TipoJustificacion', 'MotivoCategoria', 'MotivoDetalle',
    'FechaJustificacion', 'JustificadoPor', 'MensajeGenerado', 'NotificadoEntrenador'
  ];
  let añadidos = 0;

  nuevosCampos.forEach(campo => {
    if (!cabeceras.includes(campo)) {
      const col = sheet.getLastColumn() + 1;
      const hdr = sheet.getRange(1, col);
      hdr.setValue(campo);
      hdr.setBackground('#1a237e');
      hdr.setFontColor('#ffffff');
      hdr.setFontWeight('bold');
      hdr.setFontSize(10);
      añadidos++;
    }
  });

  Logger.log(`✅ Migración Asist_Jugadores: ${añadidos} campos de justificación añadidos.`);
}

/**
 * EJECUTAR TODAS LAS MIGRACIONES v2 en orden.
 * Usar cuando se actualiza una BD existente (v1 → v2).
 */
function ejecutarMigracionesV2() {
  Logger.log('══════════════════════════════════════════');
  Logger.log('🔄 Iniciando migraciones v2 — Sistema de 4 roles');
  Logger.log('══════════════════════════════════════════\n');

  migrarCamposJugadores();
  migrarGenerarCredencialesJugadores();
  migrarCamposEntrenadores();
  migrarTipoRolEntrenadorEquipo();
  migrarCamposJustificacion();
  migrarAsistenciaGuardada(); // ya existente

  Logger.log('\n══════════════════════════════════════════');
  Logger.log('✅ Todas las migraciones v2 completadas.');
  Logger.log('══════════════════════════════════════════');
}

// ── Helpers internos de Setup ─────────────────────────────────────────────────

function _generarUsuarioJugador(nombre, apellidos) {
  const normalizar = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const ini   = normalizar(nombre).charAt(0);
  const apell = normalizar(apellidos).replace(/\s+/g, '').substring(0, 10);
  return ini + apell;
}

function _generarPIN4() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function _generarCodigoPadres() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 6).toUpperCase();
}
