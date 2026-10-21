const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/DataAccess.gs'), 'utf8');
const urls = { DEV: 'https://dummy-dev.supabase.co', PRO: 'https://real-pro.supabase.co' };

function backend(env, changes = {}, expectedUrl = urls[env]) {
  const requests = [];
  const properties = {
    SUPABASE_DEV_URL: urls.DEV,
    SUPABASE_DEV_SECRET_KEY: 'sb_secret_dummy_dev',
    SUPABASE_DEV_PUBLISHABLE_KEY: 'sb_publishable_dummy_dev',
    SUPABASE_PRO_URL: urls.PRO,
    SUPABASE_PRO_SECRET_KEY: 'sb_secret_dummy_pro',
    SUPABASE_PRO_PUBLISHABLE_KEY: 'sb_publishable_dummy_pro',
    ...changes,
  };
  const context = vm.createContext({
    SUPABASE_ENV: env,
    SUPABASE_EXPECTED_URL: expectedUrl,
    SCHEMA: { Equipos: {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: name => properties[name] }) },
    UrlFetchApp: { fetch(url, options) {
      requests.push({ url, options });
      return { getResponseCode: () => 200, getContentText: () => '[]' };
    } },
  });
  vm.runInContext(source, context);
  return { context, requests };
}

for (const env of ['DEV', 'PRO']) {
  test(`${env} consulta solo su proyecto y no expone la clave secreta en Realtime`, () => {
    const { context, requests } = backend(env);
    vm.runInContext("supabaseRequest_('Equipos', 'get', 'select=*')", context);
    assert.equal(requests[0].url, `${urls[env]}/rest/v1/Equipos?select=*`);
    assert.equal(requests[0].options.headers.apikey, `sb_secret_dummy_${env.toLowerCase()}`);
    const realtime = vm.runInContext('getSupabaseRealtimeConfig_()', context);
    assert.deepEqual(JSON.parse(JSON.stringify(realtime)), {
      url: urls[env], key: `sb_publishable_dummy_${env.toLowerCase()}`,
    });
  });

  test(`${env} bloquea una URL cruzada antes de cualquier petición`, () => {
    const other = env === 'DEV' ? 'PRO' : 'DEV';
    const { context, requests } = backend(env, { [`SUPABASE_${env}_URL`]: urls[other] });
    assert.throws(() => vm.runInContext("supabaseRequest_('Equipos', 'post', '', { Nombre: 'No insertar' })", context), /Conexión bloqueada/);
    assert.equal(requests.length, 0);
    assert.throws(() => vm.runInContext('getSupabaseRealtimeConfig_()', context), /Conexión bloqueada/);
  });

  test(`${env} no usa credenciales del otro entorno si faltan las suyas`, () => {
    const { context, requests } = backend(env, { [`SUPABASE_${env}_SECRET_KEY`]: '' });
    assert.throws(() => vm.runInContext("supabaseRequest_('Equipos', 'get', '')", context), /Configura SUPABASE_/);
    assert.equal(requests.length, 0);
  });
}

test('el fuente sin preparar falla antes de conectar con Supabase', () => {
  const { context, requests } = backend('UNPUBLISHED');
  assert.throws(() => vm.runInContext("supabaseRequest_('Equipos', 'get', '')", context), /Versión sin preparar/);
  assert.equal(requests.length, 0);
});

test('una versión sin URL fijada no se conecta aunque existan credenciales', () => {
  const { context, requests } = backend('DEV', {}, '');
  assert.throws(() => vm.runInContext("supabaseRequest_('Equipos', 'get', '')", context), /URL de Supabase fijada/);
  assert.equal(requests.length, 0);
});

test('la URL con barra final o espacios mantiene la misma identidad de proyecto', () => {
  const { context, requests } = backend('DEV', { SUPABASE_DEV_URL: ` ${urls.DEV}/ ` }, `${urls.DEV}/`);
  vm.runInContext("supabaseRequest_('Equipos', 'get', '')", context);
  assert.equal(requests[0].url, `${urls.DEV}/rest/v1/Equipos`);
});
