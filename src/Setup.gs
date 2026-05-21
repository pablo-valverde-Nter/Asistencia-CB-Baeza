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
  Jugadores: [
    'ID', 'Nombre', 'Apellidos', 'FechaNac', 'Telefono', 'Email', 'FotoURL', 'Dorsal'
  ],
  Jugadores_Equipos: [
    'ID', 'ID_Jugador', 'ID_Equipo', 'Tipo', 'Activo'
  ],
  Entrenadores: [
    'ID', 'Nombre', 'Apellidos', 'Email', 'Telefono', 'PIN'
  ],
  Entrenadores_Equipos: [
    'ID', 'ID_Entrenador', 'ID_Equipo', 'Activo'
  ],
  Sesiones: [
    'ID', 'ID_Equipo', 'ID_Temporada', 'Fecha', 'HoraInicio', 'HoraFin', 'EsExtra', 'Notas', 'AsistenciaGuardada'
  ],
  Asist_Jugadores: [
    'ID', 'ID_Sesion', 'ID_Jugador', 'Estado', 'EsInvitado', 'FechaRegistro'
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
