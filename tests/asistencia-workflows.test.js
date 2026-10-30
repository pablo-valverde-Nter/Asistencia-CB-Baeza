const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function backend(rows) {
  const writes = [];
  const notifications = [];
  const tables = { SESIONES: 'sesiones', EQUIPOS: 'equipos', JUGADORES: 'jugadores',
    ASIST_JUGADORES: 'asistJugadores', ASIST_ENTRENADORES: 'asistEntrenadores',
    JUGADORES_EQUIPOS: 'jugadoresEquipos', ENTRENADORES_EQUIPOS: 'entrenadoresEquipos' };
  const context = vm.createContext({
    CONFIG: { SHEETS: tables, ESTADOS_ASISTENCIA: { PRESENTE: 'P', AUSENTE: 'A', RETRASO: 'R' } },
    Auth: { verificarCodigoPadres: (_, codigo) => codigo === 'ABC123' },
    findById: (table, id) => (rows[table] || []).find(row => row.ID === id),
    findWhere: (table, field, value) => (rows[table] || []).filter(row => String(row[field]) === String(value)),
    updateRow: (table, id, changes) => { writes.push({ op: 'update', table, id, changes }); return true; },
    deleteRow: (table, id) => { writes.push({ op: 'delete', table, id }); return true; },
    appendRow: (table, fields) => {
      writes.push({ op: 'append', table, fields });
      return { ID: 'new-row', ...fields };
    },
    Notificaciones: { notificarAusenciaAFamilia(...args) { notifications.push(args); }, notificarJustificacionAEntrenadores() { return false; },
      notificarCancelacionJustificacionAEntrenadores(...args) { notifications.push(args); return true; },
      generarMensajeJustificacion() { return 'mensaje'; } },
    Logger: { log() {} },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/Asistencia.gs'), 'utf8'), context);
  return { asistencia: vm.runInContext('Asistencia', context), writes, notifications };
}

function sessionRows() {
  return {
    sesiones: [{ ID: 's1', ID_Equipo: 'team', Fecha: '2026-09-25' }],
    equipos: [{ ID: 'team', Nombre: 'Equipo' }],
    jugadores: [{ ID: 'member', Nombre: 'Jugador', Apellidos: 'Equipo' }],
    jugadoresEquipos: [{ ID_Equipo: 'team', ID_Jugador: 'member', Activo: true }],
    entrenadoresEquipos: [{ ID_Equipo: 'team', ID_Entrenador: 'coach', Activo: true }],
    asistJugadores: [{ ID: 'guest-row', ID_Sesion: 's1', ID_Jugador: 'guest', EsInvitado: true }],
    asistEntrenadores: [{ ID: 'coach-row', ID_Sesion: 's1', ID_Entrenador: 'coach', Asistio: true }],
  };
}

test('guarda exclusiones sin alterar relaciones del equipo', () => {
  const { asistencia, writes } = backend(sessionRows());
  asistencia.guardarAsistenciaCompleta('s1', {
    jugadores: [], entrenadores: [], excluidosJugadores: ['member', 'guest'], excluidosEntrenadores: ['coach'],
  });
  assert.ok(writes.some(write => write.op === 'delete' && write.id === 'guest-row'));
  assert.ok(writes.some(write => write.op === 'append' && write.table === 'asistJugadores' &&
    write.fields.ID_Jugador === 'member' && write.fields.Excluido === true));
  assert.ok(writes.some(write => write.op === 'update' && write.id === 'coach-row' &&
    write.changes.Excluido === true && write.changes.Asistio === null));
  assert.ok(writes.every(write => write.table !== 'jugadoresEquipos' && write.table !== 'entrenadoresEquipos'));
});

test('rechaza exclusiones indebidas antes de escribir', () => {
  const rows = sessionRows();
  rows.asistJugadores.push({ ID: 'justified-row', ID_Sesion: 's1', ID_Jugador: 'member', TieneJustificacion: true });
  const { asistencia, writes } = backend(rows);
  assert.throws(() => asistencia.guardarAsistenciaCompleta('s1', {
    jugadores: [], entrenadores: [], excluidosJugadores: ['member'],
  }), /justificaci.n activa/);
  assert.throws(() => asistencia.guardarAsistenciaCompleta('s1', {
    jugadores: [], entrenadores: [], excluidosJugadores: ['stranger'],
  }), /Solo se puede quitar/);
  assert.equal(writes.length, 0);
});

test('volver a añadir a un miembro excluido restaura su presencia sin asignarlo de nuevo', () => {
  const rows = sessionRows();
  rows.asistJugadores = [{ ID: 'excluded-row', ID_Sesion: 's1', ID_Jugador: 'member', Excluido: true }];
  const { asistencia, writes } = backend(rows);
  asistencia.guardarAsistenciaCompleta('s1', {
    jugadores: [{ jugadorId: 'member', estado: null, esInvitado: false }], entrenadores: [],
    excluidosJugadores: [],
  });
  assert.ok(writes.some(write => write.op === 'update' && write.id === 'excluded-row' &&
    write.changes.Excluido === false));
  assert.ok(writes.every(write => write.table !== 'jugadoresEquipos'));
});

test('al borrar una justificacion conserva la asistencia y exige codigo familiar', () => {
  const rows = sessionRows();
  rows.asistJugadores = [{ ID: 'family-row', ID_Sesion: 's1', ID_Jugador: 'member', Estado: 'A',
    TieneJustificacion: true, JustificadoPor: 'padre' }];
  const { asistencia, writes, notifications } = backend(rows);
  assert.throws(() => asistencia.eliminarJustificacion('s1', 'member', ''), /c.digo/);
  assert.equal(writes.length, 0);
  assert.equal(notifications.length, 0);
  const result = asistencia.eliminarJustificacion('s1', 'member', 'ABC123');
  assert.equal(result.registro.Estado, 'A');
  assert.equal(result.registro.TieneJustificacion, false);
  assert.ok(writes.some(write => write.op === 'update' && write.id === 'family-row'));
  assert.ok(writes.every(write => write.op !== 'delete'));
  assert.equal(notifications.length, 1);
});

test('al borrar un preaviso sin asistencia elimina solo su fila', () => {
  const rows = sessionRows();
  rows.asistJugadores = [{ ID: 'notice', ID_Sesion: 's1', ID_Jugador: 'member', Estado: null,
    TieneJustificacion: true, JustificadoPor: 'padre' }];
  const { asistencia, writes } = backend(rows);
  assert.equal(asistencia.eliminarJustificacion('s1', 'member', 'ABC123').eliminado, true);
  assert.ok(writes.some(write => write.op === 'delete' && write.id === 'notice'));
});

test('permite editar una justificacion enviada sin cambiar un estado futuro', () => {
  const rows = sessionRows();
  rows.sesiones[0].Fecha = '2099-09-25';
  rows.asistJugadores = [{ ID: 'notice', ID_Sesion: 's1', ID_Jugador: 'member', Estado: null,
    TieneJustificacion: true, JustificadoPor: 'padre', MotivoCategoria: 'Anterior' }];
  const { asistencia, writes } = backend(rows);
  const result = asistencia.registrarJustificacion('s1', 'member', 'ABC123', 'Retraso', 'Consulta', 'Llega tarde', 15);
  assert.equal(result.registro.MotivoCategoria, 'Consulta');
  assert.equal(result.registro.TipoJustificacion, 'Retraso');
  assert.equal(result.registro.Estado, null);
  assert.ok(writes.some(write => write.op === 'update' && write.id === 'notice' &&
    write.changes.MotivoCategoria === 'Consulta' && !Object.hasOwn(write.changes, 'Estado')));
});

test('una justificacion nueva crea la asistencia como no excluida', () => {
  const rows = sessionRows();
  rows.asistJugadores = [];
  const { asistencia, writes } = backend(rows);
  asistencia.registrarJustificacion('s1', 'member', 'ABC123', 'Ausencia', 'Consulta', '', null);
  const insert = writes.find(write => write.op === 'append' && write.table === 'asistJugadores');
  assert.ok(insert);
  assert.equal(insert.fields.Excluido, false);
});

test('el invitado pendiente de autosalvado puede quitarse aunque su alta aun no exista', () => {
  const rows = sessionRows();
  rows.jugadores.push({ ID: 'pending-guest', Nombre: 'Nuevo' });
  const { asistencia, writes } = backend(rows);
  asistencia.guardarAsistenciaCompleta('s1', {
    jugadores: [], entrenadores: [], excluidosJugadores: ['pending-guest'],
  });
  assert.ok(writes.every(write => write.table !== 'asistJugadores'));

  const code = fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8')
    .replace(/^<script[^>]*>|<\/script>\s*$/g, '');
  const context = vm.createContext({ document: { addEventListener() {} }, window: { addEventListener() {} } });
  vm.runInContext(code, context);
  const app = vm.runInContext('App', context);
  app.state.sesionId = 's1';
  app.state._sesionAutoSaving = true;
  app.views.sesion._removed = { jugadores: new Set(), entrenadores: new Set() };
  const row = { dataset: { id: 'pending-guest', inv: 'true' }, remove() {} };
  app.views.sesion._quitarRow(row, 'jugador');
  assert.ok(app.views.sesion._removed.jugadores.has('pending-guest'));
});

test('el cliente oculta solo al miembro excluido y conserva la justificacion en cache', () => {
  const code = fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8')
    .replace(/^<script[^>]*>|<\/script>\s*$/g, '');
  const context = vm.createContext({ document: { addEventListener() {} }, window: { addEventListener() {} } });
  vm.runInContext(code, context);
  const app = vm.runInContext('App', context);
  app.cache.sesiones = [{ ID: 's1', ID_Equipo: 'team' }];
  app.cache.jugadores = [{ ID: 'member', Nombre: 'Ana' }, { ID: 'guest', Nombre: 'Berta' }];
  app.cache.entrenadores = [{ ID: 'coach', Nombre: 'Carlos' }];
  app.cache.jugadoresEquipos = [{ ID_Equipo: 'team', ID_Jugador: 'member', Activo: true }];
  app.cache.entrenadoresEquipos = [{ ID_Equipo: 'team', ID_Entrenador: 'coach', Activo: true }];
  app.cache.asistJugadores = [{ ID_Sesion: 's1', ID_Jugador: 'member', Excluido: true },
    { ID_Sesion: 's1', ID_Jugador: 'guest', Estado: 'A', EsInvitado: true, TieneJustificacion: true,
      MotivoDetalle: 'Avisado', MensajeGenerado: 'mensaje' }];
  const view = app.views.sesion._buildFromCache(app.cache.sesiones[0]);
  assert.deepEqual(Array.from(view.jugadores, item => item.jugador.ID), ['guest']);
  assert.equal(app.cache.getEstadoAsistencia(app.cache.asistJugadores[0]), null);
  app.views.sesion._applyAttendanceCache('s1', [
    { jugadorId: 'guest', estado: 'A', esInvitado: true },
  ], [{ entrenadorId: 'coach', asistio: true, esInvitado: false }], ['member'], []);
  const guest = app.cache.asistJugadores.find(row => row.ID_Jugador === 'guest');
  assert.equal(guest.MotivoDetalle, 'Avisado');
  assert.equal(guest.MensajeGenerado, 'mensaje');
  assert.ok(app.cache.asistJugadores.some(row => row.ID_Jugador === 'member' && row.Excluido === true));
});

test('el swipe corto no actua y el largo pide confirmacion sin borrar', () => {
  const code = fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8')
    .replace(/^<script[^>]*>|<\/script>\s*$/g, '');
  const context = vm.createContext({ document: { addEventListener() {} }, window: { addEventListener() {} } });
  vm.runInContext(code, context);
  const app = vm.runInContext('App', context);
  const listeners = {};
  const row = {
    dataset: {}, style: {}, isConnected: true,
    classList: { add() {}, remove() {} },
    addEventListener(type, listener) { listeners[type] = listener; },
    setPointerCapture() {}, hasPointerCapture() { return false; },
  };
  const target = { closest: () => null };
  let confirmations = 0;
  app.views.sesion.solicitarQuitar = function(received, type) {
    assert.equal(received, row);
    assert.equal(type, 'jugador');
    confirmations++;
  };
  app.views.sesion._bindSwipeRow(row, 'jugador');
  listeners.pointerdown({ pointerType: 'touch', pointerId: 1, clientX: 100, clientY: 10, target });
  listeners.pointermove({ clientX: 55, clientY: 12, preventDefault() {} });
  listeners.pointerup({ pointerId: 1 });
  assert.equal(confirmations, 0);
  listeners.pointerdown({ pointerType: 'touch', pointerId: 2, clientX: 100, clientY: 10, target });
  listeners.pointermove({ clientX: 20, clientY: 12, preventDefault() {} });
  listeners.pointerup({ pointerId: 2 });
  assert.equal(confirmations, 1);
  listeners.pointerdown({ pointerType: 'touch', pointerId: 3, clientX: 100, clientY: 10, target });
  listeners.pointermove({ clientX: 10, clientY: 12, preventDefault() {} });
  listeners.pointercancel({ pointerId: 3 });
  assert.equal(confirmations, 1);
});

test('el swipe solo quita la fila despues de confirmar', () => {
  const code = fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8')
    .replace(/^<script[^>]*>|<\/script>\s*$/g, '');
  const context = vm.createContext({ document: { addEventListener() {} }, window: { addEventListener() {} } });
  vm.runInContext(code, context);
  const app = vm.runInContext('App', context);
  const row = { dataset: { justif: 'false' }, isConnected: true };
  let modal = null;
  let removed = 0;
  app.openModal = (title, body) => { modal = { title, body }; };
  app.closeModal = () => {};
  app.views.sesion._quitarRow = (received, tipo) => {
    assert.equal(received, row);
    assert.equal(tipo, 'entrenador');
    removed++;
  };
  app.views.sesion.solicitarQuitar(row, 'entrenador');
  assert.equal(removed, 0);
  assert.equal(modal.title, 'Quitar de la sesión');
  assert.match(modal.body, /Seguro/);
  app.views.sesion._confirmarQuitar();
  assert.equal(removed, 1);
});

function wizardClient() {
  const classList = () => {
    const set = new Set();
    return { add: (...c) => c.forEach(x => set.add(x)), remove: (...c) => c.forEach(x => set.delete(x)),
      toggle(c, on) { if (on) set.add(c); else set.delete(c); }, contains: c => set.has(c) };
  };
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { id, value: '', textContent: '', innerHTML: '', disabled: false, style: {},
      classList: classList(), focus() {}, querySelector: () => null, setAttribute() {} });
    return elements.get(id);
  };
  const button = (key, value) => ({ dataset: { [key]: value }, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
  const steps = ['tipo', 'minutos', 'motivo', 'resumen', 'codigo'].map(step => ({ dataset: { step }, hidden: false, classList: classList() }));
  const tipos = ['Ausencia', 'Retraso'].map(v => button('tipo', v));
  const minutos = ['5', '10', '15', '30', 'otro'].map(v => button('minutos', v));
  let motivos = { html: null, list: [] };
  const document = {
    addEventListener() {}, getElementById: element, querySelector: () => null,
    querySelectorAll(selector) {
      if (selector.includes('.justif-step')) return steps;
      if (selector.includes('[data-tipo]')) return tipos;
      if (selector.includes('[data-minutos]')) return minutos;
      if (selector.includes('[data-motivo]')) {
        const html = element('justif-motivos').innerHTML;
        if (motivos.html !== html) motivos = { html, list: Array.from(html.matchAll(/data-motivo="([^"]+)"/g), m => button('motivo', m[1])) };
        return motivos.list;
      }
      return [];
    },
  };
  const code = fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8').replace(/^<script[^>]*>|<\/script>\s*$/g, '');
  const context = vm.createContext({ document, window: { addEventListener() {} }, setTimeout, clearTimeout });
  vm.runInContext(code, context);
  const app = vm.runInContext('App', context);
  context.showToast = () => {};
  app.state.jugador = { ID: 'member', Nombre: 'Ana', Apellidos: 'Baeza' };
  app.state.motivosJustificacion = ['Consulta', 'Estudios'];
  app.state.viewHistory = [];
  app.cache.sesiones = [{ ID: 's1', ID_Equipo: 'team', Fecha: '2099-09-25', HoraInicio: '19:00' }];
  app.cache.equipos = [{ ID: 'team', Nombre: 'Cadete' }];
  app.cache.asistJugadores = [];
  app.navigate = () => {};
  const sent = [];
  context.server = (fn, ...args) => { sent.push({ fn, args }); return Promise.resolve({ success: true, registro: { ID_Sesion: 's1', ID_Jugador: 'member' } }); };
  const visible = () => steps.find(s => !s.hidden).dataset.step;
  const pressed = list => list.filter(b => b.attrs['aria-pressed'] === 'true').map(b => Object.values(b.dataset)[0]);
  return { app, element, visible, pressed, tipos, minutos, motivos: () => document.querySelectorAll('[data-motivo]'), sent };
}

test('el asistente de retraso avanza solo, pide minutos y envia los mismos datos al servidor', async () => {
  const { app, element, visible, sent } = wizardClient();
  const wizard = app.views.justificacion;
  wizard.abrir('s1', 'sin');
  assert.equal(visible(), 'tipo');
  assert.equal(element('justif-progress-text').textContent, 'Paso 1 de 4');
  assert.equal(element('justif-atras').style.visibility, 'hidden');
  wizard.elegirTipo('Retraso');
  assert.equal(visible(), 'minutos');
  assert.equal(element('justif-progress-text').textContent, 'Paso 2 de 5');
  assert.equal(element('justif-titulo').textContent, 'Justificar retraso');
  wizard.elegirMinutos(15);
  assert.equal(visible(), 'motivo');
  assert.equal(element('justif-motivo-next').disabled, true);
  wizard.elegirMotivo('Consulta');
  assert.equal(visible(), 'motivo', 'el detalle opcional sigue disponible tras elegir motivo');
  element('justif-detalle').value = '  Revisión médica ';
  wizard.continuarMotivo();
  assert.equal(visible(), 'resumen');
  assert.match(element('justif-preview').textContent, /Motivo: Consulta\. Llegará con unos 15 minutos de retraso\. Información adicional: "Revisión médica"\.$/);
  wizard.siguiente();
  assert.equal(visible(), 'codigo');
  assert.equal(element('justif-enviar').disabled, true);
  wizard.atras();
  assert.equal(visible(), 'resumen');
  wizard.siguiente();
  element('justif-codigo').value = 'abc123';
  wizard.actualizarCodigo();
  assert.equal(element('justif-enviar').disabled, false);
  wizard.confirmar();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), [{ fn: 'enviarJustificacion',
    args: ['s1', 'member', 'ABC123', 'Retraso', 'Consulta', 'Revisión médica', 15] }]);
});

test('la ausencia salta el paso de minutos y no envia minutos aunque antes se eligiera retraso', async () => {
  const { app, element, visible, pressed, tipos, sent } = wizardClient();
  const wizard = app.views.justificacion;
  wizard.abrir('s1', 'A');
  assert.deepEqual(pressed(tipos), ['Ausencia']);
  wizard.elegirTipo('Retraso');
  wizard.elegirMinutos(30);
  wizard.atras();
  wizard.atras();
  assert.equal(visible(), 'tipo');
  wizard.elegirTipo('Ausencia');
  assert.equal(visible(), 'motivo');
  assert.equal(element('justif-progress-text').textContent, 'Paso 2 de 4');
  wizard.elegirMotivo('Estudios');
  wizard.continuarMotivo();
  assert.doesNotMatch(element('justif-preview').textContent, /minutos/);
  wizard.siguiente();
  element('justif-codigo').value = 'ABC123';
  wizard.confirmar();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0].args)), ['s1', 'member', 'ABC123', 'Ausencia', 'Estudios', '', null]);
});

