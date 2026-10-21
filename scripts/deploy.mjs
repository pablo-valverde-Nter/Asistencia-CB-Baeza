import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import open from 'open';
import {
  ENVIRONMENTS,
  SCRIPT_ID,
  assertBranch,
  assertDeploymentEnvironment,
  buildPayload,
  compareFileSets,
  configIssues,
  extractSupabaseEnvironment,
  normalizeSupabaseUrl,
  publishDev,
  publishPro,
  requireProConfirmation,
  validateBuildTemplate,
  validateSetupValues,
} from './deploy-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = path.join(ROOT, 'deploy.config.json');
const LOCK_PATH = path.join(ROOT, '.deploy.lock');
const CLASP_ENTRY = path.join(ROOT, 'node_modules', '@google', 'clasp', 'build', 'src', 'index.js');
const EXPECTED_CLASP_VERSION = '3.3.0';

function run(command, args, { cwd = ROOT, maxBuffer = 4 * 1024 * 1024 } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer,
    stdio: 'pipe',
    env: process.env,
  });
  if (result.error || result.status !== 0) {
    const detail = result.error ? 'no se pudo iniciar el proceso' : `código ${result.status}`;
    const error = new Error(`${path.basename(command)} ${args[0] || ''} falló (${detail}).`);
    error.stderr = result.stderr?.trim();
    throw error;
  }
  return result.stdout;
}

function runGit(args, options) {
  return run('git', args, options).trim();
}

function parseJsonOutput(output, label) {
  const text = output.trim();
  for (const opening of ['[', '{']) {
    const start = text.indexOf(opening);
    const closing = opening === '[' ? ']' : '}';
    const end = text.lastIndexOf(closing);
    if (start < 0 || end < start) continue;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      // Try the other JSON root shape before returning a non-sensitive error.
    }
  }
  throw new Error(`clasp no devolvió JSON válido al ejecutar ${label}.`);
}

function runClasp(args, { cwd = ROOT } = {}) {
  try {
    return run(process.execPath, [CLASP_ENTRY, ...args], { cwd });
  } catch (error) {
    const command = args[0] || 'comando';
    throw new Error(`clasp ${command} falló: ${error.stderr || error.message}`);
  }
}

function claspJson(args, label, options) {
  return parseJsonOutput(runClasp([...args, '--json'], options), label);
}

async function checkPinnedClasp() {
  let pkg;
  try {
    pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'node_modules', '@google', 'clasp', 'package.json'), 'utf8'));
  } catch {
    throw new Error('Falta @google/clasp. Ejecuta npm install antes de publicar.');
  }
  if (pkg.version !== EXPECTED_CLASP_VERSION) {
    throw new Error(`Se requiere @google/clasp ${EXPECTED_CLASP_VERSION}; instalada: ${pkg.version}. Ejecuta npm install.`);
  }
}

