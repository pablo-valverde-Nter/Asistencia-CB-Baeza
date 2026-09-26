/**
 * DataAccess.gs
 * Acceso a Supabase PostgREST conservando la API CRUD usada por la app.
 * Las credenciales se configuran en Script Properties, nunca en el cliente.
 */

const SUPABASE_BATCH_SIZE = 500;
const SUPABASE_BOOLEAN_FIELDS = new Set([
  'Activa', 'Activo', 'EsAdmin', 'EsExtra', 'AsistenciaGuardada',
  'EsInvitado', 'TieneJustificacion', 'NotificadoEntrenador', 'Asistio',
]);

function getSupabaseConfig_() {
  const properties = PropertiesService.getScriptProperties();
  const url = String(properties.getProperty('SUPABASE_URL') || '').replace(/\/+$/, '');
  const key = properties.getProperty('SUPABASE_SECRET_KEY')
    || properties.getProperty('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('Configura SUPABASE_URL y SUPABASE_SECRET_KEY en las propiedades del script.');
  }
  return { url: url, key: key };
}

function assertSupabaseTable_(tableName) {
  if (!SCHEMA[tableName]) throw new Error(`Tabla no permitida: ${tableName}`);
}

function supabaseRequest_(tableName, method, query, payload, prefer, range) {
  assertSupabaseTable_(tableName);
  const config = getSupabaseConfig_();
  const queryString = query ? `?${query}` : '';
  const headers = {
    apikey: config.key,
    Accept: 'application/json',
  };
  if (!config.key.startsWith('sb_secret_')) {
    headers.Authorization = `Bearer ${config.key}`;
  }
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  if (range) {
    headers['Range-Unit'] = 'items';
    headers.Range = range;
  }

  const options = {
    method: method,
    headers: headers,
    muteHttpExceptions: true,
  };
  if (payload !== undefined) options.payload = JSON.stringify(payload);

  const response = UrlFetchApp.fetch(
    `${config.url}/rest/v1/${encodeURIComponent(tableName)}${queryString}`,
    options
  );
  const status = response.getResponseCode();
  const body = response.getContentText();
  if (status < 200 || status >= 300) {
    let detail = body;
    try {
      const error = JSON.parse(body);
      detail = error.message || error.details || error.hint || body;
    } catch (ignored) {
      // Keep the raw response when PostgREST does not return JSON.
    }
    throw new Error(`Supabase respondió HTTP ${status}: ${detail}`);
  }
  if (!body) return [];
  return JSON.parse(body);
}

function supabaseFilter_(field, value) {
  return `${encodeURIComponent(field)}=eq.${encodeURIComponent(String(value))}`;
}

function normalizeSupabaseValue_(field, value) {
  if (value === '' && SUPABASE_BOOLEAN_FIELDS.has(field)) return null;
  if (field === 'DiaSemana' && value === '') return null;
  return value;
}

function getSheetData(sheetName) {
  assertSupabaseTable_(sheetName);
  const rows = [];
  for (let offset = 0; ; offset += SUPABASE_BATCH_SIZE) {
    const page = supabaseRequest_(
      sheetName,
      'get',
      `select=*&limit=${SUPABASE_BATCH_SIZE}&offset=${offset}`,
      undefined,
      undefined,
      `${offset}-${offset + SUPABASE_BATCH_SIZE - 1}`
    );
    rows.push(...page);
    if (page.length < SUPABASE_BATCH_SIZE) break;
  }
  return rows;
}

function findById(sheetName, id) {
  const rows = supabaseRequest_(sheetName, 'get', `${supabaseFilter_('ID', id)}&select=*&limit=1`);
  return rows[0] || null;
}

function findWhere(sheetName, field, value) {
  assertSupabaseTable_(sheetName);
  if (!SCHEMA[sheetName].includes(field)) throw new Error(`Campo no permitido: ${field}`);
  return supabaseRequest_(sheetName, 'get', `${supabaseFilter_(field, value)}&select=*`);
}

function findWhereIn(sheetName, field, values) {
  assertSupabaseTable_(sheetName);
  if (!SCHEMA[sheetName].includes(field)) throw new Error(`Campo no permitido: ${field}`);
  const wanted = new Set(values.map(String));
  if (!wanted.size) return [];
  return getSheetData(sheetName).filter(row => wanted.has(String(row[field])));
}

function appendRow(sheetName, rowData) {
  assertSupabaseTable_(sheetName);
  if (!rowData.ID) rowData.ID = Utilities.getUuid();
  const payload = {};
  SCHEMA[sheetName].forEach(field => {
    payload[field] = normalizeSupabaseValue_(field, rowData[field] !== undefined ? rowData[field] : '');
  });
  const inserted = supabaseRequest_(sheetName, 'post', '', payload, 'return=representation');
  return inserted[0] || rowData;
}

function updateRow(sheetName, id, updatedData) {
  assertSupabaseTable_(sheetName);
  const payload = {};
  SCHEMA[sheetName].forEach(field => {
    if (updatedData[field] !== undefined) {
      payload[field] = normalizeSupabaseValue_(field, updatedData[field]);
    }
  });
  if (!Object.keys(payload).length) return Boolean(findById(sheetName, id));
  const updated = supabaseRequest_(
    sheetName,
    'patch',
    `${supabaseFilter_('ID', id)}&select=ID`,
    payload,
    'return=representation'
  );
  return updated.length > 0;
}

function deleteRow(sheetName, id) {
  const deleted = supabaseRequest_(
    sheetName,
    'delete',
    `${supabaseFilter_('ID', id)}&select=ID`,
    undefined,
    'return=representation'
  );
  return deleted.length > 0;
}

function deleteWhere(sheetName, field, value) {
  assertSupabaseTable_(sheetName);
  if (!SCHEMA[sheetName].includes(field)) return 0;
  const deleted = supabaseRequest_(
    sheetName,
    'delete',
    `${supabaseFilter_(field, value)}&select=ID`,
    undefined,
    'return=representation'
  );
  return deleted.length;
}