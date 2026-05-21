/**
 * DataAccess.gs
 * CRUD genérico sobre Google Sheets.
 * Todas las hojas tienen la primera fila como cabecera y una columna "ID".
 */

/**
 * Abre el Spreadsheet cacheando la referencia dentro de la misma ejecución.
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function getSpreadsheet_() {
  if (!globalThis._ss) {
    globalThis._ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  }
  return globalThis._ss;
}

/**
 * Obtiene una hoja por nombre.
 * @param {string} sheetName
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getSheet_(sheetName) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) throw new Error(`Hoja no encontrada: ${sheetName}`);
  return sheet;
}

/**
 * Lee todos los registros de una hoja y los devuelve como array de objetos.
 * Los valores de tipo Date (que Google Sheets devuelve al leer celdas de fecha)
 * se convierten automáticamente a strings 'YYYY-MM-DD' para evitar errores
 * en comparaciones y llamadas a métodos de string como localeCompare().
 * @param {string} sheetName
 * @returns {Object[]}
 */
function getSheetData(sheetName) {
  const sheet = getSheet_(sheetName);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  const tz = Session.getScriptTimeZone();
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      let val = row[i];
      if (val instanceof Date) {
        if (isNaN(val)) {
          // Celda vacía o fecha inválida
          val = '';
        } else if (val.getFullYear() < 1900) {
          // Valor de tipo hora (fracción de día): formatear como HH:mm
          val = Utilities.formatDate(val, tz, 'HH:mm');
        } else {
          // Fecha normal: formatear como YYYY-MM-DD
          val = Utilities.formatDate(val, tz, 'yyyy-MM-dd');
        }
      }
      obj[h] = val;
    });
    return obj;
  });
}

/**
 * Busca un registro por su ID.
 * @param {string} sheetName
 * @param {string} id
 * @returns {Object|null}
 */
function findById(sheetName, id) {
  const rows = getSheetData(sheetName);
  return rows.find(r => r.ID === id) || null;
}

/**
 * Busca todos los registros donde field === value.
 * @param {string} sheetName
 * @param {string} field
 * @param {*} value
 * @returns {Object[]}
 */
function findWhere(sheetName, field, value) {
  return getSheetData(sheetName).filter(r => r[field] === value);
}

/**
 * Busca todos los registros donde field está incluido en un array de values.
 * @param {string} sheetName
 * @param {string} field
 * @param {*[]} values
 * @returns {Object[]}
 */
function findWhereIn(sheetName, field, values) {
  const set = new Set(values);
  return getSheetData(sheetName).filter(r => set.has(r[field]));
}

/**
 * Añade una nueva fila a la hoja. Genera ID automático si no se proporciona.
 * @param {string} sheetName
 * @param {Object} rowData - Objeto con los campos a insertar (deben coincidir con cabeceras).
 * @returns {Object} El objeto insertado con su ID.
 */
function appendRow(sheetName, rowData) {
  const sheet = getSheet_(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  if (!rowData.ID) {
    rowData.ID = Utilities.getUuid();
  }

  const row = headers.map(h => (rowData[h] !== undefined ? rowData[h] : ''));
  sheet.appendRow(row);
  return rowData;
}

/**
 * Actualiza un registro existente buscándolo por ID.
 * Solo sobreescribe los campos presentes en updatedData.
 * @param {string} sheetName
 * @param {string} id
 * @param {Object} updatedData
 * @returns {boolean} true si se encontró y actualizó, false si no existe.
 */
function updateRow(sheetName, id, updatedData) {
  const sheet = getSheet_(sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('ID');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      headers.forEach((h, j) => {
        if (updatedData[h] !== undefined) {
          sheet.getRange(i + 1, j + 1).setValue(updatedData[h]);
        }
      });
      return true;
    }
  }
  return false;
}

/**
 * Elimina la fila con el ID especificado.
 * @param {string} sheetName
 * @param {string} id
 * @returns {boolean} true si se encontró y borró, false si no existe.
 */
function deleteRow(sheetName, id) {
  const sheet = getSheet_(sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('ID');

  // Recorrer de abajo arriba para no desplazar índices al borrar
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][idCol]) === String(id)) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

/**
 * Elimina todas las filas donde field === value (borrado en cascada).
 * @param {string} sheetName
 * @param {string} field
 * @param {*} value
 * @returns {number} Número de filas eliminadas.
 */
function deleteWhere(sheetName, field, value) {
  const sheet = getSheet_(sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const fieldCol = headers.indexOf(field);
  if (fieldCol === -1) return 0;

  let deleted = 0;
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][fieldCol]) === String(value)) {
      sheet.deleteRow(i + 1);
      deleted++;
    }
  }
  return deleted;
}
