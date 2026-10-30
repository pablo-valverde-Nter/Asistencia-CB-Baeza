const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const URL_DEV = 'https://dummy-dev.supabase.co';

// Backend real (Config + Schema + DataAccess + Equipos) publicado como DEV; solo se simula la red.
function backend() {
  const requests = [];
  let uuid = 0;
  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: name => ({
      SUPABASE_DEV_URL: URL_DEV, SUPABASE_DEV_SECRET_KEY: 'sb_secret_dummy_dev' })[name] }) },
    Utilities: { getUuid: () => `0000000${++uuid}-abcd-4ef0-9abc-def012345678` },
    UrlFetchApp: { fetch(url, options) {
      const payload = options.payload ? JSON.parse(options.payload) : undefined;
      requests.push({ url, method: options.method, payload });
      return { getResponseCode: () => (options.method === 'post' ? 201 : 200),
        getContentText: () => JSON.stringify(payload ? [payload] : []) };
    } },
  });
  const config = fs.readFileSync(path.join(__dirname, '../src/Config.gs'), 'utf8')
    .replace("const SUPABASE_ENV = 'UNPUBLISHED';", "const SUPABASE_ENV = 'DEV';")
    .replace("const SUPABASE_EXPECTED_URL = '';", `const SUPABASE_EXPECTED_URL = '${URL_DEV}';`);
  vm.runInContext(config, context);
  for (const file of ['Schema.gs', 'DataAccess.gs', 'Equipos.gs']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
  }
  return { context, requests, Equipos: vm.runInContext('Equipos', context) };
}

// Forma exacta de App.views.altaJugador._leer con solo nombre y apellidos y sin familiares.
function datosWizard(apellidos) {
  const datos = { Nombre: 'Luis', Apellidos: apellidos, Dorsal: '', FechaNac: '', Telefono: '', Email: '' };
  for (const n of [1, 2]) {
    Object.assign(datos, { ['NombrePadre' + n]: '', ['ApellidosPadre' + n]: '', ['TelefonoPadre' + n]: '',
      ['EmailPadre' + n]: '', ['NotificarAusenciasPadre' + n]: true });
  }
  return datos;
}

for (const [apellidos, usuario] of [['Pérez', 'lperez'], ['Pérez López', 'lperezlopez']]) {
  test(`el alta mínima del asistente con apellidos «${apellidos}» llega a Supabase sin '' en BienvenidaVista`, () => {
    const { requests, Equipos } = backend();
    const jugador = Equipos.crearJugador(datosWizard(apellidos));

    const inserts = requests.filter(r => r.method === 'post');
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].url, `${URL_DEV}/rest/v1/Jugadores`);
    const enviado = inserts[0].payload;
    assert.equal(enviado.BienvenidaVista, null);
    assert.equal(enviado.NotificarAusenciasPadre1, true);
    assert.equal(enviado.NotificarAusenciasPadre2, true);
    assert.equal(enviado.Nombre, 'Luis');
    assert.equal(enviado.Apellidos, apellidos);
    assert.equal(enviado.Usuario, usuario);
    assert.match(enviado.PIN, /^\d{4}$/);
    assert.match(enviado.CodigoPadres, /^[0-9A-F]{6}$/);
    assert.equal(jugador.Usuario, usuario);
  });
}

test('Usuario nunca queda vacío aunque el nombre no tenga caracteres latinos', () => {
  const { requests, Equipos } = backend();
  Equipos.crearJugador({ ...datosWizard('Петров'), Nombre: 'Иван' });
  assert.equal(requests.find(r => r.method === 'post').payload.Usuario, 'jugador');
});

test('BienvenidaVista vacía se normaliza a null y una fecha real se conserva', () => {
  const { context } = backend();
  for (const valor of ["''", 'null', 'undefined']) {
    assert.equal(vm.runInContext(`normalizeSupabaseValue_('BienvenidaVista', ${valor})`, context), null);
  }
  const vista = '2026-10-30T10:00:00.000Z';
  assert.equal(vm.runInContext(`normalizeSupabaseValue_('BienvenidaVista', '${vista}')`, context), vista);
});
