import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertBranch,
  assertDeploymentEnvironment,
  compareFileSets,
  configIssues,
  extractSupabaseEnvironment,
  initialConfig,
  publishPro,
  requireProConfirmation,
  validateSetupValues,
} from '../scripts/deploy-lib.mjs';

const DEV_ID = 'AKfycbDEVdeployment123';
const PRO_ID = 'AKfycbPROdeployment456';
const DEV_URL = 'https://cbba-dev.supabase.co';
const PRO_URL = 'https://cbba-pro.supabase.co';
const SHA = '0123456789abcdef0123456789abcdef01234567';
const DEV_DESCRIPTION = `CBBAEZA DEV ${SHA}`;
const PRO_DESCRIPTION = `CBBAEZA PRO ${SHA}`;

function filesFor(environment, body) {
  return new Map([
    ['src/Config.gs', `const SUPABASE_ENV = '${environment}';\nconst SUPABASE_EXPECTED_URL = "https://cbba-${environment.toLowerCase()}.supabase.co";\n`],
    ['src/Code.gs', `function doGet() { return HtmlService.createTemplateFromFile('ui/Index'); }\n${body}`],
    ['ui/Index.html', "<?!= include('ui/styles'); ?>\n<?!= include('ui/app'); ?>\n"],
    ['ui/styles.html', '<style>body { color: black; }</style>\n'],
    ['ui/app.html', '<script>window.appReady = true;</script>\n'],
    ['appsscript.json', '{"runtimeVersion":"V8","timeZone":"Europe/Madrid"}'],
  ]);
}

function cloneFiles(files) {
  return new Map(files);
}

class StatefulRemoteScript {
  constructor({ devBuild, proBuild, devDescription = DEV_DESCRIPTION, devVersionFiles = devBuild }) {
    this.head = cloneFiles(devBuild);
    this.versions = new Map([
      [1, { description: DEV_DESCRIPTION, files: cloneFiles(devVersionFiles) }],
      [2, { description: 'CBBAEZA PRO anterior', files: cloneFiles(proBuild) }],
    ]);
    this.deployments = new Map([
      [DEV_ID, { version: 1, description: devDescription }],
      [PRO_ID, { version: 2, description: 'CBBAEZA PRO anterior' }],
    ]);
    this.nextVersion = 3;
    this.disturbHeadBeforeVersion = false;
    this.failDevRestore = false;
  }

  operations({ devBuild, proBuild }) {
    const remote = this;
    return {
      async beforePush() {},
      async push(directory) {
        if (directory === 'DEV_BUILD' && remote.failDevRestore) throw new Error('falló restore');
        remote.head = cloneFiles(directory === 'PRO_BUILD' ? proBuild : devBuild);
        if (directory === 'PRO_BUILD' && remote.disturbHeadBeforeVersion) {
          remote.head = cloneFiles(filesFor('DEV', 'cambio concurrente antes de create-version'));
        }
      },
      async createVersion(description) {
        const version = remote.nextVersion++;
        remote.versions.set(version, { description, files: cloneFiles(remote.head) });
        return version;
      },
      async verifyImmutableVersion(version, description, expectedFiles) {
        const immutable = remote.versions.get(version);
        if (!immutable || immutable.description !== description) throw new Error('descripción de versión incorrecta');
        if (!compareFileSets(expectedFiles, immutable.files).equal) throw new Error('contenido inmutable distinto al build');
      },
      async verifyDevRelease(description, expectedFiles) {
        const deployment = remote.deployments.get(DEV_ID);
        const version = deployment && remote.versions.get(deployment.version);
        if (!deployment || deployment.description !== description || !version || version.description !== description) {
          throw new Error('DEV no es la versión exacta aprobada');
        }
        if (!compareFileSets(expectedFiles, version.files).equal) throw new Error('el contenido DEV no coincide con este SHA');
      },
      async verifyHead(expectedFiles) {
        if (!compareFileSets(expectedFiles, remote.head).equal) throw new Error('HEAD no quedó en DEV');
      },
      async updateDeployment(deploymentId, version, description) {
        if (!remote.versions.has(version)) throw new Error('versión no existente');
        remote.deployments.set(deploymentId, { version, description });
      },
      async openWebApp() {},
    };
  }
}

