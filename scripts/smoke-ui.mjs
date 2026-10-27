// Offline browser smoke: real SPA, bootstrap sanitization and statistics; no database.
import { readFile, writeFile, mkdtemp, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { datos, AHORA } = require('../tests/fixtures/estadisticas-fixture.js');
const source = async name => readFile(join(root, name), 'utf8');
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const script = code => '<script>' + code.replace(/<\/script/gi, '<\\/script') + '</script>';

// Runs before the app so startup exceptions and its first server call are captured.
function installShim(fixture, ahora) {
  const errores = window.__errors = [];
  window.__calls = [];
  window.__pending = 0;
  const message = value => value && (value.stack || value.message) || String(value);
  window.addEventListener('error', event => errores.push(message(event.error || event.message)));
  window.addEventListener('unhandledrejection', event => errores.push(message(event.reason)));
  const originalError = console.error.bind(console);
  console.error = (...args) => { errores.push(args.map(message).join(' ')); originalError(...args); };

  const NativeDate = Date;
  const parts = ahora.split(/[- :]/).map(Number);
  const fixed = new NativeDate(parts[0], parts[1] - 1, parts[2], parts[3], parts[4]).getTime();
  function FixedDate(...args) {
    if (!new.target) return new NativeDate(fixed).toString();
    return Reflect.construct(NativeDate, args.length ? args : [fixed], new.target);
  }
  Object.setPrototypeOf(FixedDate, NativeDate);
  FixedDate.prototype = NativeDate.prototype;
  FixedDate.now = () => fixed;
  window.Date = FixedDate;

  window.__fixture = fixture;
  window.__ahora = ahora;
  window.__role = new URLSearchParams(location.search).get('role') || 'admin';
  localStorage.clear();
  localStorage.setItem('cb_baeza_auth', JSON.stringify(window.__role === 'jugador'
    ? { tipo: 'jugador', usuario: 'bruno', pin: '1234' }
    : { tipo: 'entrenador', email: 'luis@example.test', pin: '1234' }));
}

// Only infrastructure is stubbed. cargarDatos/getEstadisticas below are the real Code.gs.
function backendStubs() {
  const fixture = window.__fixture;
  const tables = {
    Temporadas: 'temporadas', Equipos: 'equipos', Horarios: 'horarios', Jugadores: 'jugadores',
    Jugadores_Equipos: 'jugadoresEquipos', Entrenadores: 'entrenadores',
    Entrenadores_Equipos: 'entrenadoresEquipos', Sesiones: 'sesiones',
    Asist_Jugadores: 'asistJugadores', Asist_Entrenadores: 'asistEntrenadores',
    Programaciones_Justificaciones: 'programacionesJustificaciones',
  };
  return {
    Auth: {
      getContextoUsuario(auth) {
        const jugador = auth.tipo === 'jugador';
        const propio = { ...fixture.jugadores.find(j => j.ID === 'jugador-bruno') };
        delete propio.CodigoPadres;
        return {
          success: true, rol: jugador ? 'jugador' : 'admin', esAdmin: !jugador,
          jugador: jugador ? propio : null,
          entrenador: jugador ? null : fixture.entrenadores[0],
          equipoPrincipal: jugador ? fixture.equipos[0] : null,
          equipos: jugador ? [] : fixture.equipos.filter(e => e.ID_Temporada === 'temp-actual'),
          equiposVisor: [],
        };
      },
    },
    getSheetData(table) {
      if (!(table in tables)) throw new Error('Tabla de prueba desconocida: ' + table);
      return structuredClone(fixture[tables[table]] || []);
    },
    Utilities: { getUuid: () => 'smoke-ui-0000', formatDate: () => window.__ahora },
    Logger: { log() {} },
    getSupabaseRealtimeConfig_: () => null,
  };
}

function installRunner(backend) {
  function chain(success, failure, user) {
    return new Proxy({}, {
      get(_, name) {
        if (name === 'withSuccessHandler') return fn => chain(fn, failure, user);
        if (name === 'withFailureHandler') return fn => chain(success, fn, user);
        if (name === 'withUserObject') return value => chain(success, failure, value);
        return (...args) => {
          window.__pending++;
          setTimeout(() => {
            try {
              if (name === 'logCliente') { if (success) success(undefined, user); return; }
              if (name !== 'cargarDatos' && name !== 'getEstadisticas') {
                window.__calls.push({ funcion: String(name), argumentos: args });
                throw new Error('Llamada no permitida en smoke: ' + String(name));
              }
              const result = backend[name](...args);
              if (!result.success) window.__errors.push(name + ': ' + result.error);
              if (success) success(structuredClone(result), user);
            } catch (error) {
              if (failure) failure(error, user);
              else window.__errors.push(error.stack || error.message);
            } finally { window.__pending--; }
          }, 0);
        };
      },
    });
  }
  window.google = { script: { run: chain() } };
}

function driveViews() {
  const pause = () => new Promise(resolve => setTimeout(resolve, 50));
  const result = { errores: window.__errors, llamadas: window.__calls, textos: {} };
  function publish() {
    let pre = document.getElementById('smoke-result');
    if (!pre) { pre = document.createElement('pre'); pre.id = 'smoke-result'; pre.hidden = true; document.body.append(pre); }
    pre.textContent = JSON.stringify(result);
  }
  async function settle() {
    // Two idle turns allow Promise callbacks, detail renders and their follow-up calls.
    let idle = 0;
    for (let turn = 0; turn < 80; turn++) {
      await pause();
      const loading = App.stats && Object.values(App.stats.detalles || {}).some(e => e.estado === 'cargando');
      idle = !window.__pending && !loading ? idle + 1 : 0;
      if (idle === 2) return;
    }
    throw new Error('Tiempo agotado esperando estadísticas de ' + App.state.currentView);
  }
  async function run() {
    try {
      await settle();
      if (!App.cache.temporadas.length || App.state.rol !== window.__role) throw new Error('Bootstrap incompleto para ' + window.__role);
      const views = window.__role === 'jugador'
        ? ['perfil-jugador', 'mis-stats', 'mi-equipo']
        : ['equipos', 'equipos-admin', 'jugadores-admin', 'entrenadores-admin', 'equipo-detalle', 'jugador-detalle', 'entrenador-detalle', 'informes'];
      for (const view of views) {
        try {
          App.state.detalleEquipoId = 'equipo-cadete';
          App.state.detalleJugadorId = 'jugador-bruno';
          App.state.detalleEntrenadorId = 'entrenador-luis';
          App.navigate(view, {}, false);
          await settle();
          const element = document.getElementById('view-' + view);
          if (!element || !element.classList.contains('active')) throw new Error('Vista no disponible: ' + view);
          result.textos[view] = element.innerText;
          if (!element.innerText.trim()) throw new Error('Vista vacía: ' + view);
        } catch (error) { result.errores.push(view + ': ' + (error.stack || error.message)); }
      }
      const finalView = new URLSearchParams(location.search).get('final') || views.at(-1);
      if (views.includes(finalView)) { App.navigate(finalView, {}, false); await settle(); }
      window.scrollTo(0, 0);
    } catch (error) { result.errores.push(error.stack || error.message); }
    publish();
  }
  document.addEventListener('DOMContentLoaded', () => { run(); });
}

// Edge's native window has a minimum CSS width, even when its PNG is 412px wide.
// CDP device metrics set the real layout viewport before loading the page.
async function captureMobile(browser, url, output, role, screenshot) {
  const profile = join(output, 'mobile-' + role);
  const child = spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  let socket;
  let launchError;
  child.on('error', error => { launchError = error; });
  const delay = () => new Promise(resolve => setTimeout(resolve, 50));
  const deadline = Date.now() + 30000;
  function remaining() {
    if (launchError) throw launchError;
    if (Date.now() > deadline) throw new Error('Tiempo agotado capturando viewport móvil: ' + role);
  }
  try {
    let address;
    while (!address) {
      remaining();
      try {
        const [port, path] = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/);
        address = 'ws://127.0.0.1:' + port + path;
      } catch { await delay(); }
    }
    socket = new WebSocket(address);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error('No se puede conectar a CDP.')), { once: true });
    });
    let id = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('CDP agotado: ' + method)); }, 10000);
      pending.set(requestId, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: requestId, method, params, sessionId }));
    });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 1, mobile: true }, sessionId);
    await send('Page.navigate', { url }, sessionId);
    while (true) {
      remaining();
      const { result } = await send('Runtime.evaluate', { expression: '!!document.getElementById("smoke-result")', returnByValue: true }, sessionId);
      if (result.value) break;
      await delay();
    }
    const { result } = await send('Runtime.evaluate', { expression: 'JSON.stringify({width:innerWidth,height:innerHeight})', returnByValue: true }, sessionId);
    const viewport = JSON.parse(result.value);
    if (viewport.width !== 412 || viewport.height !== 915) throw new Error('Viewport móvil incorrecto: ' + result.value);
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
    await writeFile(screenshot, Buffer.from(data, 'base64'));
  } finally {
    if (socket) socket.close();
    child.kill();
  }
}

