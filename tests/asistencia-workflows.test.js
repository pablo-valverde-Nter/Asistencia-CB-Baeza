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
    Notificaciones: { notificarAusenciaAFamilia() {}, notificarJustificacionAEntrenadores() { return false; },
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
  const result = asistencia.registrarJustificacion('s1', 'member', 'ABC123', 'Retraso', 'Consulta', 'Llega tarde', '19:30');
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

test('el modal precarga una justificacion para editarla o eliminarla con codigo', () => {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '', classList: {
        hidden: false,
        toggle(_, hidden) { this.hidden = hidden; },
        contains() { return this.hidden; },
        remove() { this.hidden = false; },
      },
    });
    return elements.get(id);
  }
  const radios = [{ value: 'Ausencia' }, { value: 'Retraso' }];
  const document = {
    addEventListener() {}, getElementById: element,
    querySelectorAll: () => radios,
    querySelector: () => radios.find(radio => radio.checked),
  };
  const code = fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8')
    .replace(/^<script[^>]*>|<\/script>\s*$/g, '');
  const context = vm.createContext({ document, window: { addEventListener() {} } });
  vm.runInContext(code, context);
  const app = vm.runInContext('App', context);
  app.state.jugador = { ID: 'member', Nombre: 'Ana', Apellidos: 'Baeza' };
  app.state.motivosJustificacion = ['Consulta'];
  app.cache.sesiones = [{ ID: 's1', Fecha: '2099-09-25' }];
  app.cache.asistJugadores = [{ ID_Jugador: 'member', ID_Sesion: 's1', TieneJustificacion: true,
    TipoJustificacion: 'Retraso', MotivoCategoria: 'Consulta', MotivoDetalle: 'Llega tarde',
    MensajeGenerado: 'Previsión de incorporación aproximada: 19:30.' }];
  app.views.justificacion.abrir('s1', 'R');
  assert.equal(element('justif-titulo').textContent, 'Editar justificación');
  assert.equal(element('justif-detalle').value, 'Llega tarde');
  assert.equal(element('justif-motivo').value, 'Consulta');
  assert.equal(element('justif-hora').value, '19:30');
  assert.equal(element('justif-submit').textContent, 'Guardar cambios');
  assert.equal(element('justif-delete').classList.hidden, false);
  assert.equal(element('justif-codigo').value, '');
  app.views.justificacion.abrir('s1', 'R', null, true);
  assert.equal(element('justif-submit').classList.hidden, true);
});

test('el aviso de anulacion llega solo a entrenadores activos, sin visores', () => {
  const sent = [];
  const context = vm.createContext({
    CONFIG: { SHEETS: { ENTRENADORES_EQUIPOS: 'rels', ENTRENADORES: 'trainers' },
      TIPOS_ROL_ENTRENADOR: { VISOR: 'Visor' } },
    findWhere: () => [
      { ID_Entrenador: 'coach', Activo: true, TipoRol: 'Entrenador' },
      { ID_Entrenador: 'viewer', Activo: true, TipoRol: 'Visor' },
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
  assert.equal(sent[0].to, 'coach@example.com');
  assert.match(sent[0].subject, /anulada/);
});