async function readConfig() {
  try {
    return { config: JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8')), parseError: null };
  } catch (error) {
    if (error.code === 'ENOENT') return { config: null, parseError: null };
    return { config: null, parseError: 'deploy.config.json no se pudo leer como JSON.' };
  }
}

function printIssues(issues) {
  if (issues.length) {
    for (const issue of issues) console.log(`  - ${issue}`);
    return false;
  }
  console.log('  Configuración local completa y consistente.');
  return true;
}

function configValidation(config, parseError) {
  return parseError ? [parseError] : configIssues(config);
}

function getCurrentBranch() {
  return runGit(['branch', '--show-current']) || null;
}

function getHeadSha() {
  return runGit(['rev-parse', 'HEAD']);
}

function isWorktreeClean() {
  return runGit(['status', '--porcelain', '--untracked-files=all']) === '';
}

function getCachedOriginSha(branch) {
  try {
    return runGit(['rev-parse', `refs/remotes/origin/${branch}`]);
  } catch {
    return null;
  }
}

function assertCleanBranchAndPush(environment, { fetchRemote }) {
  const branch = getCurrentBranch();
  assertBranch(environment, branch);
  if (!isWorktreeClean()) throw new Error('El worktree debe estar limpio; no se ha publicado nada.');
  if (fetchRemote) {
    const remoteBranch = ENVIRONMENTS[environment].branch;
    runGit(['fetch', '--quiet', 'origin', `refs/heads/${remoteBranch}:refs/remotes/origin/${remoteBranch}`]);
  }
  const remoteSha = getCachedOriginSha(ENVIRONMENTS[environment].branch);
  const sha = getHeadSha();
  if (!remoteSha) throw new Error(`No existe refs/remotes/origin/${ENVIRONMENTS[environment].branch}; no se puede comprobar el push.`);
  if (remoteSha !== sha) throw new Error(`HEAD ${sha} no coincide con origin/${ENVIRONMENTS[environment].branch} (${remoteSha}); publica primero ese commit.`);
  return { branch, sha };
}

function assertCheckoutUnchanged(environment, expected) {
  assertBranch(environment, getCurrentBranch());
  if (!isWorktreeClean() || getHeadSha() !== expected.sha || getCachedOriginSha(expected.branch) !== expected.sha) {
    throw new Error('La rama, HEAD, origin/<rama> o worktree cambió durante el preflight; no se ha publicado nada.');
  }
}

function listCommittedSourcePaths() {
  const names = runGit(['ls-tree', '-r', '--name-only', 'HEAD', '--', 'src', 'ui', 'appsscript.json'])
    .split('\n')
    .filter(Boolean);
  const included = names.filter(name => name === 'appsscript.json' || /^src\/.+\.gs$/i.test(name) || /^ui\/.+\.html$/i.test(name));
  if (!included.includes('appsscript.json') || !included.includes('src/Config.gs')) {
    throw new Error('HEAD debe contener appsscript.json y src/Config.gs como archivos versionados.');
  }
  return included;
}

function readHeadSources() {
  const sources = new Map();
  for (const repositoryPath of listCommittedSourcePaths()) {
    if (sources.has(repositoryPath)) throw new Error(`Ruta GAS duplicada: ${repositoryPath}.`);
    const content = run('git', ['show', `HEAD:${repositoryPath}`], { maxBuffer: 4 * 1024 * 1024 }).replace(/\r\n?/g, '\n');
    sources.set(repositoryPath, content);
  }
  return sources;
}

function buildSources(environment, supabaseUrl) {
  const sources = readHeadSources();
  try {
    JSON.parse(sources.get('appsscript.json'));
  } catch {
    throw new Error('HEAD contiene un appsscript.json inválido.');
  }
  return buildPayload(sources, environment, supabaseUrl);
}

async function writeBuild(sources, directory) {
  await fs.mkdir(directory, { recursive: true });
  for (const [filename, content] of sources) {
    const target = path.join(directory, filename);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
  }
  await fs.writeFile(path.join(directory, '.clasp.json'), JSON.stringify({ scriptId: SCRIPT_ID, rootDir: '.' }, null, 2), 'utf8');
}

async function readProjectFiles(directory) {
  const files = new Map();
  async function visit(current) {
    for (const item of await fs.readdir(current, { withFileTypes: true })) {
      if (item.name === '.clasp.json' || item.name === '.claspignore') continue;
      const absolute = path.join(current, item.name);
      if (item.isDirectory()) await visit(absolute);
      else if (item.isFile()) {
        const relative = path.relative(directory, absolute).split(path.sep).join('/');
        files.set(relative, await fs.readFile(absolute, 'utf8'));
      }
    }
  }
  await visit(directory);
  return files;
}

async function cloneFiles(version) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cbba-clasp-clone-'));
  try {
    const args = ['clone-script', SCRIPT_ID];
    if (version !== null) args.push(String(version));
    args.push('--rootDir', '.', '--json');
    runClasp(args, { cwd: directory });
    return { directory, files: await readProjectFiles(directory) };
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function removeClone(clone) {
  if (clone) await fs.rm(clone.directory, { recursive: true, force: true });
}

function getDeployments() {
  const response = claspJson(['list-deployments', SCRIPT_ID], 'list-deployments');
  if (!Array.isArray(response)) throw new Error('clasp list-deployments devolvió una respuesta inesperada.');
  return response;
}

function findDeployment(deployments, environment, config) {
  const deploymentId = config.environments[environment].deploymentId;
  const matches = deployments.filter(deployment => deployment.deploymentId === deploymentId);
  if (matches.length !== 1) throw new Error(`El deployment ID configurado para ${environment} no aparece exactamente una vez en Apps Script.`);
  const deployment = matches[0];
  const version = Number(deployment.versionNumber);
  if (!Number.isSafeInteger(version) || version < 1) throw new Error(`El deployment ${environment} no apunta a una versión inmutable válida.`);
  return { deployment, version };
}

function getWebAppUrl(deploymentId, cwd) {
  const result = claspJson(['open-web-app', deploymentId], 'open-web-app', { cwd });
  if (!result || typeof result.url !== 'string') throw new Error(`El deployment ${deploymentId} no tiene una URL de Web App.`);
  let url;
  try {
    url = new URL(result.url);
  } catch {
    throw new Error(`El deployment ${deploymentId} devolvió una URL no válida.`);
  }
  const expectedPath = `/macros/s/${deploymentId}/exec`;
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'script.google.com' ||
    url.pathname !== expectedPath ||
    url.search ||
    url.hash
  ) {
    throw new Error(`El deployment ${deploymentId} no devolvió su URL HTTPS /exec de Apps Script Web App.`);
  }
  return url.toString();
}

async function inspectDeployment(environment, deployments, config) {
  const { deployment, version } = findDeployment(deployments, environment, config);
  const clone = await cloneFiles(version);
  try {
    const actualEnvironment = extractSupabaseEnvironment(clone.files);
    assertDeploymentEnvironment(environment, actualEnvironment);
    const url = getWebAppUrl(deployment.deploymentId, clone.directory);
    return { deployment, version, url, actualEnvironment };
  } finally {
    await removeClone(clone);
  }
}

async function inspectBothDeployments(config) {
  const deployments = getDeployments();
  const details = {};
  for (const environment of ['DEV', 'PRO']) {
    details[environment] = await inspectDeployment(environment, deployments, config);
  }
  return { deployments, details };
}

async function validateDevRelease(config, deployments, expectedDescription, devBuild) {
  const { deployment, version } = findDeployment(deployments, 'DEV', config);
  if (deployment.description !== expectedDescription) {
    throw new Error(`No se publica PRO: DEV debe tener descripción ${expectedDescription}.`);
  }
  const versions = claspJson(['list-versions', SCRIPT_ID], 'list-versions');
  if (!Array.isArray(versions)) throw new Error('clasp list-versions devolvió una respuesta inesperada.');
  const immutable = versions.find(entry => Number(entry.versionNumber) === version);
  if (!immutable || immutable.description !== expectedDescription) {
    throw new Error(`No se publica PRO: la versión DEV ${version} no tiene la descripción exacta ${expectedDescription}.`);
  }
  const clone = await cloneFiles(version);
  try {
    const difference = compareFileSets(devBuild, clone.files);
    if (!difference.equal) {
      throw new Error(`No se publica PRO: la versión DEV ${version} no coincide con el build de este SHA (${differenceSummary(difference)}).`);
    }
  } finally {
    await removeClone(clone);
  }
}

function differenceSummary(difference) {
  const parts = [];
  if (difference.missing.length) parts.push(`faltan ${difference.missing.join(', ')}`);
  if (difference.extra.length) parts.push(`sobran ${difference.extra.join(', ')}`);
  if (difference.changed.length) parts.push(`difieren ${difference.changed.join(', ')}`);
  return parts.join('; ') || 'diferencia desconocida';
}

function makeOperations({ config, environment, urls, buildDirectories, expectedCheckout }) {
  const targetDeploymentId = config.environments[environment].deploymentId;
  const targetUrl = urls[environment];
  const readCurrentDeployments = () => getDeployments();

  return {
    async beforePush() {
      assertCheckoutUnchanged(environment, expectedCheckout);
    },
    async push(directory) {
      runClasp(['push', '--force'], { cwd: directory });
    },
    createVersion(description) {
      const result = claspJson(['create-version', description], 'create-version', { cwd: buildDirectories[environment] });
      return result.versionNumber;
    },
    async verifyImmutableVersion(version, description, build) {
      const versions = claspJson(['list-versions', SCRIPT_ID], 'list-versions');
      if (!Array.isArray(versions)) throw new Error('clasp list-versions devolvió una respuesta inesperada.');
      const record = versions.find(entry => Number(entry.versionNumber) === version);
      if (!record || record.description !== description) throw new Error(`La versión ${version} no conserva la descripción esperada.`);
      const clone = await cloneFiles(version);
      try {
        const difference = compareFileSets(build, clone.files);
        if (!difference.equal) throw new Error(`La versión inmutable ${version} no coincide con el build (${differenceSummary(difference)}).`);
      } finally {
        await removeClone(clone);
      }
    },
    async verifyDevRelease(description, build) {
      await validateDevRelease(config, readCurrentDeployments(), description, build);
    },
    async verifyHead(build) {
      const clone = await cloneFiles(null);
      try {
        const difference = compareFileSets(build, clone.files);
        if (!difference.equal) throw new Error(`HEAD remoto no quedó restaurado al build DEV (${differenceSummary(difference)}).`);
      } finally {
        await removeClone(clone);
      }
    },
    async updateDeployment(deploymentId, version, description) {
      let result;
      try {
        result = claspJson([
          'update-deployment', deploymentId, '-V', String(version), '-d', description,
        ], 'update-deployment', { cwd: buildDirectories[environment] });
      } catch (error) {
        throw new Error(`update-deployment no confirmó respuesta; el deployment puede haberse actualizado. Comprueba deploy:doctor antes de reintentar. ${error.message}`);
      }
      if (result.deploymentId !== deploymentId || Number(result.versionNumber) !== version || result.description !== description) {
        throw new Error('update-deployment devolvió datos inesperados; el deployment puede haberse actualizado. Comprueba deploy:doctor antes de reintentar.');
      }
    },
    async verifyDeployment(deploymentId, version, description) {
      const refreshed = readCurrentDeployments();
      const current = refreshed.find(entry => entry.deploymentId === deploymentId);
      if (!current || Number(current.versionNumber) !== version || current.description !== description) {
        throw new Error('Apps Script no confirma la versión y descripción esperadas; el deployment puede haberse actualizado. Comprueba deploy:doctor; no se abrió el navegador.');
      }
    },
    async openWebApp() {
      console.log(`Publicado ${environment}: ${targetDeploymentId}`);
      console.log(`URL: ${targetUrl}`);
      try {
        await open(targetUrl, { wait: false });
      } catch {
        console.error(`El deployment ya está publicado, pero no se pudo abrir el navegador. Abre manualmente: ${targetUrl}`);
      }
    },
  };
}

function parseSetupArgs(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    const mapping = {
      '--dev-id': 'devId',
      '--pro-id': 'proId',
      '--dev-url': 'devUrl',
      '--pro-url': 'proUrl',
    };
    if (!Object.hasOwn(mapping, name) || values[mapping[name]] !== undefined || !args[index + 1] || args[index + 1].startsWith('--')) {
      throw new Error('Uso: npm run deploy:setup -- --dev-id ID --pro-id ID --dev-url https://ref.supabase.co --pro-url https://ref.supabase.co');
    }
    values[mapping[name]] = args[index + 1];
    index += 1;
  }
  if (Object.keys(values).length !== 4) throw new Error('Setup requiere --dev-id, --pro-id, --dev-url y --pro-url.');
  return values;
}

