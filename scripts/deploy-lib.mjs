import path from 'node:path';

export const SCRIPT_ID = '1pLLShVaGOPsiQO5V6hA9xHEa7-2KqK8ta6WaTDKpmzpIys6NBcrqBybi';
export const ENVIRONMENTS = Object.freeze({
  DEV: Object.freeze({ branch: 'develop' }),
  PRO: Object.freeze({ branch: 'main' }),
});

export function initialConfig() {
  return {
    scriptId: SCRIPT_ID,
    environments: {
      DEV: { branch: ENVIRONMENTS.DEV.branch, deploymentId: null, supabaseUrl: null },
      PRO: { branch: ENVIRONMENTS.PRO.branch, deploymentId: null, supabaseUrl: null },
    },
  };
}

export function normalizeSupabaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    !/^([a-z0-9-]+)\.supabase\.co$/i.test(url.hostname) ||
    (url.pathname !== '/' && url.pathname !== '')
  ) return null;
  return `https://${url.hostname.toLowerCase()}`;
}

function validDeploymentId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,}$/.test(value);
}

export function configIssues(config) {
  const issues = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return ['deploy.config.json no existe o no contiene un objeto JSON.'];
  }
  if (config.scriptId !== SCRIPT_ID) issues.push('scriptId debe coincidir con el proyecto Apps Script fijado en esta herramienta.');
  if (!config.environments || typeof config.environments !== 'object') {
    issues.push('Falta el objeto environments.');
    return issues;
  }
  const ids = [];
  const urls = [];
  for (const environment of ['DEV', 'PRO']) {
    const entry = config.environments[environment];
    if (!entry || typeof entry !== 'object') {
      issues.push(`Falta environments.${environment}.`);
      continue;
    }
    if (entry.branch !== ENVIRONMENTS[environment].branch) {
      issues.push(`environments.${environment}.branch debe ser ${ENVIRONMENTS[environment].branch}.`);
    }
    if (entry.deploymentId === null || entry.deploymentId === undefined || entry.deploymentId === '') {
      issues.push(`environments.${environment}.deploymentId está pendiente.`);
    } else if (!validDeploymentId(entry.deploymentId)) {
      issues.push(`environments.${environment}.deploymentId no tiene un formato válido.`);
    } else {
      ids.push([environment, entry.deploymentId]);
    }
    if (entry.supabaseUrl === null || entry.supabaseUrl === undefined || entry.supabaseUrl === '') {
      issues.push(`environments.${environment}.supabaseUrl está pendiente.`);
    } else {
      const normalized = normalizeSupabaseUrl(entry.supabaseUrl);
      if (!normalized) issues.push(`environments.${environment}.supabaseUrl debe ser una URL HTTPS de Supabase sin ruta, consulta ni fragmento.`);
      else urls.push([environment, normalized]);
    }
  }
  if (ids.length === 2 && ids[0][1] === ids[1][1]) issues.push('Los deploymentId DEV y PRO deben ser distintos.');
  if (urls.length === 2 && urls[0][1] === urls[1][1]) issues.push('Las URL Supabase DEV y PRO deben ser distintas.');
  return issues;
}

export function assertEnvironment(environment) {
  if (!Object.hasOwn(ENVIRONMENTS, environment)) throw new Error('El entorno debe ser DEV o PRO.');
}

export function assertBranch(environment, currentBranch) {
  assertEnvironment(environment);
  const required = ENVIRONMENTS[environment].branch;
  if (currentBranch !== required) {
    throw new Error(`La publicación ${environment} requiere la rama ${required}; rama actual: ${currentBranch || '(detached HEAD)'}.`);
  }
}

export function requireProConfirmation(environment, args) {
  if (environment === 'PRO' && !args.includes('--confirm-pro')) {
    throw new Error('PRO requiere autorización explícita: añade --confirm-pro.');
  }
  if (environment === 'PRO' && args.filter(arg => arg === '--confirm-pro').length !== 1) {
    throw new Error('--confirm-pro debe aparecer exactamente una vez.');
  }
  if (environment !== 'PRO' && args.includes('--confirm-pro')) {
    throw new Error('--confirm-pro solo se permite al publicar PRO.');
  }
}

