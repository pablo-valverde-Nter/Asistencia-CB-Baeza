/**
 * DataAccess.gs
 * Acceso a Supabase PostgREST conservando la API CRUD usada por la app.
 * Las credenciales se configuran en Script Properties, nunca en el cliente.
 */

const SUPABASE_BATCH_SIZE = 500;
const SUPABASE_BOOLEAN_FIELDS = new Set([
  'Activa', 'Activo', 'EsAdmin', 'EsExtra', 'AsistenciaGuardada', 'Cancelada',
  'EsInvitado', 'Excluido', 'TieneJustificacion', 'NotificadoEntrenador', 'EsProgramada', 'Asistio',
  'NotificarAusenciasPadre1', 'NotificarAusenciasPadre2',
]);
const SUPABASE_INTEGER_FIELDS = new Set(['DiaSemana', 'MinutosRetraso']);
// Columnas timestamptz: PostgREST rechaza '' («invalid input syntax for type timestamp»).
const SUPABASE_TIMESTAMP_FIELDS = new Set(['BienvenidaVista']);
// Caché por ejecución: cada llamada de google.script.run arranca vacía y cualquier escritura la vacía.
const SUPABASE_TABLE_CACHE_ = new Map();
let SUPABASE_CONFIG_CACHE_ = null;

function getSupabaseConfig_() {
  if (SUPABASE_CONFIG_CACHE_) return SUPABASE_CONFIG_CACHE_;
  const env = String(SUPABASE_ENV || '').trim().toUpperCase();
  if (env !== 'DEV' && env !== 'PRO') {
    throw new Error('Versión sin preparar: publica con deploy:dev o deploy:pro.');
  }
  const expectedUrl = String(SUPABASE_EXPECTED_URL || '').trim().replace(/\/+$/, '');
  if (!expectedUrl) {
    throw new Error('Esta versión no tiene una URL de Supabase fijada por el publicador.');
  }

  const properties = PropertiesService.getScriptProperties();
  const urlProperty = `SUPABASE_${env}_URL`;
  const keyProperty = `SUPABASE_${env}_SECRET_KEY`;
  const realtimeKeyProperty = `SUPABASE_${env}_PUBLISHABLE_KEY`;
  const url = String(properties.getProperty(urlProperty) || '').trim().replace(/\/+$/, '');
  const key = properties.getProperty(keyProperty);
  if (!url || !key) {
    throw new Error(`Configura ${urlProperty} y ${keyProperty} en las propiedades del script.`);
  }
  if (url !== expectedUrl) {
    throw new Error(`La URL de ${urlProperty} no coincide con esta versión ${env}. Conexión bloqueada.`);
  }
  SUPABASE_CONFIG_CACHE_ = {
    env: env,
    url: url,
    key: key,
    realtimeKey: properties.getProperty(realtimeKeyProperty) || '',
  };
  return SUPABASE_CONFIG_CACHE_;
}

function getSupabaseRealtimeConfig_() {
  const config = getSupabaseConfig_();
  return { url: config.url, key: config.realtimeKey };
}

function assertSupabaseTable_(tableName) {
  if (!SCHEMA[tableName]) throw new Error(`Tabla no permitida: ${tableName}`);
}

function supabaseRequestParams_(tableName, method, query, payload, prefer, range) {
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
  return { url: `${config.url}/rest/v1/${encodeURIComponent(tableName)}${queryString}`, options: options };
}

function parseSupabaseResponse_(response) {
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

function supabaseRequest_(tableName, method, query, payload, prefer, range) {
  const request = supabaseRequestParams_(tableName, method, query, payload, prefer, range);
  if (method !== 'get') SUPABASE_TABLE_CACHE_.clear();
  return parseSupabaseResponse_(UrlFetchApp.fetch(request.url, request.options));
}

function supabasePageParams_(sheetName, offset) {
  return supabaseRequestParams_(sheetName, 'get', `select=*&limit=${SUPABASE_BATCH_SIZE}&offset=${offset}`,
    undefined, undefined, `${offset}-${offset + SUPABASE_BATCH_SIZE - 1}`);
}

/**
 * Lee en paralelo la primera página de varias tablas y las deja en la caché de la ejecución.
 * Las tablas que fallen se omiten: getSheetData las vuelve a pedir y devuelve su error concreto.
 */
function precargarTablas_(sheetNames) {
  const pendientes = sheetNames.filter(name => !SUPABASE_TABLE_CACHE_.has(name));
  if (!pendientes.length) return;
  const requests = pendientes.map(name => {
    const request = supabasePageParams_(name, 0);
    return Object.assign({ url: request.url }, request.options);
  });
  const responses = UrlFetchApp.fetchAll(requests);
  pendientes.forEach((name, i) => {
    try {
      const rows = parseSupabaseResponse_(responses[i]);
      for (let offset = SUPABASE_BATCH_SIZE; rows.length === offset; offset += SUPABASE_BATCH_SIZE) {
        const request = supabasePageParams_(name, offset);
        rows.push(...parseSupabaseResponse_(UrlFetchApp.fetch(request.url, request.options)));
      }
      SUPABASE_TABLE_CACHE_.set(name, rows);
    } catch (ignored) {
      // getSheetData repite la lectura de esta tabla y propaga el error.
    }
  });
}

function supabaseFilter_(field, value) {
  return `${encodeURIComponent(field)}=eq.${encodeURIComponent(String(value))}`;
}

function normalizeSupabaseValue_(field, value) {
  if (value === '' && SUPABASE_BOOLEAN_FIELDS.has(field)) return null;
  if (SUPABASE_INTEGER_FIELDS.has(field) && value === '') return null;
  if (SUPABASE_TIMESTAMP_FIELDS.has(field) && (value === '' || value === null || value === undefined)) return null;
  return value;
}

function getSheetData(sheetName) {
  assertSupabaseTable_(sheetName);
  if (!SUPABASE_TABLE_CACHE_.has(sheetName)) {
    const rows = [];
    for (let offset = 0; ; offset += SUPABASE_BATCH_SIZE) {
      const request = supabasePageParams_(sheetName, offset);
      const page = parseSupabaseResponse_(UrlFetchApp.fetch(request.url, request.options));
      rows.push(...page);
      if (page.length < SUPABASE_BATCH_SIZE) break;
    }
    SUPABASE_TABLE_CACHE_.set(sheetName, rows);
  }
  return SUPABASE_TABLE_CACHE_.get(sheetName).slice();
}

function findById(sheetName, id) {
  if (SUPABASE_TABLE_CACHE_.has(sheetName)) {
    return SUPABASE_TABLE_CACHE_.get(sheetName).find(row => String(row.ID) === String(id)) || null;
  }
  const rows = supabaseRequest_(sheetName, 'get', `${supabaseFilter_('ID', id)}&select=*&limit=1`);
  return rows[0] || null;
}

function findWhere(sheetName, field, value) {
  assertSupabaseTable_(sheetName);
  if (!SCHEMA[sheetName].includes(field)) throw new Error(`Campo no permitido: ${field}`);
  if (SUPABASE_TABLE_CACHE_.has(sheetName)) {
    return SUPABASE_TABLE_CACHE_.get(sheetName).filter(row => String(row[field]) === String(value));
  }
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
    const value = rowData[field] !== undefined ? rowData[field] : (SUPABASE_TIMESTAMP_FIELDS.has(field) ? null : '');
    payload[field] = normalizeSupabaseValue_(field, value);
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