async function setup(args) {
  const values = validateSetupValues(parseSetupArgs(args));
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(values, null, 2)}\n`, 'utf8');
  console.log('deploy.config.json configurado. No se ha iniciado sesión ni se ha escrito en Apps Script o Supabase.');
}

async function doctor() {
  console.log('Diagnóstico local Apps Script');
  const { config, parseError } = await readConfig();
  const issues = configValidation(config, parseError);
  console.log('Configuración:');
  printIssues(issues);
  let failed = issues.length > 0;

  let auth;
  try {
    auth = claspJson(['show-authorized-user'], 'show-authorized-user');
    if (!auth.loggedIn) {
      console.log('Autenticación clasp: no hay sesión local. Ejecuta npx clasp login; este diagnóstico no abre navegador ni inicia sesión.');
      failed = true;
      process.exitCode = 1;
      return;
    }
    console.log('Autenticación clasp: sesión local disponible.');
  } catch (error) {
    console.log(`Autenticación clasp: no se pudo consultar (${error.message}).`);
    process.exitCode = 1;
    return;
  }

  let deployments;
  try {
    deployments = getDeployments();
    console.log(`Deployments remotos del proyecto: ${deployments.length}`);
    for (const deployment of deployments) {
      console.log(`  ${deployment.deploymentId} @${deployment.versionNumber ?? 'sin versión'} ${deployment.description || ''}`.trimEnd());
    }
  } catch (error) {
    console.log(`No se pudo listar deployments: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  if (config?.environments && typeof config.environments === 'object') {
    for (const environment of ['DEV', 'PRO']) {
      const entry = config.environments[environment];
      if (!entry || typeof entry.deploymentId !== 'string' || !entry.deploymentId) continue;
      try {
        const inspected = await inspectDeployment(environment, deployments, config);
        console.log(`${environment}: ID reconocido, WEB_APP ${inspected.url}, SUPABASE_ENV=${inspected.actualEnvironment}.`);
      } catch (error) {
        console.log(`${environment}: comprobación remota fallida (${error.message}).`);
        failed = true;
      }
    }
  }
  if (failed) process.exitCode = 1;
}