function makeRemote(options = {}) {
  const devBuild = filesFor('DEV', 'versión DEV probada');
  const proBuild = filesFor('PRO', 'versión PRO preparada');
  const remote = new StatefulRemoteScript({ devBuild, proBuild, ...options });
  return { remote, devBuild, proBuild, ops: remote.operations({ devBuild, proBuild }) };
}

async function promote(remoteData) {
  return publishPro({
    sha: SHA,
    deploymentId: PRO_ID,
    devBuild: remoteData.devBuild,
    proBuild: remoteData.proBuild,
    devBuildDirectory: 'DEV_BUILD',
    proBuildDirectory: 'PRO_BUILD',
    ops: remoteData.ops,
  });
}

test('exige rama y entorno correctos', () => {
  assert.doesNotThrow(() => assertBranch('DEV', 'develop'));
  assert.throws(() => assertBranch('DEV', 'main'), /requiere la rama develop/);
  assert.throws(() => assertBranch('PRO', 'develop'), /requiere la rama main/);
  assert.throws(() => assertDeploymentEnvironment('DEV', 'PRO'), /no se publicará/);
});

test('rechaza deployment IDs y URLs Supabase repetidos o no seguros', () => {
  assert.throws(() => validateSetupValues({ devId: DEV_ID, proId: DEV_ID, devUrl: DEV_URL, proUrl: PRO_URL }), /deployment ID DEV y PRO/);
  assert.throws(() => validateSetupValues({ devId: DEV_ID, proId: PRO_ID, devUrl: DEV_URL, proUrl: `${DEV_URL}/` }), /URL Supabase DEV y PRO/);
  assert.throws(() => validateSetupValues({ devId: DEV_ID, proId: PRO_ID, devUrl: 'http://cbba-dev.supabase.co', proUrl: PRO_URL }), /HTTPS/);
  const config = initialConfig();
  config.environments.DEV.deploymentId = DEV_ID;
  config.environments.PRO.deploymentId = DEV_ID;
  config.environments.DEV.supabaseUrl = DEV_URL;
  config.environments.PRO.supabaseUrl = `${DEV_URL}/`;
  assert.match(configIssues(config).join('\n'), /deploymentId DEV y PRO deben ser distintos/);
  assert.match(configIssues(config).join('\n'), /URL Supabase DEV y PRO deben ser distintas/);
});

test('PRO exige confirmación explícita', () => {
  assert.throws(() => requireProConfirmation('PRO', []), /autorización explícita/);
  assert.throws(() => requireProConfirmation('PRO', ['--confirm-pro', '--confirm-pro']), /exactamente una vez/);
  assert.throws(() => requireProConfirmation('DEV', ['--confirm-pro']), /solo se permite/);
  assert.doesNotThrow(() => requireProConfirmation('PRO', ['--confirm-pro']));
});

test('compara todos los ficheros GAS y detecta una ruta perdida', () => {
  const expected = filesFor('DEV', 'versión actual');
  const actual = new Map(expected);
  actual.delete('ui/Index.html');
  actual.set('Index.html', "<?!= include('ui/styles'); ?>\n<?!= include('ui/app'); ?>\n");
  const difference = compareFileSets(expected, actual);
  assert.equal(difference.equal, false);
  assert.deepEqual(difference.missing, ['ui/Index.html']);
  assert.deepEqual(difference.extra, ['Index.html']);
});

test('normaliza .gs/.js, LF y la representación JSON del manifiesto', () => {
  const expected = new Map([
    ['src/Code.gs', 'const X = 1;\n'],
    ['appsscript.json', '{"a":1,"b":2}'],
  ]);
  const actual = new Map([
    ['src/Code.js', 'const X = 1;\r\n'],
    ['appsscript.json', '{\n  "b": 2, "a": 1\n}'],
  ]);
  assert.deepEqual(compareFileSets(expected, actual), { equal: true, missing: [], extra: [], changed: [] });
});

