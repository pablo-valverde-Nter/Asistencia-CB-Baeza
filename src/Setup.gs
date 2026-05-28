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
    'ID', 'Nombre', 'Apellidos', 'FechaNac', 'Telefono', 'Email', 'FotoURL', 'Dorsal',
    'Usuario', 'PIN', 'CodigoPadres', 'EmailPadre1', 'EmailPadre2', 'NombrePadre1', 'NombrePadre2'
  ],
  Jugadores_Equipos: [
    'ID', 'ID_Jugador', 'ID_Equipo', 'Tipo', 'Activo'
  ],
  Entrenadores: [
    'ID', 'Nombre', 'Apellidos', 'Email', 'Telefono', 'PIN', 'EsAdmin'
  ],
  Entrenadores_Equipos: [
    'ID', 'ID_Entrenador', 'ID_Equipo', 'Activo', 'TipoRol'
  ],
  Sesiones: [
    'ID', 'ID_Equipo', 'ID_Temporada', 'Fecha', 'HoraInicio', 'HoraFin', 'EsExtra', 'Notas', 'AsistenciaGuardada'
  ],
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
 * Resetea el Spreadsheet configurado en Config.gs:
 * borra todos los datos de cada hoja (manteniendo cabeceras) y crea
 * las hojas faltantes. Seguro de ejecutar múltiples veces.
 *
 * FLUJO:
 *   1. Ejecutar crearBaseDatos().
 *   2. Ejecutar cargarDatosEjemplo() en SeedData.gs.
 */
function crearBaseDatos() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const nombresEsquema = Object.keys(SCHEMA);

  Logger.log('════════════════════════════════════════════');
  Logger.log('🔄 CB Baeza — Reseteando base de datos...');
  Logger.log('════════════════════════════════════════════');

  nombresEsquema.forEach((nombre, index) => {
    let sheet = ss.getSheetByName(nombre);
    if (!sheet) {
      if (index === 0 && ss.getSheets().length === 1) {
        sheet = ss.getSheets()[0];
        sheet.setName(nombre);
      } else {
        sheet = ss.insertSheet(nombre);
      }
      Logger.log(`  ➕ Creada: ${nombre}`);
    } else {
      Logger.log(`  ♻️  Limpiada: ${nombre}`);
    }
    sheet.clearContents();
    _aplicarCabeceras(sheet, SCHEMA[nombre]);
  });

  Logger.log('');
  Logger.log('✅ Estructura lista. Ejecuta ahora cargarDatosEjemplo().');
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