async function dryRun(environment) {
  console.log(`DRY-RUN ${environment}: sin autenticación clasp, fetch ni escrituras remotas.`);
  const { config, parseError } = await readConfig();
  const issues = configValidation(config, parseError);
  if (issues.length) {
    console.log('Configuración incompleta:');
    for (const issue of issues) console.log(`  - ${issue}`);
  }
  const localErrors = [];
  let branch;
  try {
    branch = getCurrentBranch();
    assertBranch(environment, branch);
    console.log(`Rama: ${branch} (correcta).`);
  } catch (error) {
    localErrors.push(error.message);
  }
  try {
    if (!isWorktreeClean()) throw new Error('El worktree no está limpio.');
    console.log('Worktree: limpio.');
  } catch (error) {
    localErrors.push(error.message);
  }
  try {
    const sha = getHeadSha();
    const cachedRemote = getCachedOriginSha(ENVIRONMENTS[environment].branch);
    if (!cachedRemote) throw new Error(`No hay ref origin/${ENVIRONMENTS[environment].branch} en caché; un deploy real hará fetch para verificar el SHA.`);
    if (cachedRemote !== sha) throw new Error(`HEAD ${sha} no coincide con el origin/${ENVIRONMENTS[environment].branch} cacheado (${cachedRemote}).`);
    console.log(`SHA: ${sha} coincide con origin/${ENVIRONMENTS[environment].branch} cacheado.`);
  } catch (error) {
    localErrors.push(error.message);
  }
  try {
    const sources = readHeadSources();
    validateBuildTemplate(sources);
    JSON.parse(sources.get('appsscript.json'));
    console.log('HEAD: fuentes y placeholders de build válidos.');
  } catch (error) {
    localErrors.push(error.message);
  }
  for (const error of localErrors) console.log(`  - ${error}`);
  if (issues.length || localErrors.length) {
    console.log('DRY-RUN detenido: resuelve los puntos anteriores; no se ha usado clasp.');
    process.exitCode = 1;
    return;
  }
  const target = config.environments[environment];
  console.log(`Destino: ${environment} (${target.deploymentId}); Supabase ${normalizeSupabaseUrl(target.supabaseUrl)}.`);
  console.log('Preflight local correcto. No hubo escrituras ni consultas remotas.');
}