async function main() {
  const config = await source('src/Config.gs');
  const engine = await source('src/Estadisticas.gs');
  const code = await source('src/Code.gs');
  const context = vm.createContext({});
  vm.runInContext(config + '\n' + engine + '\nglobalThis.consultar = (...args) => Estadisticas.consultar(...args);', context);
  const expectedClub = context.consultar(datos, { entidad: 'club' }, { rol: 'admin' }, AHORA).datos.asistenciaPct;
  const expectedTeam = context.consultar(datos, { entidad: 'equipo', id: 'equipo-cadete' }, { rol: 'admin' }, AHORA).datos.asistenciaPct;

  let html = await source('ui/Index.html');
  const includes = [...html.matchAll(/<\?!=\s*include\(['"]([^'"]+)['"]\)\s*\?>/g)];
  for (const match of includes) html = html.replace(match[0], await source(match[1] + '.html'));
  if (/<\?/.test(html)) throw new Error('Plantilla HtmlService sin resolver.');
  html = html.replace(/<script\b[^>]*src=["'][^"']*supabase[^"']*["'][^>]*>\s*<\/script>/gi, '');
  const shim = script(`(${installShim})(${json(datos)},${json(AHORA)});\n` +
    `const smokeBackend = (() => { const { Auth, getSheetData, Utilities, Logger, getSupabaseRealtimeConfig_ } = (${backendStubs})();\n` +
    config + '\n' + engine + '\n' + code + '\nreturn { cargarDatos, getEstadisticas }; })();\n' +
    `(${installRunner})(smokeBackend);`);
  html = html.replace('<head>', '<head>' + shim);
  const bodyEnd = html.lastIndexOf('</body>');
  if (bodyEnd < 0) throw new Error('Falta el cierre de body en Index.html.');
  html = html.slice(0, bodyEnd) + script(`(${driveViews})();`) + html.slice(bodyEnd);

  const output = await mkdtemp(join(tmpdir(), 'cb-baeza-smoke-'));
  const assembled = join(output, 'index.html');
  await writeFile(assembled, html);
  let browser;
  for (const candidate of ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe']) {
    try { await access(candidate); browser = candidate; break; } catch {}
  }
  if (!browser) throw new Error('No se encuentra Edge ni Chrome en las rutas documentadas. HTML: ' + assembled);

  const results = {};
  const checks = [];
  const check = (name, passed) => checks.push({ nombre: name, ok: Boolean(passed) });
  console.log('Smoke UI sin base de datos');
  console.log('Artefactos: ' + output);
  for (const role of ['admin', 'jugador']) {
    const screenshot = join(output, role + '.png');
    const url = pathToFileURL(assembled);
    url.searchParams.set('role', role);
    url.searchParams.set('final', role === 'admin' ? 'informes' : 'mi-equipo');
    const run = spawnSync(browser, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--force-device-scale-factor=1',
      '--allow-file-access-from-files', '--user-data-dir=' + join(output, 'profile-' + role),
      '--virtual-time-budget=15000', '--dump-dom', '--screenshot=' + screenshot,
      '--window-size=412,915', url.href,
    ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 90000, windowsHide: true });
    await writeFile(join(output, role + '.dom.html'), run.stdout || '');
    await writeFile(join(output, role + '.browser.log'), run.stderr || '');
    try {
      if (run.error) throw run.error;
      if (run.status !== 0) throw new Error('Navegador terminó con código ' + run.status);
      const match = /<pre\b[^>]*\bid="smoke-result"[^>]*>([\s\S]*?)<\/pre>/.exec(run.stdout);
      if (!match) throw new Error('Falta smoke-result; consultar DOM y browser.log.');
      const decoded = match[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      const result = results[role] = JSON.parse(decoded);
      await writeFile(join(output, role + '.json'), JSON.stringify(result, null, 2));
      check(role + ': errores vacíos', result.errores.length === 0);
      check(role + ': llamadas inesperadas vacías', result.llamadas.length === 0);
      for (const error of result.errores) console.log('  ERROR ' + role + ': ' + error);
      for (const call of result.llamadas) console.log('  LLAMADA ' + role + ': ' + JSON.stringify(call));
      await access(screenshot);
      await captureMobile(browser, url.href, output, role, screenshot);
      console.log('Captura ' + role + ': ' + screenshot);
    } catch (error) {
      check(role + ': ejecución del harness', false);
      console.log('  ERROR ' + role + ': ' + error.message);
    }
  }
  const admin = results.admin?.textos || {};
  const player = results.jugador?.textos || {};
  check('informes: asistencia del club ' + expectedClub + '%', (admin.informes || '').includes(expectedClub + '%'));
  check('equipo-detalle: asistencia ' + expectedTeam + '%', (admin['equipo-detalle'] || '').includes(expectedTeam + '%'));
  check('equipo-detalle: Cancelada', /Cancelada/i.test(admin['equipo-detalle'] || ''));
  const ranking = player['mi-equipo'] || '';
  check('mi-equipo: Tu posición', ranking.includes('Tu posición'));
  check('mi-equipo: sin Ausente ni Mayores ausencias', ranking.trim() && !/Ausente|Mayores ausencias/i.test(ranking));
  const motives = [...new Set(datos.asistJugadores.filter(row => row.ID_Jugador !== 'jugador-bruno')
    .flatMap(row => [row.MotivoCategoria, row.Motivo]).filter(Boolean))];
  check('mi-equipo: sin motivos ajenos', ranking.trim() && motives.every(motive => !ranking.includes(motive)));
  await writeFile(join(output, 'report.json'), JSON.stringify({ checks, resultados: results }, null, 2));
  for (const item of checks) console.log((item.ok ? 'PASS ' : 'FAIL ') + item.nombre);
  const failures = checks.filter(item => !item.ok).length;
  console.log(`${checks.length - failures}/${checks.length} comprobaciones correctas.`);
  if (failures) process.exitCode = 1;
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