test('minutos personalizados fuera de 1-180 no avanzan', () => {
  const { app, element, visible, pressed, minutos } = wizardClient();
  const wizard = app.views.justificacion;
  wizard.abrir('s1', 'sin');
  wizard.elegirTipo('Retraso');
  wizard.otrosMinutos();
  assert.deepEqual(pressed(minutos), ['otro']);
  assert.equal(element('justif-otros').classList.contains('hidden'), false);
  for (const value of ['0', '181', '2.5', '']) {
    element('justif-minutos').value = value;
    wizard.confirmarMinutos();
    assert.equal(visible(), 'minutos', value);
  }
  element('justif-minutos').value = '45';
  wizard.confirmarMinutos();
  assert.equal(visible(), 'motivo');
  assert.equal(wizard._datos.minutos, 45);
});

test('el asistente precarga una justificacion para editarla o eliminarla con codigo', () => {
  const { app, element, visible, pressed, tipos, minutos, motivos } = wizardClient();
  app.cache.asistJugadores = [{ ID_Jugador: 'member', ID_Sesion: 's1', TieneJustificacion: true,
    TipoJustificacion: 'Retraso', MinutosRetraso: 45, MotivoCategoria: 'Consulta', MotivoDetalle: 'Llega tarde' }];
  const wizard = app.views.justificacion;
  wizard.abrir('s1', 'R');
  assert.equal(element('justif-titulo').textContent, 'Editar justificación');
  assert.deepEqual(pressed(tipos), ['Retraso']);
  assert.deepEqual(pressed(minutos), ['otro']);
  assert.equal(element('justif-minutos').value, '45');
  assert.deepEqual(pressed(motivos()), ['Consulta']);
  assert.equal(element('justif-detalle').value, 'Llega tarde');
  assert.equal(element('justif-submit').textContent, 'Guardar cambios');
  assert.equal(element('justif-codigo').value, '');
  wizard.abrir('s1', 'R', null, true);
  assert.equal(visible(), 'codigo');
  assert.equal(element('justif-progress').classList.contains('hidden'), true);
  assert.equal(element('justif-enviar').textContent, 'Eliminar justificación');
});