test('detecta SUPABASE_ENV en un único Config.gs y rechaza ubicaciones ambiguas', () => {
  assert.equal(extractSupabaseEnvironment(new Map([['Config.gs', "const SUPABASE_ENV = 'PRO';\n"]])), 'PRO');
  assert.throws(() => extractSupabaseEnvironment(new Map([
    ['Config.gs', "const SUPABASE_ENV = 'DEV';\n"],
    ['src/Config.gs', "const SUPABASE_ENV = 'DEV';\n"],
  ])), /único fichero Config/);
  assert.throws(() => extractSupabaseEnvironment(new Map([['Config.gs', "const SUPABASE_ENV = 'DEV';\nconst SUPABASE_ENV = 'PRO';\n"]])), /única declaración/);
  assert.throws(() => extractSupabaseEnvironment(new Map([['Config.gs', 'const SUPABASE_ENV = getEnvironment();\n']])), /única declaración/);
});

test('no promueve PRO si la deployment DEV no tiene el SHA exacto', async () => {
  const data = makeRemote({ devDescription: 'CBBAEZA DEV commit-anterior' });
  const priorProDeployment = { ...data.remote.deployments.get(PRO_ID) };
  const priorVersionCount = data.remote.versions.size;
  await assert.rejects(promote(data), /DEV no es la versión exacta aprobada/);
  assert.deepEqual(data.remote.deployments.get(PRO_ID), priorProDeployment);
  assert.equal(data.remote.versions.size, priorVersionCount);
  assert.equal(compareFileSets(data.devBuild, data.remote.head).equal, true);
});

test('no promueve PRO si DEV marcado con el SHA contiene otro payload', async () => {
  const wrongDevVersion = filesFor('DEV', 'contenido distinto del SHA actual');
  const data = makeRemote({ devVersionFiles: wrongDevVersion });
  const priorProDeployment = { ...data.remote.deployments.get(PRO_ID) };
  const priorVersionCount = data.remote.versions.size;
  await assert.rejects(promote(data), /contenido DEV no coincide/);
  assert.deepEqual(data.remote.deployments.get(PRO_ID), priorProDeployment);
  assert.equal(data.remote.versions.size, priorVersionCount);
  assert.equal(compareFileSets(data.devBuild, data.remote.head).equal, true);
});

test('si un writer concurrente altera el snapshot inmutable, conserva PRO anterior y restaura HEAD DEV', async () => {
  const data = makeRemote();
  data.remote.disturbHeadBeforeVersion = true;
  const priorProDeployment = { ...data.remote.deployments.get(PRO_ID) };
  await assert.rejects(promote(data), /contenido inmutable distinto al build/);
  assert.deepEqual(data.remote.deployments.get(PRO_ID), priorProDeployment);
  assert.equal(compareFileSets(data.devBuild, data.remote.head).equal, true);
  assert.equal(extractSupabaseEnvironment(data.remote.head), 'DEV');
});

test('si falla la restauración de HEAD, PRO permanece anterior y el resultado indica recuperación', async () => {
  const data = makeRemote();
  data.remote.failDevRestore = true;
  const priorProDeployment = { ...data.remote.deployments.get(PRO_ID) };
  await assert.rejects(promote(data), /HEAD remoto puede no estar en DEV/);
  assert.deepEqual(data.remote.deployments.get(PRO_ID), priorProDeployment);
  assert.equal(extractSupabaseEnvironment(data.remote.head), 'PRO');
});

test('solo actualiza PRO con payload PRO verificado y deja HEAD y deployment DEV en DEV', async () => {
  const data = makeRemote();
  const result = await promote(data);
  const proDeployment = data.remote.deployments.get(PRO_ID);
  const devDeployment = data.remote.deployments.get(DEV_ID);
  const proVersion = data.remote.versions.get(proDeployment.version);
  assert.equal(result.description, PRO_DESCRIPTION);
  assert.equal(proDeployment.description, PRO_DESCRIPTION);
  assert.equal(extractSupabaseEnvironment(proVersion.files), 'PRO');
  assert.equal(compareFileSets(data.proBuild, proVersion.files).equal, true);
  assert.equal(compareFileSets(data.devBuild, data.remote.head).equal, true);
  assert.equal(devDeployment.version, 1);
  assert.equal(devDeployment.description, DEV_DESCRIPTION);
});
