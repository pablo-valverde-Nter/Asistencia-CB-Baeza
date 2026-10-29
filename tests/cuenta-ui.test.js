const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function client(fields = {}, globals = {}) {
  const stored = {};
  const document = { addEventListener() {}, getElementById: id => fields[id] || null, querySelectorAll: () => [] };
  const context = vm.createContext({ document, window: { addEventListener() {} }, clearInterval() {}, setInterval() {}, localStorage: { setItem(k,v) { stored[k] = v; }, getItem: () => null }, ...globals });
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

test('perfil conserva contacto familiar y ambos interruptores de avisos', () => {
  const fields = { 'perfil-usuario-contenido': {}, 'perfil-editar-contenido': {}, 'perfil-form': {} };
  const {app} = client(fields);
  app.state.rol = 'jugador';
  app.state.jugador = {ID:'j', Nombre:'Ana', Apellidos:'Baeza', EmailPadre1:'familia@example.test', NotificarAusenciasPadre1:false};
  app.views['perfil-usuario'].render();
  assert.doesNotMatch(fields['perfil-usuario-contenido'].innerHTML,/<input|<form/);
  app.views['perfil-usuario'].editar();
  const html = fields['perfil-editar-contenido'].innerHTML;
  for (const name of ['FechaNac','Telefono','Email','NombrePadre1','ApellidosPadre1','TelefonoPadre1','EmailPadre1','NombrePadre2','ApellidosPadre2','TelefonoPadre2','EmailPadre2','NotificarAusenciasPadre1','NotificarAusenciasPadre2']) assert.ok(html.includes('data-perfil="'+name+'"'),name);
  assert.match(html,/id="perfil-codigo"/);
  assert.doesNotMatch(html,/data-perfil="(?:PIN|CodigoPadres|Usuario)"/);
});

test('foto centra, reduce a 128 y limita JPEG antes del envío', () => {
  const calls = [];
  let image;
  const canvas = { getContext: () => ({ fillRect() {}, drawImage(...args) { calls.push(args); } }), toDataURL: (_type,q) => q > .55 ? 'x'.repeat(16001) : 'data:image/jpeg;base64,ok' };
  const {app,context} = client({}, {URL:{createObjectURL:()=> 'blob:foto',revokeObjectURL:url=>calls.push(url)},Image:function() { image=this; this.naturalWidth=400; this.naturalHeight=200; }});
  context.document.createElement = () => canvas;
  let foto;
  app.views['perfil-usuario'].guardarFoto = value => {foto=value;};
  app.views['perfil-usuario'].subirFoto({files:[{type:'image/png'}]});
  image.onload();
  assert.equal(canvas.width,128);
  assert.equal(canvas.height,128);
  assert.deepEqual(calls[0].slice(1),[100,0,200,200,0,0,128,128]);
  assert.equal(foto,'data:image/jpeg;base64,ok');
  assert.equal(calls[1],'blob:foto');
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
