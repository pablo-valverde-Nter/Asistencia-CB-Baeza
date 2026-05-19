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
    'ID', 'Nombre', 'Apellidos', 'Email', 'Telefono'
  ],
  Entrenadores_Equipos: [
    'ID', 'ID_Entrenador', 'ID_Equipo', 'Activo'
  ],
  Sesiones: [
    'ID', 'ID_Equipo', 'ID_Temporada', 'Fecha', 'HoraInicio', 'HoraFin', 'EsExtra', 'Notas'
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