async function acquireLock() {
  const token = randomUUID();
  const record = JSON.stringify({ token, pid: process.pid, startedAt: new Date().toISOString() });
  try {
    const handle = await fs.open(LOCK_PATH, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, 0o600);
    try {
      await handle.writeFile(`${record}\n`, 'utf8');
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error('Ya existe .deploy.lock: otra publicación puede estar activa. Si fue una caída, confirma que el proceso terminó y elimina el lock manualmente.');
    }
    throw new Error('No se pudo crear el lock local de publicación.');
  }
  return async () => {
    try {
      const current = JSON.parse(await fs.readFile(LOCK_PATH, 'utf8'));
      if (current.token === token) await fs.unlink(LOCK_PATH);
    } catch {
      // Do not remove a lock that no longer belongs to this process.
    }
  };
}

async function runPublish(environment, args) {
  requireProConfirmation(environment, args);
  const dry = args.includes('--dry-run');
  const unexpected = args.filter(arg => arg !== '--dry-run' && arg !== '--confirm-pro');
  if (unexpected.length || args.filter(arg => arg === '--dry-run').length > 1) {
    throw new Error(`Opciones desconocidas para deploy:${environment.toLowerCase()}.`);
  }
  if (dry) {
    await dryRun(environment);
    return;
  }

  const unlock = await acquireLock();
  let tempRoot;
  try {
    const checkout = assertCleanBranchAndPush(environment, { fetchRemote: true });
    const { config, parseError } = await readConfig();
    const issues = configValidation(config, parseError);
    if (issues.length) throw new Error(`Configuración inválida:\n${issues.map(issue => `- ${issue}`).join('\n')}`);
    const devSources = buildSources('DEV', config.environments.DEV.supabaseUrl);
    const proSources = buildSources('PRO', config.environments.PRO.supabaseUrl);
    await checkPinnedClasp();
    const auth = claspJson(['show-authorized-user'], 'show-authorized-user');
    if (!auth.loggedIn) throw new Error('No hay sesión de clasp. Ejecuta npx clasp login localmente y vuelve a intentarlo.');

    const remote = await inspectBothDeployments(config);
    const sha = checkout.sha;
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cbba-deploy-'));
    const buildDirectories = {
      DEV: path.join(tempRoot, 'DEV'),
      PRO: path.join(tempRoot, 'PRO'),
    };
    await writeBuild(devSources, buildDirectories.DEV);
    await writeBuild(proSources, buildDirectories.PRO);
    const urls = { DEV: remote.details.DEV.url, PRO: remote.details.PRO.url };
    const ops = makeOperations({ config, environment, urls, buildDirectories, expectedCheckout: checkout });

    console.log(`Preflight remoto correcto: DEV=${config.environments.DEV.deploymentId}, PRO=${config.environments.PRO.deploymentId}; HEAD ${sha}.`);
    if (environment === 'DEV') {
      const build = await readProjectFiles(buildDirectories.DEV);
      await publishDev({
        sha,
        deploymentId: config.environments.DEV.deploymentId,
        build,
        buildDirectory: buildDirectories.DEV,
        ops,
      });
    } else {
      const devBuild = await readProjectFiles(buildDirectories.DEV);
      const proBuild = await readProjectFiles(buildDirectories.PRO);
      await publishPro({
        sha,
        deploymentId: config.environments.PRO.deploymentId,
        devBuild,
        proBuild,
        devBuildDirectory: buildDirectories.DEV,
        proBuildDirectory: buildDirectories.PRO,
        ops,
      });
    }
  } finally {
    try {
      if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
    } finally {
      await unlock();
    }
  }
}

function usage() {
  console.log('Uso: npm run deploy:setup -- --dev-id ID --pro-id ID --dev-url URL --pro-url URL');
  console.log('     npm run deploy:doctor');
  console.log('     npm run deploy:dev [-- --dry-run]');
  console.log('     npm run deploy:pro -- --confirm-pro [--dry-run]');
}

async function main(argv) {
  const [command, ...args] = argv;
  if (command === 'setup') return setup(args);
  if (command === 'doctor' && args.length === 0) return doctor();
  if (command === 'dev' || command === 'pro') return runPublish(command.toUpperCase(), args);
  usage();
  throw new Error('Comando u opciones no válidas.');
}

main(process.argv.slice(2)).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
