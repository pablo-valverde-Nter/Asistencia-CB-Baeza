const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function classList() {
  const set = new Set();
  return { add: (...c) => c.forEach(x => set.add(x)), remove: (...c) => c.forEach(x => set.delete(x)), contains: c => set.has(c) };
}
function node() {
  return { textContent: '', classList: classList(), setAttribute() {}, remove() { if (this.parent) this.parent.removeChild(this); } };
}

function client() {
  const container = { children: [], get firstChild() { return this.children[0]; },
    appendChild(child) { child.parent = this; this.children.push(child); },
    removeChild(child) { this.children = this.children.filter(c => c !== child); child.parent = null; } };
  const fields = { 'toast-container': container, 'operation-status': node(), 'operation-pending-text': node(),
    'operation-success-text': node(), 'operation-error-text': node() };
  const document = { addEventListener() {}, getElementById: id => fields[id] || null, querySelector: () => null,
    querySelectorAll: () => [], createElement: () => { const n = node(); Object.defineProperty(n, 'parentNode', { get() { return n.parent || null; } }); return n; } };
  const timers = [];
  const context = vm.createContext({ document, window: { addEventListener() {} },
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8').replace(/^<script[^>]*>|<\/script>\s*$/g, ''), context);
  const app = vm.runInContext('App', context);
  const showToast = vm.runInContext('showToast', context);
  const status = fields['operation-status'].classList;
  return { app, showToast, container, fields, status, timers };
}

test('solo hay un aviso visible: el nuevo sustituye al anterior y el repetido no se apila', () => {
  const { showToast, container } = client();
  showToast('Introduce el código', 'error');
  const primero = container.children[0];
  showToast('Introduce el código', 'error');
  assert.equal(container.children.length, 1);
  assert.equal(container.children[0], primero);
  showToast('Fecha y horas son obligatorias', 'error');
  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].textContent, 'Fecha y horas son obligatorias');
});

test('el indicador de guardado y los avisos nunca se solapan', () => {
  const { app, showToast, container, status } = client();
  showToast('Introduce el código', 'error');
  const token = app.operation.begin('save');
  assert.equal(container.children.length, 0, 'empezar a guardar retira el aviso anterior');
  assert.ok(status.contains('pending'));
  showToast('Otro aviso', 'info');
  assert.ok(!status.contains('hidden'), 'un aviso no oculta un guardado en curso');
  app.operation.succeed(token);
  assert.ok(status.contains('success'));
  assert.equal(container.children.length, 0, 'el resultado sustituye al aviso');
  showToast('Otro aviso', 'info');
  assert.ok(status.contains('hidden'), 'un aviso nuevo retira el resultado ya mostrado');
});

test('el resultado usa el texto de la acción o el estándar si terminan varias distintas', () => {
  const { app, fields, status } = client();
  const envio = app.operation.begin('send', { pending: 'Enviando…', success: 'Enviado correctamente' });
  assert.equal(fields['operation-pending-text'].textContent, 'Enviando…');
  app.operation.succeed(envio);
  assert.equal(fields['operation-success-text'].textContent, 'Enviado correctamente');
  const a = app.operation.begin('a', { success: 'Enviado correctamente' });
  const b = app.operation.begin('b');
  assert.equal(fields['operation-pending-text'].textContent, 'Guardando…');
  app.operation.succeed(a);
  app.operation.succeed(b);
  assert.equal(fields['operation-success-text'].textContent, 'Guardado correctamente');
  const c = app.operation.begin('c');
  app.operation.fail(c, 'No se pudo subir la foto');
  assert.ok(status.contains('error'));
  assert.equal(fields['operation-error-text'].textContent, 'No se pudo subir la foto');
});

test('run muestra el indicador antes de preparar los datos y un fallo al prepararlos acaba en error', async () => {
  const { app, status, fields } = client();
  let preparadoConIndicador = null;
  app.operation.afterPaint = () => Promise.resolve();
  await assert.rejects(app.operation.run('foto', 'actualizarFotoPerfil', () => {
    preparadoConIndicador = status.contains('pending');
    throw new Error('La imagen es demasiado compleja. Prueba con otra foto.');
  }));
  assert.equal(preparadoConIndicador, true);
  assert.ok(status.contains('error'));
  assert.equal(fields['operation-error-text'].textContent, 'La imagen es demasiado compleja. Prueba con otra foto.');
});
