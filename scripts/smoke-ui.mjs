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
  const preferenceParams = new URLSearchParams(location.search);
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
  localStorage.setItem('cb_baeza_prefs', JSON.stringify({ idioma:preferenceParams.get('lang') || 'es', tema:preferenceParams.get('theme') || 'clasico' }));
  localStorage.setItem('cb_baeza_auth', JSON.stringify(window.__role === 'jugador'
    ? { tipo: 'jugador', usuario: 'bruno', pin: '1234' }
    : { tipo: 'entrenador', email: 'luis@example.test', pin: '1234' }));
}

// Only infrastructure is stubbed. Bootstrap and statistics endpoints below are real Code.gs.
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
              const accountAllowed = ['actualizarFotoPerfil','actualizarMiPerfil','cambiarCredenciales','cambiarCodigoSeguridad','enviarRecordatorioCredenciales'];
              if (accountAllowed.includes(String(name)) && new URLSearchParams(location.search).get('state')?.startsWith('cuenta-')) {
                (window.__accountCalls ||= []).push(String(name));
                const result = name === 'actualizarFotoPerfil' ? { success:true, fotoURL:args[1] }
                  : name === 'cambiarCredenciales' ? { success:true, auth:{ ...args[0], ...(args[1].usuarioNuevo ? {usuario:args[1].usuarioNuevo} : {}), ...(args[1].pinNuevo ? {pin:args[1].pinNuevo} : {}) } }
                  : name === 'actualizarMiPerfil' ? {success:true, actualizado:true} : {success:true, destinatarios:1};
                if (success) success(result,user);
                return;
              }
              if (name !== 'cargarDatos' && name !== 'getEstadisticas' && name !== 'getEstadisticasLote') {
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
  const result = { errores: window.__errors, llamadas: window.__calls, textos: {}, inmediatas: {}, info: {}, rachas: {}, interacciones: {} };
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
      // dump-dom virtual time can suspend animation frames; flush the already-requested data render.
      if (!window.__pending && !loading && App.stats._renderPending) {
        App.stats._renderPending = false;
        if (!App.state._formIsDirty) App.navigate(App.state.currentView, {}, false);
      }
      const animating = [...document.querySelectorAll('.view.active .stats-ring')].some(element =>
        element.dataset.ringValue !== '' &&
        element.querySelector('.stats-ring-number').textContent !== Number(element.dataset.ringValue) + '%');
      idle = !window.__pending && !loading && !animating ? idle + 1 : 0;
      if (idle === 2) return;
    }
    throw new Error('Tiempo agotado esperando estadísticas de ' + App.state.currentView);
  }
  async function run() {
    try {
      await settle();
      if (!App.cache.temporadas.length || App.state.rol !== window.__role) throw new Error('Bootstrap incompleto para ' + window.__role);
      if (window.__role === 'admin') {
        App.state.detalleEquipoId = 'equipo-cadete';
        for (const view of ['equipo-detalle', 'informes']) {
          App.navigate(view, {}, false);
          const element = document.getElementById('view-' + view);
          result.inmediatas[view] = Boolean(element && element.classList.contains('active') &&
            element.innerText.trim() && !element.querySelector('.stat-skeleton'));
          if (!result.inmediatas[view]) result.errores.push(view + ': estadísticas no renderizadas inmediatamente tras bootstrap/precarga');
        }
      }
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
          result.info[view] = element.querySelectorAll('.stats-info-button').length;
          result.rachas[view] = Boolean(element.querySelector('.stats-streak .stats-streak-count'));
          if (view === 'equipos') {
            const badge = element.querySelector('.btn-eq-asist .eq-pending-badge');
            if (!badge || badge.textContent !== '!' || !/1 entreno sin registrar|1 unrecorded training session/.test(badge.getAttribute('aria-label'))) throw new Error('Inicio sin indicador compacto de entrenamientos pendientes');
            if (/Último entreno|sin registrar/.test(element.innerText)) throw new Error('Inicio muestra detalles antiguos o pendientes fuera del botón');
            if (!element.querySelector('.eq-home-bar') || !/en plantilla|Próximo entreno|in the squad|Next training/.test(element.innerText)) throw new Error('Inicio sin nuevas métricas de equipo');
            if (element.querySelector('.eq-notifications, .eq-notifications-count')) throw new Error('Inicio duplica las notificaciones de pendientes fuera del botón de asistencia');
          }
          if (['perfil-jugador','mis-stats','jugador-detalle'].includes(view)) {
            const streak = element.querySelector('.stats-streak');
            if (!streak || streak.getBoundingClientRect().height > 90 || !/sesiones seguidas|consecutive sessions/.test(streak.innerText) || !/Récord:|Record:/.test(streak.innerText)) throw new Error('Racha ausente o no compacta');
          }
          if (view === 'informes') {
            const contact = App.stats.detalle('club').data.datos.contactabilidad;
            const chart = element.querySelector('.contactability');
            if (!chart || chart.querySelectorAll('.contact-team').length !== contact.porEquipo.length || chart.querySelectorAll('.contact-missing-row').length !== contact.sinContactoLista.length) throw new Error('Contactabilidad incompleta');
            if (chart.querySelectorAll('[data-stats-tip]').length < 3 || chart.querySelectorAll('.stats-info-button').length < 4) throw new Error('Contactabilidad sin ayudas ni detalles interactivos');
            const sum = _statsContactoSegmentos(contact).reduce((n,s) => n+s.n,0);
            if (sum !== contact.jugadoresActivos) throw new Error('Categorías de contacto no cubren la plantilla sin solaparse');
            const button = chart.querySelector('.contact-missing-row button');
            if (!button) throw new Error('Fixture sin jugador pendiente de contacto');
            button.click();
            if (App.state.currentView !== 'jugador-detalle' || !contact.sinContactoLista.some(j => j.jugadorId === App.state.detalleJugadorId)) throw new Error('La lista de contacto no abre la ficha del jugador');
            App.navigate('informes',{},false);
          }
          if (/\bbase\b|\bpp\b|P\/A\/R|computables/i.test(element.textContent)) throw new Error('Texto técnico visible en estadísticas de ' + view);
          if (window.__role === 'admin' && view === 'informes') {
            const descargar = _csvDescargar;
            result.csv = [];
            try {
              _csvDescargar = (nombre, filas) => result.csv.push({ nombre, filas });
              App.views.informes.exportar();
            } finally { _csvDescargar = descargar; }
          }
          if (window.__role === 'admin' && view === 'informes') {
            const button = [...element.querySelectorAll('button[onclick]')].find(button =>
              button.getAttribute('onclick').includes("App.views['equipo-detalle'].cargar("));
            if (!button) throw new Error('Informes sin botón de detalle de equipo');
            App.state.detalleEquipoId = null;
            button.click();
            result.navegacionEquipo = App.state.currentView === 'equipo-detalle' &&
              Boolean(App.cache.equipos.find(equipo => equipo.ID === App.state.detalleEquipoId)) &&
              document.getElementById('view-equipo-detalle').classList.contains('active');
            if (!result.navegacionEquipo) throw new Error('El botón de informes no abre el detalle del equipo');
          }
        } catch (error) { result.errores.push(view + ': ' + (error.stack || error.message)); }
      }
      const finalView = new URLSearchParams(location.search).get('final') || views.at(-1);
      if (views.includes(finalView)) {
        App.state.detalleEquipoId = 'equipo-cadete';
        App.state.detalleJugadorId = 'jugador-bruno';
        App.state.detalleEntrenadorId = 'entrenador-luis';
        App.navigate(finalView, {}, false);
        await settle();
      }
      const state = new URLSearchParams(location.search).get('state');
      const preferenceView = new URLSearchParams(location.search).get('prefsView');
      if (['ajustes','login','sesiones','sesion','historial-equipo','gestion','equipo-form','jugador-form','entrenador-form'].includes(preferenceView)) {
        App.state.equipoSesionesId = 'equipo-cadete';
        App.state._equipoNombre = App.cache.getEquipoById('equipo-cadete').Nombre;
        App.state.sesionId = App.cache.sesiones.find(s => s.ID_Equipo === 'equipo-cadete' && !s.Cancelada).ID;
        App.navigate(preferenceView,{},false);
        await settle();
      }
      const active = document.querySelector('.view.active');
      if (state === 'info') {
        const button = active.querySelector('.stats-info-button');
        if (!button) throw new Error('No hay botón de información');
        button.click();
        result.interacciones.info = Boolean(document.querySelector('#modal-overlay.open'));
        if (!result.interacciones.info) throw new Error('No se abrió la ficha de información');
      } else if (state === 'temporadas') {
        const button = active.querySelector('.stats-season-pill');
        if (!button) throw new Error('No hay selector de temporada');
        button.click();
        result.interacciones.temporadas = Boolean(document.querySelector('.stats-season-option'));
        if (!result.interacciones.temporadas) throw new Error('No se abrió el selector de temporada');
      } else if (state === 'tooltip') {
        const point = active.querySelector('[data-stats-tip]');
        if (!point) throw new Error('No hay punto de gráfico interactivo');
        point.scrollIntoView({ block: 'center' });
        point.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        const tooltip = document.getElementById('stats-chart-tooltip');
        result.interacciones.tooltip = Boolean(tooltip && !tooltip.hidden && tooltip.textContent.trim());
        if (!result.interacciones.tooltip) throw new Error('No se abrió el detalle del gráfico');
      } else if (state === 'contacto') {
        active.querySelector('button[aria-label="Contacto del jugador"]').click();
        if (!document.querySelector('.stats-contact-sheet')) throw new Error('No se abrió el contacto rápido');
      } else if (['mensual','cobertura','pendientes'].includes(state)) {
        const selectors = { mensual: '.stats-columns', cobertura: '.stats-coverage', pendientes: '.stats-pending-list, .stats-pending-clear' };
        const section = active.querySelector(selectors[state]);
        if (!section) throw new Error('No existe sección de ' + state);
        section.closest('.stats-block').scrollIntoView({ block: 'start' });
      }
      if (!['tooltip','mensual','cobertura','pendientes'].includes(state)) window.scrollTo(0, 0);
      if (state === 'contactabilidad') {
        const chart = active.querySelector('.contactability');
        if (!chart) throw new Error('No existe bloque de contactabilidad');
        chart.closest('.stats-block').scrollIntoView({ block:'start' });
      }
      if (state?.startsWith('cuenta-')) {
        const accountState = state.slice(7);
        if (accountState === 'menu') {
          App.toggleUserMenu();
          const menu = document.getElementById('user-menu');
          if (menu.classList.contains('hidden') || menu.querySelectorAll('[role="menuitem"]').length !== 4) throw new Error('Menú de cuenta incompleto');
          if (document.activeElement !== menu.querySelector('button')) throw new Error('El menú no recibe el foco');
          document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
          if (document.activeElement !== document.getElementById('user-badge')) throw new Error('Escape no devuelve el foco');
          App.toggleUserMenu();
        } else {
          const view = accountState === 'avatar' ? 'perfil-usuario' : accountState;
          App.navigate(view,{},false);
          if (!document.getElementById('view-'+view)?.classList.contains('active')) throw new Error('Vista de cuenta no disponible: '+view);
          if (accountState === 'avatar') {
            await App.views['perfil-usuario'].guardarFoto('avatar:balon');
            await settle();
            App.views['perfil-usuario'].elegirFoto();
            if (document.querySelectorAll('.avatar-choice').length < 12) throw new Error('Faltan avatares de club');
          }
          if (accountState === 'perfil-usuario' && window.__role === 'jugador' && document.querySelectorAll('.account-check input').length !== 2) throw new Error('Faltan preferencias familiares');
          if (accountState === 'seguridad' && !document.getElementById('seg-pin-actual')) throw new Error('Falta el PIN actual');
          if (accountState === 'politicas' && !document.getElementById('politica-cookies')) throw new Error('Falta política de cookies');
        }
        result.cuenta = {estado:accountState,llamadas:window.__accountCalls || []};
        window.scrollTo(0,0);
      }
      if (state) await new Promise(resolve => setTimeout(resolve, 350));
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
    const { result: smoke } = await send('Runtime.evaluate', { expression: 'document.getElementById("smoke-result").textContent', returnByValue: true }, sessionId);
    const report = JSON.parse(smoke.value);
    await writeFile(screenshot.replace(/\.png$/, '.json'), JSON.stringify(report,null,2));
    if (new URL(url).searchParams.get('lang') === 'en') {
      const { result: audit } = await send('Runtime.evaluate', { expression: `JSON.stringify((() => {
        const words = /\\b(?:asistencia|puntualidad|sesiones|entrenamientos|jugadores|entrenadores|ausencias|retrasos|guardar|cancelar|ajustes|equipo|equipos|racha|seguidas|temporada|contactabilidad|correo|teléfono|registrar|pendientes|programadas|seleccionar|idioma|apariencia|privacidad|seguridad|cargando|repetir|espacio|elige|elegir|datos|significa|suficientes|récord|semanas|puntos|personaliza|imagen|nacimiento|apellidos|contraseña|credenciales|recordatorio|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|nuevo|nueva|añadir|seleccionado|vacío|usará|categoría|próximo|próxima)\\b/i;
        const residual = [];
        const walker = document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
        while(walker.nextNode()) {
          const node = walker.currentNode, parent = node.parentElement;
          if (!parent || parent.closest('script,style,[data-no-i18n],[translate="no"],#smoke-result') || !parent.getClientRects().length) continue;
          const text = node.nodeValue.trim();
          if (text && words.test(text)) residual.push(text);
        }
        return [...new Set(residual)];
      })())`, returnByValue:true }, sessionId);
      const residual = JSON.parse(audit.value);
      const { result: preferences } = await send('Runtime.evaluate', { expression:'JSON.stringify({theme:document.documentElement.dataset.theme,language:document.documentElement.lang})', returnByValue:true },sessionId);
      const applied = JSON.parse(preferences.value), expected = new URL(url).searchParams;
      if (applied.theme !== expected.get('theme') || applied.language !== expected.get('lang')) throw new Error('Preferencias no aplicadas: ' + preferences.value);
      await writeFile(screenshot.replace(/\.png$/, '-es-residual.json'), JSON.stringify(residual,null,2));
      console.log('EN Spanish-only residuals ' + role + ': ' + JSON.stringify(residual));
    }
    if (report.errores.length) throw new Error(report.errores.join('\n'));
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
    config + '\n' + engine + '\n' + code + '\nreturn { cargarDatos, getEstadisticas, getEstadisticasLote }; })();\n' +
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
      const mobileViews = role === 'admin'
        ? ['equipos', 'equipos-admin', 'jugadores-admin', 'entrenadores-admin', 'equipo-detalle', 'jugador-detalle', 'entrenador-detalle', 'informes']
        : ['perfil-jugador', 'mis-stats', 'mi-equipo'];
      for (const view of mobileViews) {
        url.searchParams.set('final', view);
        const mobileScreenshot = join(output, role + '-' + view + '-412x915.png');
        await captureMobile(browser, url.href, output, role + '-' + view, mobileScreenshot);
        console.log('Captura ' + role + '/' + view + ' (412x915): ' + mobileScreenshot);
      }
      const states = [['info', role === 'admin' ? 'informes' : 'mis-stats'], ['temporadas', role === 'admin' ? 'informes' : 'mis-stats'], ['tooltip', role === 'admin' ? 'equipo-detalle' : 'mis-stats'], ['mensual', role === 'admin' ? 'equipo-detalle' : 'mis-stats']];
      if (role === 'admin') states.push(['contacto','jugador-detalle'],['cobertura','equipo-detalle'],['pendientes','equipo-detalle']);
      if (role === 'admin') states.push(['contactabilidad','informes']);
      for (const state of ['menu','perfil-usuario','avatar','seguridad','politicas']) states.push(['cuenta-'+state,role === 'admin' ? 'equipos' : 'perfil-jugador']);
      for (const [state, view] of states) {
        url.searchParams.set('final', view);
        url.searchParams.set('state', state);
        const screenshotState = join(output, role + '-' + state + '-412x915.png');
        await captureMobile(browser, url.href, output, role + '-' + state, screenshotState);
        check(role + ': interacción ' + state, true);
        console.log('Captura ' + role + '/' + state + ' (412x915): ' + screenshotState);
      }
      url.searchParams.delete('state');
      for (const theme of ['noche','medianoche']) {
        for (const view of role === 'admin' ? ['equipos','equipos-admin','jugadores-admin','entrenadores-admin','equipo-detalle','jugador-detalle','entrenador-detalle','informes','ajustes','login','sesiones','sesion','historial-equipo','gestion','equipo-form','jugador-form','entrenador-form'] : ['perfil-jugador','mis-stats','mi-equipo','ajustes']) {
          const preferenceUrl = new URL(url.href);
          preferenceUrl.searchParams.set('theme',theme);
          preferenceUrl.searchParams.set('lang','en');
          preferenceUrl.searchParams.set('final',view);
          if (['ajustes','login','sesiones','sesion','historial-equipo','gestion','equipo-form','jugador-form','entrenador-form'].includes(view)) preferenceUrl.searchParams.set('prefsView',view);
          const name = role + '-' + theme + '-en-' + view;
          await captureMobile(browser,preferenceUrl.href,output,name,join(output,name + '-412x915.png'));
          check(name + ': captura de tema e idioma',true);
        }
        for (const state of ['cuenta-menu','cuenta-perfil-usuario','cuenta-avatar','cuenta-seguridad','cuenta-politicas','info','temporadas','contactabilidad']) {
          if (state === 'contactabilidad' && role !== 'admin') continue;
          const preferenceUrl = new URL(url.href);
          preferenceUrl.searchParams.set('theme',theme);
          preferenceUrl.searchParams.set('lang','en');
          preferenceUrl.searchParams.set('final',state.startsWith('cuenta-') ? (role === 'admin' ? 'equipos' : 'perfil-jugador') : (role === 'admin' ? 'informes' : 'mis-stats'));
          preferenceUrl.searchParams.set('state',state);
          const name = role + '-' + theme + '-en-' + state;
          await captureMobile(browser,preferenceUrl.href,output,name,join(output,name + '-412x915.png'));
          check(name + ': captura de tema e idioma',true);
        }
      }
    } catch (error) {
      check(role + ': ejecución del harness', false);
      console.log('  ERROR ' + role + ': ' + error.message);
    }
  }
  const admin = results.admin?.textos || {};
  const player = results.jugador?.textos || {};
  for (const view of ['equipo-detalle', 'informes']) {
    check(view + ': estadísticas inmediatas sin skeleton tras bootstrap/precarga', results.admin?.inmediatas?.[view]);
  }
  check('informes: botón de equipo navega al detalle', results.admin?.navegacionEquipo);
  check('informes: asistencia del club ' + expectedClub + '%', (admin.informes || '').includes(expectedClub + '%'));
  check('equipo-detalle: asistencia ' + expectedTeam + '%', (admin['equipo-detalle'] || '').includes(expectedTeam + '%'));
  check('equipo-detalle: Cancelada', /Cancelada/i.test(admin['equipo-detalle'] || ''));
  check('informes: sin alertas de jugadores ni pendientes de registrar', Boolean(admin.informes) && !/Alertas de jugadores|pendientes de registrar/i.test(admin.informes));
  const exports = results.admin?.csv || [];
  check('informes: exportación sin CSV de alertas', exports.length === 1 && exports[0].nombre === 'club-equipos.csv' && !/alerta|pendiente/i.test(JSON.stringify(exports)));
  for (const [role, result] of Object.entries(results)) {
    for (const [view, text] of Object.entries(result.textos)) {
      check(role + '/' + view + ': sin jerga técnica', !/\bbase\b|\bpp\b|P\/A\/R|computables/i.test(text));
      check(role + '/' + view + ': información de indicadores', result.info[view] > 0);
    }
  }
  for (const view of ['perfil-jugador', 'mis-stats']) check(view + ': racha protagonista', results.jugador?.rachas?.[view]);
  const ranking = player['mi-equipo'] || '';
  check('mi-equipo: Tu posición', ranking.includes('Tu posición'));
  check('mi-equipo: sin Ausente ni Mayores ausencias', ranking.trim() && !/Ausente|Mayores ausencias/i.test(ranking));
  const motives = [...new Set(datos.asistJugadores.filter(row => row.ID_Jugador !== 'jugador-bruno')
    .flatMap(row => [row.MotivoCategoria, row.Motivo]).filter(Boolean))];
  check('mi-equipo: sin motivos ajenos', ranking.trim() && motives.every(motive => !ranking.includes(motive)));
  check('Inicio: nuevo diseño sin última sesión', /en plantilla/.test(admin.equipos || '') && !/Último entreno/.test(admin.equipos || ''));
  check('Informes: contacto global, por equipo y lista accionable', /localizables/.test(admin.informes || '') && /Vías de contacto por equipo/.test(admin.informes || '') && /Jugadores sin ningún contacto/.test(admin.informes || ''));
  await writeFile(join(output, 'report.json'), JSON.stringify({ checks, resultados: results }, null, 2));
  for (const item of checks) console.log((item.ok ? 'PASS ' : 'FAIL ') + item.nombre);
  const failures = checks.filter(item => !item.ok).length;
  console.log(`${checks.length - failures}/${checks.length} comprobaciones correctas.`);
  if (failures) process.exitCode = 1;
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