export function validateSetupValues({ devId, proId, devUrl, proUrl }) {
  const errors = [];
  if (!validDeploymentId(devId)) errors.push('--dev-id debe ser un deployment ID existente válido.');
  if (!validDeploymentId(proId)) errors.push('--pro-id debe ser un deployment ID existente válido.');
  if (validDeploymentId(devId) && devId === proId) errors.push('Los deployment ID DEV y PRO deben ser distintos.');
  const normalizedDevUrl = normalizeSupabaseUrl(devUrl);
  const normalizedProUrl = normalizeSupabaseUrl(proUrl);
  if (!normalizedDevUrl) errors.push('--dev-url debe ser una URL HTTPS de Supabase sin ruta, consulta ni fragmento.');
  if (!normalizedProUrl) errors.push('--pro-url debe ser una URL HTTPS de Supabase sin ruta, consulta ni fragmento.');
  if (normalizedDevUrl && normalizedDevUrl === normalizedProUrl) errors.push('Las URL Supabase DEV y PRO deben ser distintas.');
  if (errors.length) throw new Error(errors.join('\n'));
  return {
    ...initialConfig(),
    environments: {
      DEV: { branch: ENVIRONMENTS.DEV.branch, deploymentId: devId, supabaseUrl: normalizedDevUrl },
      PRO: { branch: ENVIRONMENTS.PRO.branch, deploymentId: proId, supabaseUrl: normalizedProUrl },
    },
  };
}

export function validateBuildTemplate(sources) {
  const configSource = sources.get('src/Config.gs');
  if (typeof configSource !== 'string') throw new Error('El build requiere src/Config.gs con la ruta original del proyecto.');
  const environment = /^const SUPABASE_ENV = 'UNPUBLISHED';$/gm;
  const expectedUrl = /^const SUPABASE_EXPECTED_URL = '';$/gm;
  if ((configSource.match(environment) || []).length !== 1) {
    throw new Error("src/Config.gs debe contener exactamente `const SUPABASE_ENV = 'UNPUBLISHED';`.");
  }
  if ((configSource.match(expectedUrl) || []).length !== 1) {
    throw new Error("src/Config.gs debe contener exactamente `const SUPABASE_EXPECTED_URL = '';`.");
  }
}

export function buildPayload(sources, environment, supabaseUrl) {
  assertEnvironment(environment);
  const normalizedUrl = normalizeSupabaseUrl(supabaseUrl);
  if (!normalizedUrl) throw new Error('El build requiere una URL HTTPS pública de Supabase válida.');
  validateBuildTemplate(sources);
  const payload = new Map(sources);
  const source = payload.get('src/Config.gs')
    .replace(/^const SUPABASE_ENV = 'UNPUBLISHED';$/m, `const SUPABASE_ENV = '${environment}';`)
    .replace(/^const SUPABASE_EXPECTED_URL = '';$/m, `const SUPABASE_EXPECTED_URL = ${JSON.stringify(normalizedUrl)};`);
  payload.set('src/Config.gs', source);
  return payload;
}

function sortedJson(value) {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortedJson(value[key])]));
  }
  return value;
}

function normalizeContent(filename, content) {
  const lf = content.replace(/\r\n?/g, '\n');
  if (filename === 'appsscript.json') {
    try {
      return JSON.stringify(sortedJson(JSON.parse(lf)));
    } catch {
      throw new Error('El manifiesto appsscript.json no es JSON válido.');
    }
  }
  return lf;
}

function canonicalFilename(filename) {
  const portable = filename.replaceAll('\\', '/');
  if (portable === 'appsscript.json') return portable;
  if (/\.js$/i.test(portable)) return `${portable.replace(/\.js$/i, '')}.gs`;
  return portable;
}

export function canonicalFileMap(files) {
  const result = new Map();
  for (const [filename, content] of files) {
    const canonical = canonicalFilename(filename);
    if (result.has(canonical)) throw new Error(`Colisión de nombre de fichero GAS: ${canonical}.`);
    if (!/\.(?:gs|html)$/i.test(canonical) && canonical !== 'appsscript.json') continue;
    result.set(canonical, normalizeContent(canonical, content));
  }
  return result;
}

