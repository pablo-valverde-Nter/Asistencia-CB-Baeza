const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function client(fields = {}, globals = {}) {
  const stored = {};
  const document = { addEventListener() {}, getElementById: id => fields[id] || null, querySelectorAll: () => [] };
  const context = vm.createContext({ document, window: { addEventListener() {} }, clearInterval() {}, setInterval() {}, setTimeout, clearTimeout, localStorage: { setItem(k,v) { stored[k] = v; }, getItem: () => null }, ...globals });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8').replace(/^<script[^>]*>|<\/script>\s*$/g, ''), context);
  return { app: vm.runInContext('App',context), context, stored };
}

test('avatares del club: doce SVG y fuentes no ejecutables', () => {
  const {app} = client();
  assert.ok(Object.keys(app.avatars).length >= 12);
  for (const id of Object.keys(app.avatars)) assert.match(app.avatarHtml('avatar:'+id,'Ana',56), /<svg/);
  assert.doesNotMatch(app.avatarHtml('javascript:alert(1)','<Ana>',40), /<img|<Ana>/);
  assert.match(app.avatarHtml('https://example.test/" onerror="x','Ana',40), /&quot;/);
  assert.match(app.avatarHtml('', 'Ana Baeza',40), />AB</);
});

test('perfil del jugador conserva el contacto familiar pero no deja cambiar los avisos por email', () => {
  const fields = { 'perfil-usuario-contenido': {}, 'perfil-editar-contenido': {}, 'perfil-form': {} };
  const {app} = client(fields);
  app.state.rol = 'jugador';
  app.state.jugador = {ID:'j', Nombre:'Ana', Apellidos:'Baeza', EmailPadre1:'familia@example.test', NotificarAusenciasPadre1:false};
  app.views['perfil-usuario'].render();
  assert.doesNotMatch(fields['perfil-usuario-contenido'].innerHTML,/<input|<form/);
  const resumen = fields['perfil-usuario-contenido'].innerHTML;
  assert.match(resumen,/<span class="avisos-chip is-off">Avisos por correo desactivados<\/span>/);
  assert.match(resumen,/<span class="avisos-chip is-on">Avisos por correo activados<\/span>/, 'el familiar 2 sin valor queda activado por defecto');
  assert.match(resumen,/<button type="button" class="avisos-info-btn" aria-label="Información sobre los avisos por correo" aria-expanded="false" aria-controls="avisos-info-perfil-1"/);
  assert.match(resumen,/id="avisos-info-perfil-1" role="note" hidden>Si quieres cambiarlo, avisa a tu entrenador para que lo modifique\.</);
  assert.doesNotMatch(resumen,/Solo el entrenador puede cambiarlo/);
  app.views['perfil-usuario'].editar();
  const html = fields['perfil-editar-contenido'].innerHTML;
  for (const name of ['FechaNac','Telefono','Email','NombrePadre1','ApellidosPadre1','TelefonoPadre1','EmailPadre1','NombrePadre2','ApellidosPadre2','TelefonoPadre2','EmailPadre2']) assert.ok(html.includes('data-perfil="'+name+'"'),name);
  assert.doesNotMatch(html,/NotificarAusencias|type="checkbox"/, 'la familia no ve interruptores de avisos');
  assert.match(html,/avisos-chip is-off">Avisos por correo desactivados/);
  assert.match(html,/avisos-chip is-on">Avisos por correo activados/);
  assert.match(html,/aria-controls="avisos-info-editar-2"/, 'los id del formulario no chocan con los del resumen');
  assert.match(html,/id="perfil-codigo"/);
  assert.doesNotMatch(html,/data-perfil="(?:PIN|CodigoPadres|Usuario)"/);
});

test('popover de avisos: se abre hacia arriba sin salirse de pantalla y se cierra al volver a tocar, fuera o con Escape', () => {
  const listeners = {};
  const popover = (left, right) => { const p = { hidden: true, shift: null, getBoundingClientRect: () => ({ left, right }) }; p.style = { setProperty(k, v) { p.shift = v; } }; return p; };
  const pops = { 'avisos-info-perfil-1': popover(200, 380), 'avisos-info-perfil-2': popover(-30, 150) };
  const boton = id => ({ attrs: { 'aria-controls': id, 'aria-expanded': 'false' }, getAttribute(k) { return this.attrs[k]; }, setAttribute(k, v) { this.attrs[k] = String(v); } });
  const b1 = boton('avisos-info-perfil-1'), b2 = boton('avisos-info-perfil-2');
  const document = {
    documentElement: { clientWidth: 360 },
    addEventListener(tipo, fn) { (listeners[tipo] = listeners[tipo] || []).push(fn); },
    getElementById: id => pops[id] || null,
    querySelectorAll: sel => sel === '.avisos-info-btn[aria-expanded="true"]' ? [b1, b2].filter(b => b.attrs['aria-expanded'] === 'true') : [],
  };
  const {app} = client({}, { document });
  for (const tipo of Object.keys(listeners)) delete listeners[tipo]; // solo los que instala el popover
  const abierto = (b, p) => b.attrs['aria-expanded'] === 'true' && p.hidden === false;

  app.account.toggleAvisosInfo(b1);
  assert.ok(abierto(b1, pops['avisos-info-perfil-1']));
  assert.equal(pops['avisos-info-perfil-1'].shift, '-28px', 'se desplaza para quedar a 8px del borde derecho');
  app.account.toggleAvisosInfo(b2);
  assert.ok(!abierto(b1, pops['avisos-info-perfil-1']), 'solo uno abierto a la vez');
  assert.equal(pops['avisos-info-perfil-2'].shift, '38px', 'se desplaza para quedar a 8px del borde izquierdo');
  app.account.toggleAvisosInfo(b2);
  assert.ok(!abierto(b2, pops['avisos-info-perfil-2']), 'volver a tocar el (i) lo cierra');

  app.account.toggleAvisosInfo(b1);
  listeners.click.forEach(fn => fn({ target: { closest: sel => sel === '.avisos-info' ? {} : null } }));
  assert.ok(abierto(b1, pops['avisos-info-perfil-1']), 'tocar dentro del popover no lo cierra');
  listeners.click.forEach(fn => fn({ target: { closest: () => null } }));
  assert.ok(!abierto(b1, pops['avisos-info-perfil-1']), 'tocar fuera lo cierra');
  app.account.toggleAvisosInfo(b1);
  listeners.keydown.forEach(fn => fn({ key: 'Escape' }));
  assert.ok(!abierto(b1, pops['avisos-info-perfil-1']));
});

test('campos pendientes: el aviso y el formulario marcan los mismos datos', () => {
  const fields = { 'perfil-editar-contenido': {}, 'perfil-form': {} };
  const {app} = client(fields);
  const pendientes = j => [...app.account.camposPendientes(j)].map(p => p.campo);
  const familia1 = {NombrePadre1:'Eva', ApellidosPadre1:'Ruiz', TelefonoPadre1:'600000000', EmailPadre1:'eva@example.test'};
  assert.deepEqual(pendientes({FechaNac:'2012-03-04', ...familia1}), []);
  assert.deepEqual(pendientes({FechaNac:'  '}), ['FechaNac','NombrePadre1','ApellidosPadre1','TelefonoPadre1','EmailPadre1']);
  assert.deepEqual(pendientes({FechaNac:'2012-03-04', NombrePadre1:'Eva', NombrePadre2:'Luis', TelefonoPadre2:'611111111'}), ['ApellidosPadre2','EmailPadre2'], 'completa el familiar más avanzado');
  assert.deepEqual(pendientes({FechaNac:'2012-03-04', NombrePadre1:'Eva', NombrePadre2:'Luis'}), ['ApellidosPadre1','TelefonoPadre1','EmailPadre1'], 'empate: familiar 1');
  assert.deepEqual(pendientes({NombrePadre2:'Luis', ApellidosPadre2:'Gil', TelefonoPadre2:'611111111', EmailPadre2:'luis@example.test'}), ['FechaNac'], 'basta un familiar completo');
  assert.equal(app.account.camposPendientes({}).find(p => p.campo === 'TelefonoPadre1').texto, 'Teléfono del familiar 1');

  app.state.rol = 'jugador';
  app.state.jugador = {ID:'j', Nombre:'Ana', Apellidos:'Baeza', NombrePadre2:'Luis', TelefonoPadre2:'611111111'};
  app.views['perfil-usuario'].editar();
  const html = fields['perfil-editar-contenido'].innerHTML;
  const marcados = [...html.matchAll(/class="form-group perfil-pendiente"><label for="perfil-(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(marcados, pendientes(app.state.jugador));
  assert.deepEqual(marcados, ['FechaNac','ApellidosPadre2','EmailPadre2']);
  assert.match(html, /role="status">Te faltan 3 datos</);
  assert.match(html, /id="perfil-FechaNac"[^>]*aria-describedby="perfil-FechaNac-pendiente"/);
  assert.match(html, /id="perfil-FechaNac-pendiente">Falta este dato</);
  assert.doesNotMatch(html, /id="perfil-NombrePadre2"[^>]*aria-describedby/);
});

test('foto: el indicador aparece antes de preparar la imagen, que se centra, reduce a 128 y limita el JPEG', async () => {
  const calls = [];
  let image;
  const canvas = { getContext: () => ({ fillRect() {}, drawImage(...args) { calls.push(args); } }), toDataURL: (_type,q) => q > .55 ? 'x'.repeat(16001) : 'data:image/jpeg;base64,ok' };
  const {app,context} = client({}, {URL:{createObjectURL:()=> 'blob:foto',revokeObjectURL:url=>calls.push(url)},Image:function() { image=this; this.naturalWidth=400; this.naturalHeight=200; }});
  context.document.createElement = () => canvas;
  const eventos = [];
  app.operation.begin = (key,textos) => { eventos.push(['begin',textos.pending]); return {id:1,key,textos}; };
  app.operation.afterPaint = () => { eventos.push(['paint']); return Promise.resolve(); };
  app.operation.succeed = () => eventos.push(['succeed']);
  context.server = (fn,foto) => { eventos.push([fn,foto]); return Promise.resolve({success:true,fotoURL:foto}); };
  app.state.auth = {tipo:'jugador'}; app.state.rol = 'jugador'; app.state.jugador = {ID:'j',Nombre:'Ana'};
  app.closeModal = () => {};
  app.views['perfil-usuario']._actualizar = () => {};
  const subida = app.views['perfil-usuario'].subirFoto({files:[{type:'image/png'}]});
  assert.deepEqual(eventos,[['begin','Subiendo foto…'],['paint']]);
  assert.equal(image, undefined, 'la imagen no se procesa antes de pintar el indicador');
  await new Promise(resolve => setImmediate(resolve));
  image.onload();
  await subida;
  assert.equal(canvas.width,128);
  assert.equal(canvas.height,128);
  assert.deepEqual(calls[0].slice(1),[100,0,200,200,0,0,128,128]);
  assert.equal(calls[1],'blob:foto');
  assert.deepEqual(eventos.slice(2),[['actualizarFotoPerfil','data:image/jpeg;base64,ok'],['succeed']]);
});

test('cambio de credenciales guarda el auth devuelto sin cerrar sesión', async () => {
  const fields = {
    'seg-pin-actual':{value:'1234'},'seg-pin-nuevo':{value:'9876'},'seg-pin-repetir':{value:'9876'},'seg-usuario':{value:'ana.nueva'},
    'seg-credenciales':{querySelectorAll:()=>[]},
  };
  const {app,context,stored} = client(fields);
  context.showToast = () => {};
  app.state.rol='jugador'; app.state.auth={tipo:'jugador',usuario:'ana',pin:'1234'};
  let sent;
  const newAuth={tipo:'jugador',usuario:'ana.nueva',pin:'9876'};
  app.operation.run=(_key,fn,args,success)=>{sent={fn,args};success({success:true,auth:newAuth});return Promise.resolve();};
  app.views.seguridad.credenciales();
  assert.equal(sent.fn,'cambiarCredenciales');
  assert.equal(sent.args[0].pinActual,'1234');
  assert.equal(app.state.auth,newAuth);
  assert.deepEqual(JSON.parse(stored.cb_baeza_auth),newAuth);
});

test('recuperación sin correo ofrece ayuda del entrenador', async () => {
  const fields = {'recuperar-acceso-contenido':{}};
  const {app,context} = client(fields);
  context.server = () => Promise.resolve({success:false,sinCorreo:true});
  app.views['recuperar-acceso'].render();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(fields['recuperar-acceso-contenido'].innerHTML,/No tienes ningún correo registrado. Contacta con tu entrenador para recuperarlo/);
});

test('recuperación limita reenvío, verifica código y elimina secretos al salir', async () => {
  const fields = {'recuperar-acceso-contenido':{},'recovery-code':{value:'123456'},'recovery-error':{}};
  const {app,context} = client(fields);
  context.document.querySelector = () => ({value:'tutor1'});
  const calls = [];
  context.server = (fn,...args) => { calls.push({fn,args}); return Promise.resolve(fn === 'verificarCodigoRecuperacion' ? {success:true,pin:'9876',codigoSeguridad:'ABC123'} : {success:true,expiraEnMin:10}); };
  const recovery = app.views['recuperar-acceso'];
  recovery._destinos = [{id:'tutor1',email:'m***@example.test'}];
  recovery._pintar = () => {};
  await recovery.enviar(false);
  assert.equal(recovery._paso,2);
  await recovery.enviar(true);
  assert.equal(calls.length,1);
  await recovery.verificar();
  assert.equal(recovery._paso,3);
  assert.equal(recovery._secretos.pin,'9876');
  assert.equal(calls[1].fn,'verificarCodigoRecuperacion');
  assert.equal(calls[1].args[0],'123456');
  recovery.limpiar();
  assert.equal(recovery._secretos,null);
  assert.equal(fields['recuperar-acceso-contenido'].innerHTML,'');
});

test('respuesta de recuperación tardía no repone secretos después de salir', async () => {
  const {app,context} = client({'recovery-code':{value:'123456'},'recuperar-acceso-contenido':{}});
  let resolve;
  context.server = () => new Promise(done => {resolve=done;});
  const recovery=app.views['recuperar-acceso'];
  const pending=recovery.verificar();
  recovery.limpiar();
  resolve({success:true,pin:'1234'});
  await pending;
  assert.equal(recovery._secretos,null);
});
