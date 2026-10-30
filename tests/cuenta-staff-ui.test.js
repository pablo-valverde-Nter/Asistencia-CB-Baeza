const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function client(admin = false, fields = {}) {
  const context = vm.createContext({
    document: { addEventListener() {}, getElementById: id => fields[id] || null, querySelectorAll: () => [] },
    window: { addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8').replace(/^<script[^>]*>|<\/script>\s*$/g, ''), context);
  const app = vm.runInContext('App', context), calls = [], notices = [], confirmations = [];
  app.state.rol = 'entrenador'; app.state.esAdmin = admin;
  app.state.usuario = {ID:'me',Nombre:'Eva',Apellidos:'Coach'};
  app.state.equipos = [{ID:'team',Nombre:'Cadete'}];
  app.cache.equipos = [{ID:'team',Nombre:'Cadete'}];
  app.cache.jugadores = [{ID:'j',Nombre:'Ana',Apellidos:'Baeza',Usuario:'ana',CodigoPadres:'ABC123',EmailPadre1:'familia@example.test',NotificarAusenciasPadre1:true,NotificarAusenciasPadre2:false}];
  app.cache.entrenadores = [{ID:'e',Nombre:'Luis',Apellidos:'Coach',Email:'luis@example.test',EsAdmin:false}];
  app.cache.jugadoresEquipos = [{ID:'rel',ID_Jugador:'j',ID_Equipo:'team',Tipo:'Principal'}];
  app.cache.entrenadoresEquipos = [];
  app.navigate = (view, params) => { calls.push({view,params}); app.state.currentView = view; };
  app.operation.run = (_key, fn, args, success) => { calls.push({fn,args:JSON.parse(JSON.stringify(args))}); success({success:true,actualizado:true}); return Promise.resolve(); };
  context.showToast = (message,type) => notices.push({message,type});
  context.confirmarYGuardar = (title,html,fn) => confirmations.push({title,html,confirm:fn});
  return {app,context,calls,notices,confirmations};
}

const playerData = {Nombre:'Ana',Apellidos:'Baeza',Dorsal:'0',FechaNac:'2010-01-02',Telefono:'600000000',Email:'ana@example.test',NombrePadre1:'Familiar',ApellidosPadre1:'Uno',TelefonoPadre1:'600000001',EmailPadre1:'familia@example.test',NotificarAusenciasPadre1:true,NombrePadre2:'Familiar',ApellidosPadre2:'Dos',TelefonoPadre2:'600000002',EmailPadre2:'otro@example.test',NotificarAusenciasPadre2:false};

test('detalle usa tres acciones SVG compartidas (contacto, perfil, seguridad); entrenador ajeno no obtiene permisos y propio usa cuenta personal', () => {
  const {app,calls} = client();
  const html = app.account.accionesDetalleHtml('jugador','j',true);
  assert.equal((html.match(/<button /g) || []).length,3);
  assert.equal((html.match(/<svg class="account-menu-icon"/g) || []).length,3);
  assert.match(html,/_statsContacto\(&quot;jugador&quot;,&quot;j&quot;\)/); assert.match(html,/perfil-usuario/); assert.match(html,/seguridad/);
  const soloContacto = app.account.accionesDetalleHtml('entrenador','e',false);
  assert.equal((soloContacto.match(/<button /g) || []).length,1);
  assert.doesNotMatch(soloContacto,/perfil-usuario|seguridad/);
  app.state.detalleEntrenadorId='e';
  assert.equal(app.puedeEditarDetalle('entrenador-detalle'),false);
  app.account.open('entrenador','e','perfil-usuario');
  assert.equal(calls.length,0);
  app.account.open('entrenador','me','perfil-usuario');
  assert.equal(app.account.target,null);
  assert.equal(app.account.isStaff(),false);
  assert.equal(calls[0].view,'perfil-usuario');
});

test('perfil staff jugador conserva todos los campos, avisos y equipos sin edición de foto', () => {
  const {app} = client(); app.account.open('jugador','j');
  app.cache.jugadores[0].Nombre='Ana "<script>';
  const html=app.account.perfilStaffHtml(app.account.persona());
  for (const key of Object.keys(playerData)) assert.ok(html.includes('data-perfil="'+key+'"'),key);
  assert.match(html,/data-perfil="NotificarAusenciasPadre1" checked/);
  assert.doesNotMatch(html,/data-perfil="NotificarAusenciasPadre2" checked/);
  assert.match(html,/Principal/); assert.match(html,/Gestionar equipo/);
  assert.match(html,/eliminarStaff/); assert.match(html,/&quot;&lt;script&gt;/);
  assert.doesNotMatch(html,/guardarFoto|FotoURL|data-perfil="PIN"|recuper/);
});

test('perfil staff muestra solo los equipos propios y ofrece el resto tras «Gestionar en otro equipo»', () => {
  const {app} = client(true); app.account.open('jugador','j');
  app.cache.equipos = [{ID:'sec',Nombre:'Junior'},{ID:'team',Nombre:'Cadete'},{ID:'free',Nombre:'Senior'}];
  app.cache.jugadoresEquipos.push({ID:'rel2',ID_Jugador:'j',ID_Equipo:'sec',Tipo:'Secundario'},{ID:'old',ID_Jugador:'j',ID_Equipo:'free',Tipo:'Principal',Activo:false});
  const [propios, otros = ''] = app.account.perfilStaffHtml(app.account.persona()).split('<details');
  assert.ok(propios.indexOf('Cadete') < propios.indexOf('Junior'), 'Principal primero');
  assert.match(propios,/>Principal</); assert.match(propios,/>Secundario</);
  assert.doesNotMatch(propios,/Senior|&quot;free&quot;/);
  assert.match(otros,/Gestionar en otro equipo/); assert.match(otros,/equipo-form'\]\.cargar\(&quot;free&quot;,\{&quot;tipo&quot;:&quot;jug&quot;,&quot;id&quot;:&quot;j&quot;\}\)/);
  assert.doesNotMatch(otros,/&quot;team&quot;|&quot;sec&quot;/);
  const coach = client(); coach.app.account.open('jugador','j');
  coach.app.cache.equipos.push({ID:'free',Nombre:'Senior'});
  const html = coach.app.account.perfilStaffHtml(coach.app.account.persona());
  assert.doesNotMatch(html,/<details|Senior/, 'sin equipos editables fuera de los propios no hay listado');
});

test('staff guarda jugador con endpoint general y conserva cero y preferencias familiares', async () => {
  const {app,calls} = client(); app.account.open('jugador','j'); app.state._formIsDirty=true;
  await app.account.guardarStaffPerfil({...playerData});
  const sent=calls.find(c=>c.fn);
  assert.equal(sent.fn,'actualizarJugador'); assert.deepEqual(sent.args,['j',playerData]);
  assert.equal(app.cache.getJugadorById('j').Dorsal,'0');
  assert.equal(app.cache.getJugadorById('j').NotificarAusenciasPadre2,false);
  assert.equal(app.state._formIsDirty,false);
  assert.equal(calls.at(-1).view,'perfil-usuario');
});

test('duplicados y avisos familiares requieren confirmaciones independientes; errores no envían', () => {
  const {app,calls,confirmations,notices}=client(); app.account.open('jugador','j');
  app.cache.jugadores.push({ID:'dup',Nombre:'Ana',Apellidos:'Baeza'});
  const data={...playerData,EmailPadre1:'',EmailPadre2:''};
  app.account.guardarStaffPerfil(data);
  assert.equal(confirmations[0].title,'Jugador duplicado'); assert.equal(calls.filter(c=>c.fn).length,0);
  confirmations.shift().confirm(); assert.equal(confirmations[0].title,'Aviso de notificaciones');
  confirmations.shift().confirm(); assert.equal(calls.filter(c=>c.fn).length,1);
  app.account.guardarStaffPerfil({...playerData,EmailPadre2:'invalid'});
  assert.match(notices.at(-1).message,/familiar 2/); assert.equal(calls.filter(c=>c.fn).length,1);
});

test('entrenador puede cambiar usuario y PIN ajenos sin PIN previo; código familias exclusivo de admin', () => {
  const fields={'staff-usuario':{value:'ANA.NUEVA'},'staff-pin':{value:'4567'},'staff-pin-confirm':{value:'4567'},'staff-codigo':{value:' xyz987 '}};
  const {app,calls,confirmations}=client(false,fields); app.account.open('jugador','j');
  app.views['seguridad-opcion']._opcion='pin';
  const html=app.account.seguridadStaffHtml(app.account.persona());
  assert.doesNotMatch(html,/pin-actual|recuperar|recordatorio|staff-codigo/);
  app.account.guardarStaffCredenciales(); confirmations.shift().confirm();
  assert.deepEqual(calls.find(c=>c.fn).args,['j','ana.nueva','4567',null]);
  assert.equal(calls.find(c=>c.fn).fn,'actualizarCredencialesJugador');
  assert.equal(fields['staff-pin'].value,'');
  assert.equal(app.cache.getJugadorById('j').Usuario,'ana.nueva');
  app.views['seguridad-opcion']._opcion='codigo';
  assert.equal(app.account.seguridadStaffHtml(app.account.persona()),''); app.account.guardarStaffCodigo();
  assert.equal(confirmations.length,0);
  app.state.esAdmin=true; assert.match(app.account.seguridadStaffHtml(app.account.persona()),/staff-codigo/);
  app.account.guardarStaffCodigo(); confirmations.shift().confirm();
  assert.deepEqual(calls.filter(c=>c.fn).at(-1).args,['j',null,null,'XYZ987']);
});

test('PIN inválido, confirmación distinta y usuario duplicado no envían credenciales', () => {
  const fields={'staff-usuario':{value:'ana'},'staff-pin':{value:'123'},'staff-pin-confirm':{value:'123'}};
  const {app,calls,confirmations,notices}=client(false,fields); app.account.open('jugador','j');
  app.account.guardarStaffCredenciales(); assert.match(notices.at(-1).message,/4 y 6/);
  fields['staff-pin'].value='1234'; app.account.guardarStaffCredenciales(); assert.match(notices.at(-1).message,/coinciden/);
  fields['staff-pin-confirm'].value='1234'; fields['staff-usuario'].value='otra';
  app.cache.jugadores.push({ID:'dup',Usuario:'otra'}); app.account.guardarStaffCredenciales(); assert.match(notices.at(-1).message,/ya está en uso/);
  assert.equal(confirmations.length,0); assert.equal(calls.filter(c=>c.fn).length,0);
});

test('admin edita entrenador, avisa cambio email y lo promueve sin PIN aparte', () => {
  const {app,calls,confirmations}=client(true); app.account.open('entrenador','e');
  const html=app.account.perfilStaffHtml(app.account.persona());
  for (const key of ['Nombre','Apellidos','Email','Telefono','EsAdmin']) assert.match(html,new RegExp('data-perfil="'+key+'"'));
  assert.doesNotMatch(html,/FotoURL|recuper|data-perfil="PIN"/);
  const data={Nombre:'Luis',Apellidos:'Coach',Email:'nuevo@example.test',Telefono:'600000000',EsAdmin:true};
  app.account.guardarStaffPerfil({...data});
  assert.equal(confirmations.at(-1).title,'Cambio de email'); confirmations.pop().confirm();
  const sent=calls.find(c=>c.fn); assert.equal(sent.fn,'actualizarEntrenador'); assert.deepEqual(sent.args[1],data);
  assert.equal(app.cache.getEntrenadorById('e').EsAdmin,true);
});

test('admin cambia PIN entrenador mediante actualizarEntrenador y borra desde perfil unificado', () => {
  const fields={'staff-pin':{value:'4567'},'staff-pin-confirm':{value:'4567'}};
  const {app,calls,confirmations}=client(true,fields); app.account.open('entrenador','e');
  app.account.guardarStaffCredenciales(); confirmations.shift().confirm();
  assert.deepEqual(calls.find(c=>c.fn).args,['e',{PIN:'4567'}]);
  assert.equal(calls.find(c=>c.fn).fn,'actualizarEntrenador');
  app.cache.entrenadoresEquipos=[{ID:'r',ID_Entrenador:'e',ID_Equipo:'team'}];
  app.account.eliminarStaff(); confirmations.shift().confirm();
  assert.equal(calls.filter(c=>c.fn).at(-1).fn,'eliminarEntrenador');
  assert.equal(app.cache.getEntrenadorById('e'),null);
  assert.equal(app.cache.entrenadoresEquipos.length,0); assert.equal(app.account.target,null);
});

test('formularios anteriores solo crean y ya no contienen credenciales ni eliminación de edición', () => {
  const {app}=client();
  assert.equal(app.views['jugador-form'],undefined,'el alta de jugador es el asistente App.views.altaJugador');
  assert.equal(app.views['entrenador-form'].cargar,undefined); assert.equal(app.views['entrenador-form'].eliminar,undefined);
  const source=fs.readFileSync(path.join(__dirname,'../ui/app.html'),'utf8');
  assert.doesNotMatch(source,/formJugadorId|formEntrenadorId/);
  const markup=fs.readFileSync(path.join(__dirname,'../ui/Index.html'),'utf8');
  assert.doesNotMatch(markup,/id="(?:jug-credenciales-zona|ent-credenciales-zona|jugador-delete-zone|entrenador-delete-zone)"/);
});

test('entrenador elimina jugador con sus asignaciones; permisos impiden mutar entrenadores ajenos', () => {
  const {app,calls,confirmations}=client(); app.account.open('jugador','j');
  app.account.eliminarStaff(); confirmations.shift().confirm();
  assert.equal(calls.find(c=>c.fn).fn,'eliminarJugador');
  assert.equal(app.cache.jugadores.length,0); assert.equal(app.cache.jugadoresEquipos.length,0);
  app.account.target={tipo:'entrenador',id:'e'};
  assert.equal(app.account.perfilStaffHtml(app.account.persona()),'');
  app.account.guardarStaffPerfil({Nombre:'Cambio',Apellidos:'Ajeno',Email:'otro@example.test'});
  app.account.guardarStaffCredenciales(); app.account.eliminarStaff();
  assert.equal(confirmations.length,0); assert.equal(calls.filter(c=>c.fn).length,1);
});

test('fallo de perfil conserva caché y borrador sin navegar a resumen ni duplicar el error del indicador', async () => {
  const {app,calls,notices}=client(); app.account.open('jugador','j'); app.state._formIsDirty=true;
  app.operation.run=()=>Promise.reject(new Error('No se pudo actualizar el jugador'));
  await app.account.guardarStaffPerfil({...playerData,Nombre:'Nuevo'});
  assert.equal(app.cache.getJugadorById('j').Nombre,'Ana');
  assert.equal(app.state._formIsDirty,true); assert.equal(calls.length,1);
  assert.deepEqual(notices,[]);
});

test('una relación Visor antigua se muestra como Entrenador sin selector y el formulario de equipo la conserva', () => {
  const {app}=client(true); app.account.open('entrenador','e');
  app.cache.entrenadoresEquipos=[{ID:'real',ID_Entrenador:'e',ID_Equipo:'team',TipoRol:'Visor',Activo:true}];
  const html=app.account.perfilStaffHtml(app.account.persona());
  assert.match(html,/account-team-chip is-main">Entrenador</); assert.doesNotMatch(html,/<select|Visor/);
  assert.match(html,/equipo-form'\]\.cargar\(&quot;team&quot;,\{&quot;tipo&quot;:&quot;ent&quot;,&quot;id&quot;:&quot;e&quot;\}\)/);
  app.cache._setRelacionesEquipo('team',[],[{ID:'e'}]);
  assert.equal(app.cache.entrenadoresEquipos.length,1); assert.equal(app.cache.entrenadoresEquipos[0].ID,'real');
  assert.equal(app.cache.entrenadoresEquipos[0].TipoRol,'Entrenador');
});