export function compareFileSets(expectedFiles, actualFiles) {
  const expected = canonicalFileMap(expectedFiles);
  const actual = canonicalFileMap(actualFiles);
  const missing = [...expected.keys()].filter(filename => !actual.has(filename)).sort();
  const extra = [...actual.keys()].filter(filename => !expected.has(filename)).sort();
  const changed = [...expected.keys()].filter(filename => actual.has(filename) && expected.get(filename) !== actual.get(filename)).sort();
  return { equal: missing.length === 0 && extra.length === 0 && changed.length === 0, missing, extra, changed };
}

export function extractSupabaseEnvironment(files) {
  const candidates = [...files].filter(([filename]) => /^Config\.(?:gs|js)$/i.test(path.posix.basename(filename.replaceAll('\\', '/'))));
  if (candidates.length !== 1) throw new Error('No hay exactamente un único fichero Config.gs en el proyecto remoto.');
  const source = candidates[0][1];
  const declarations = source.match(/^[\t ]*const[\t ]+SUPABASE_ENV\b/gm) || [];
  const assignments = [...source.matchAll(/^[\t ]*const[\t ]+SUPABASE_ENV[\t ]*=[\t ]*(['"])(DEV|PRO)\1[\t ]*;/gm)];
  if (declarations.length !== 1 || assignments.length !== 1) {
    throw new Error('SUPABASE_ENV no contiene una única declaración literal DEV o PRO.');
  }
  return assignments[0][2];
}

export function assertDeploymentEnvironment(expectedEnvironment, actualEnvironment) {
  assertEnvironment(expectedEnvironment);
  if (actualEnvironment !== expectedEnvironment) {
    throw new Error(`El deployment configurado como ${expectedEnvironment} contiene SUPABASE_ENV=${actualEnvironment || 'desconocido'}; no se publicará.`);
  }
}

function assertVersion(version) {
  const number = Number(version);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('clasp no devolvió un número de versión inmutable válido.');
  return number;
}

export async function publishDev({ sha, deploymentId, build, buildDirectory, ops }) {
  const description = `CBBAEZA DEV ${sha}`;
  await ops.beforePush?.();
  await ops.push(buildDirectory);
  const version = assertVersion(await ops.createVersion(description));
  await ops.verifyImmutableVersion(version, description, build);
  await ops.updateDeployment(deploymentId, version, description);
  await ops.verifyDeployment(deploymentId, version, description);
  await ops.openWebApp();
  return { version, description };
}

export async function publishPro({ sha, deploymentId, devBuild, proBuild, devBuildDirectory, proBuildDirectory, ops }) {
  const devDescription = `CBBAEZA DEV ${sha}`;
  const proDescription = `CBBAEZA PRO ${sha}`;
  await ops.verifyDevRelease(devDescription, devBuild);
  await ops.beforePush?.();

  let version;
  let failure;
  let restorationFailure;
  let mayHaveChangedHead = false;
  try {
    mayHaveChangedHead = true;
    await ops.push(proBuildDirectory);
    version = assertVersion(await ops.createVersion(proDescription));
    await ops.verifyImmutableVersion(version, proDescription, proBuild);
  } catch (error) {
    failure = error;
  }

  if (mayHaveChangedHead) {
    try {
      await ops.push(devBuildDirectory);
      await ops.verifyHead(devBuild);
    } catch (error) {
      restorationFailure = error;
    }
  }

  if (restorationFailure) {
    throw new Error(`No se actualizó PRO: HEAD remoto puede no estar en DEV. No actualices PRO ni uses /dev hasta restaurar y verificar manualmente DEV. ${restorationFailure.message}`);
  }
  if (failure) throw failure;

  await ops.updateDeployment(deploymentId, version, proDescription);
  await ops.verifyDeployment(deploymentId, version, proDescription);
  await ops.openWebApp();
  return { version, description: proDescription };
}