test('el resumen del cliente coincide con el mensaje que guarda el servidor', () => {
  const { app } = wizardClient();
  const context = vm.createContext({ CONFIG: { DIAS_SEMANA: { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado', 7: 'Domingo' } } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/Notificaciones.gs'), 'utf8'), context);
  const notificaciones = vm.runInContext('Notificaciones', context);
  const jugador = { Nombre: 'Ana', Apellidos: 'Baeza' }, equipo = { Nombre: 'Cadete' };
  for (const [fecha, tipo, detalle, minutos] of [['2026-10-04', 'Retraso', 'Médico', 20], ['2026-10-05', 'Ausencia', '', null]]) {
    const sesion = { Fecha: fecha, HoraInicio: '18:30' };
    assert.equal(app.views.justificacion.mensaje(jugador, sesion, equipo, tipo, 'Consulta', detalle, minutos),
      notificaciones.generarMensajeJustificacion(jugador, sesion, equipo, tipo, 'Consulta', detalle, '', minutos));
  }
});

test('los minutos del aviso se guardan sin sustituir los que registro el entrenador', () => {
  const casos = [
    [{ Estado: null }, 'Retraso', 20, 20],
    [{ Estado: null, MinutosRetraso: 20 }, 'Ausencia', 20, null],
    [{ Estado: 'R', MinutosRetraso: null }, 'Retraso', 25, 25],
    [{ Estado: 'R', MinutosRetraso: 10 }, 'Retraso', 25, undefined],
    [{ Estado: 'A' }, 'Retraso', 25, undefined],
  ];
  for (const [previo, tipo, minutos, esperado] of casos) {
    const rows = sessionRows();
    rows.asistJugadores = [{ ID: 'row', ID_Sesion: 's1', ID_Jugador: 'member', ...previo }];
    const { asistencia, writes } = backend(rows);
    asistencia.registrarJustificacion('s1', 'member', 'ABC123', tipo, 'Consulta', '', minutos);
    const update = writes.find(write => write.op === 'update' && write.id === 'row');
    assert.equal(update.changes.MinutosRetraso, esperado, JSON.stringify(previo));
  }
  for (const invalido of [0, 181, 2.5, '19:30']) {
    const { asistencia, writes } = backend(sessionRows());
    assert.throws(() => asistencia.registrarJustificacion('s1', 'member', 'ABC123', 'Retraso', 'Consulta', '', invalido), /entre 1 y 180/);
    assert.equal(writes.length, 0);
  }
});

test('el aviso de anulacion llega a entrenadores activos, incluidas las relaciones Visor antiguas', () => {
  const sent = [];
  const context = vm.createContext({
    CONFIG: { SHEETS: { ENTRENADORES_EQUIPOS: 'rels', ENTRENADORES: 'trainers' } },
    findWhere: () => [
      { ID_Entrenador: 'coach', Activo: true, TipoRol: 'Entrenador' },
      { ID_Entrenador: 'legacy', Activo: true, TipoRol: 'Visor' },
      { ID_Entrenador: 'inactive', Activo: false, TipoRol: 'Entrenador' },
    ],
    findWhereIn: (_, __, ids) => ids.map(id => ({ Email: id + '@example.com' })),
    MailApp: { sendEmail: mail => sent.push(mail) }, Logger: { log() {} },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/Notificaciones.gs'), 'utf8'), context);
  const notifications = vm.runInContext('Notificaciones', context);
  assert.equal(notifications.notificarCancelacionJustificacionAEntrenadores(
    { Nombre: 'Ana', Apellidos: 'Baeza' },
    { Fecha: '2026-09-25', HoraInicio: '18:00', HoraFin: '19:00' },
    { ID: 'team', Nombre: 'Equipo' }
  ), true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'coach@example.com,legacy@example.com');
  assert.match(sent[0].subject, /anulada/);
});

test('no notifica a la familia una ausencia que ya estaba justificada', () => {
  const rows = sessionRows();
  rows.jugadores[0].EmailPadre1 = 'tutor@example.com';
  rows.asistJugadores.push({ ID: 'justified-row', ID_Sesion: 's1', ID_Jugador: 'member',
    Estado: 'A', TieneJustificacion: true, Excluido: false });
  const { asistencia, notifications } = backend(rows);

  asistencia.guardarAsistenciaCompleta('s1', {
    jugadores: [{ jugadorId: 'member', estado: 'A' }], entrenadores: [],
  });

  assert.equal(notifications.length, 0);
});

test('no repite el correo de ausencia en guardados posteriores sin cambio de estado', () => {
  const rows = sessionRows();
  rows.jugadores[0].EmailPadre1 = 'tutor@example.com';
  rows.asistJugadores.push({ ID: 'attendance-row', ID_Sesion: 's1', ID_Jugador: 'member',
    Estado: 'P', TieneJustificacion: false, Excluido: false });
  const { asistencia, notifications } = backend(rows);
  const payload = { jugadores: [{ jugadorId: 'member', estado: 'A' }], entrenadores: [] };

  asistencia.guardarAsistenciaCompleta('s1', payload);
  rows.asistJugadores.find(row => row.ID === 'attendance-row').Estado = 'A';
  asistencia.guardarAsistenciaCompleta('s1', payload);

  assert.equal(notifications.length, 1);
});

test('el correo de ausencia identifica correctamente el martes 13/10/2026', () => {
  const sent = [];
  const context = vm.createContext({
    CONFIG: { DIAS_SEMANA: { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves',
      5: 'Viernes', 6: 'Sábado', 7: 'Domingo' }, ESTADOS_ASISTENCIA: { AUSENTE: 'A' } },
    MailApp: { sendEmail: mail => sent.push(mail) }, Logger: { log() {} },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/Notificaciones.gs'), 'utf8'), context);
  const notifications = vm.runInContext('Notificaciones', context);

  notifications.notificarAusenciaAFamilia(
    { Nombre: 'Juan', Apellidos: 'Lozano Mora', EmailPadre1: 'tutor@example.com' },
    { Fecha: '2026-10-13', HoraInicio: '19:00', HoraFin: '20:00' },
    { Nombre: 'CB Baeza - Infantil Mixto', Categoria: 'infantil', Modalidad: 'Mixto' },
    'A'
  );

  assert.match(sent[0].body, /Fecha: Martes, 13\/10\/2026/);
});

test('envia el aviso de ausencia solo a familiares habilitados', () => {
  const sent = [];
  const context = vm.createContext({
    CONFIG: { DIAS_SEMANA: {}, ESTADOS_ASISTENCIA: { AUSENTE: 'A' } },
    MailApp: { sendEmail: mail => sent.push(mail) }, Logger: { log() {} },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/Notificaciones.gs'), 'utf8'), context);
  const notifications = vm.runInContext('Notificaciones', context);

  notifications.notificarAusenciaAFamilia(
    { Nombre: 'Ana', Apellidos: 'Baeza', EmailPadre1: 'uno@example.com', EmailPadre2: 'dos@example.com',
      NotificarAusenciasPadre1: true, NotificarAusenciasPadre2: false },
    { Fecha: '2026-10-13' }, { Nombre: 'Equipo' }, 'A'
  );

  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'uno@example.com');
});

test('el jugador puede actualizar su fecha de nacimiento en su propio perfil', () => {
  let actualizacion;
  const context = vm.createContext({
    Auth: {
      validate: () => ({ success: true }),
      isJugador: () => true,
      getJugadorActual: () => ({ ID: 'member' }),
      verificarCodigoPadres: () => true,
    },
    Equipos: { actualizarJugador: (id, fields) => { actualizacion = { id, fields }; return true; } },
    Utilities: { formatDate: date => date.toISOString().slice(0, 10) },
    Session: { getScriptTimeZone: () => 'UTC' },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/Code.gs'), 'utf8'), context);
  const result = vm.runInContext(
    "actualizarPerfilJugador({tipo:'jugador'}, 'member', {FechaNac:'2008-04-15', ApellidosPadre1:'García López', PIN:'no'}, 'ABC123')",
    context
  );

  assert.equal(result.success, true);
  assert.equal(actualizacion.id, 'member');
  assert.deepEqual({ ...actualizacion.fields }, { FechaNac: '2008-04-15', ApellidosPadre1: 'García López' });
});

function clienteCaptura(documentOverrides = {}) {
  const document = { addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; }, ...documentOverrides };
  const context = vm.createContext({ document, window: { addEventListener() {} } });
  const code = fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8').replace(/^<script[^>]*>|<\/script>\s*$/g, '');
  vm.runInContext(code, context);
  return vm.runInContext('App', context);
}

test('el formulario prerrellena A y R desde el aviso sin registrar hasta guardar', () => {
  const elements = new Map();
  let cards = [];
  const app = clienteCaptura({
    querySelectorAll: selector => selector === '#sesion-jugs .jug-card' ? cards : [],
    getElementById(id) { if (!elements.has(id)) elements.set(id, { style: {} }); return elements.get(id); },
  });
  app.cache.sesiones = [{ ID: 's1', ID_Equipo: 'team' }];
  app.cache.jugadores = [{ ID: 'absence' }, { ID: 'late' }];
  app.cache.jugadoresEquipos = app.cache.jugadores.map(j => ({ ID_Jugador: j.ID, ID_Equipo: 'team', Activo: true }));
  app.cache.asistJugadores = [
    { ID_Sesion: 's1', ID_Jugador: 'absence', TieneJustificacion: true, TipoJustificacion: 'Ausencia', MotivoCategoria: 'Consulta' },
    { ID_Sesion: 's1', ID_Jugador: 'late', TieneJustificacion: true, TipoJustificacion: 'Retraso' },
  ];
  const vista = app.views.sesion._buildFromCache(app.cache.sesiones[0]);
  assert.deepEqual(Array.from(vista.jugadores, j => j.estado), ['A', 'R']);
  app.views.sesion._bindSwipeRows = () => {};
  app.views.sesion._startAutoSave = () => {};
  app.views.sesion._render(vista);
  const html = elements.get('sesion-jugs').innerHTML;
  assert.match(html, /Avisó: Ausencia · Consulta/);
  assert.match(html, /Avisó: Retraso/);
  cards = Array.from(html.matchAll(/data-id="([^"]+)" data-estado="([^"]+)"/g), match => ({ dataset: { id: match[1], estado: match[2] } }));
  assert.deepEqual(Array.from(app.views.sesion._collectAttendance().jugadores, j => j.estado), ['A', 'R']);
  assert.equal(app.cache.getEstadoRegistrado(app.cache.asistJugadores[0]), null);
  assert.equal(app.cache.sesiones[0].AsistenciaGuardada, undefined);
  assert.equal(app.state._formIsDirty, false);
});

test('la cache mantiene el aviso sin estado y guarda minutos y primer registro sin sobrescribirlo', () => {
  const app = clienteCaptura();
  app.cache.sesiones = [{ ID: 's1', ID_Equipo: 'team' }];
  app.cache.jugadores = [{ ID: 'member' }];
  app.cache.jugadoresEquipos = [{ ID_Jugador: 'member', ID_Equipo: 'team', Activo: true }];
  const aviso = { ID_Sesion: 's1', ID_Jugador: 'member', Estado: null, TieneJustificacion: true,
    TipoJustificacion: 'Retraso', MotivoCategoria: 'Consulta' };
  app.cache.asistJugadores = [aviso];
  const vista = app.views.sesion._buildFromCache(app.cache.sesiones[0]);
  assert.equal(vista.jugadores[0].estado, 'R');
  assert.equal(vista.jugadores[0].preaviso, 'R');
  app.views.sesion._applyAttendanceCache('s1', [{ jugadorId: 'member', estado: null }], [], [], [], '2026-10-27 21:00');
  assert.equal(app.cache.asistJugadores[0], aviso);
  app.views.sesion._applyAttendanceCache('s1', [{ jugadorId: 'member', estado: 'R', minutosRetraso: 15 }], [], [], [], '2026-10-28 21:00');
  assert.equal(app.cache.asistJugadores[0].MinutosRetraso, 15);
  assert.equal(app.cache.sesiones[0].FechaPrimerRegistro, '2026-10-27 21:00');
  app.views.sesion._applyAttendanceCache('s1', [{ jugadorId: 'member', estado: 'P', minutosRetraso: 15 }], [], [], []);
  assert.equal(app.cache.asistJugadores[0].MinutosRetraso, null);
});

test('cambiar un aviso prerrellenado pide confirmar y solo al confirmar limpia la justificacion', () => {
  const minutos = { value: '15' };
  let etiquetasEliminadas = 0;
  const card = { dataset: { id: 'member', estado: 'R', preaviso: 'R', justif: 'true', min: '15', tipoJustif: 'Retraso' },
    querySelector(selector) { return selector === '.retraso-min' ? minutos : selector === '.estado-chip' ? {} : { remove() { etiquetasEliminadas++; } }; } };
  const app = clienteCaptura();
  let titulo;
  app.openModal = title => { titulo = title; };
  app.views.sesion.toggleEstado(card);
  assert.equal(titulo, 'Asistencia justificada');
  assert.equal(card.dataset.estado, 'R');
  assert.equal(card.dataset.justif, 'true');
  assert.equal(card.dataset.justifCleared, undefined);
  assert.equal(app.state._formIsDirty, false);
  app.state._pendingConfirmSave();
  assert.equal(card.dataset.estado, 'P');
  assert.equal(card.dataset.min, undefined);
  assert.equal(minutos.value, '');
  assert.equal(card.dataset.justif, 'false');
  assert.equal(card.dataset.justifCleared, 'true');
  assert.equal(card.dataset.preaviso, undefined);
  assert.equal(etiquetasEliminadas, 2);
  assert.equal(app.state._formIsDirty, true);
});

test('la sesion cancelada abre un modal sin navegar y no cuenta avisos ni faltas', () => {
  const app = clienteCaptura();
  const sesion = { ID: 's1', Cancelada: 'TRUE', AsistenciaGuardada: true,
    MotivoCancelacion: 'Climatología', FechaCancelacion: '2026-10-27 10:00' };
  app.cache.sesiones = [sesion];
  app.cache.asistJugadores = [{ ID_Sesion: 's1', ID_Jugador: 'member', Estado: 'A' }];
  let modal;
  app.openModal = (titulo, html) => { modal = { titulo, html }; };
  app.navigate = () => assert.fail('No debe navegar al abrir una sesion cancelada');
  app.views.sesiones.abrirSesion('s1');
  assert.equal(modal.titulo, 'Sesión cancelada');
  assert.match(modal.html, /Climatología/);
  assert.match(modal.html, /Reactivar/);
  assert.equal(app.notifications.sessionUnjustifiedCount(sesion), 0);
  assert.equal(app.notifications.sessionJustificationCount(sesion), 0);
});

test('el detalle del jugador muestra el aviso sin registrarlo y las canceladas no ofrecen acciones', () => {
  const elements = new Map();
  const app = clienteCaptura({ getElementById(id) { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); } });
  app.state.jugador = { ID: 'member' };
  app.state.sesionJugadorId = 's1';
  app.cache.sesiones = [{ ID: 's1', Fecha: '2099-10-27', HoraInicio: '19:00', HoraFin: '20:00' }];
  app.cache.asistJugadores = [{ ID_Sesion: 's1', ID_Jugador: 'member', TieneJustificacion: true, TipoJustificacion: 'Ausencia' }];
  app.views['detalle-sesion-jugador'].render();
  assert.match(elements.get('detalle-sesion-jug-estado').innerHTML, /Sin registrar/);
  assert.match(elements.get('detalle-sesion-jug-estado').innerHTML, /Aviso enviado: Ausencia/);
  app.cache.sesiones[0].Cancelada = true;
  app.cache.sesiones[0].MotivoCancelacion = 'Festivo o vacaciones';
  app.views['detalle-sesion-jugador'].render();
  assert.match(elements.get('detalle-sesion-jug-estado').innerHTML, /Entrenamiento cancelado: Festivo o vacaciones/);
  assert.equal(elements.get('detalle-sesion-jug-actions').innerHTML, '');
});