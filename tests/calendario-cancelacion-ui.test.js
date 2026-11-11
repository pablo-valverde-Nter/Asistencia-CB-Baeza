const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function client() {
  const elements = {};
  const document = {
    addEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
    getElementById: id => (elements[id] ||= { innerHTML: '', classList: { add() {}, remove() {} } }),
  };
  const context = vm.createContext({ document, window: { addEventListener() {} }, localStorage: { getItem: () => null, setItem() {} }, navigator: { userAgent: 'test' } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/app.html'), 'utf8').replace(/^<script[^>]*>|<\/script>\s*$/g, ''), context);
  context._hoy = () => '2026-11-16';
  const app = vm.runInContext('App', context);
  app.cache.equipos = [{ ID: 'e1', Nombre: 'Cadete <Norte>' }];
  const sesion = { ID: 's1', ID_Equipo: 'e1', Fecha: '2026-11-16', HoraInicio: '19:00', HoraFin: '20:30', Cancelada: true,
    MotivoCancelacion: 'Pista <cerrada>', DetalleCancelacion: 'Aviso <script>', CanceladoPor: 'Ana <Entrenadora>', FechaCancelacion: '2026-11-15 17:20', CanalAvisoCancelacion: 'whatsapp' };
  app.cache.sesiones = [sesion];
  return { app, elements, sesion };
}

test('calendario distingue cancelaciones en semana, cuadrícula, puntos, agenda y leyenda para ambos perfiles', () => {
  const { app, elements, sesion } = client();
  for (const mode of ['coach', 'player']) {
    app.calendar.render(mode, 'calendar-' + mode, [sesion], mode, 'j1');
    const html = elements['calendar-' + mode].innerHTML;
    assert.match(html, /calendar-weekly-item cancelled/);
    assert.match(html, /calendar-day[^\"]*has-cancelled/);
    assert.match(html, /calendar-dot cancelled/);
    assert.match(html, /calendar-event cancelled/);
    assert.match(html, /calendar-legend[\s\S]*Cancelada/);
    assert.match(html, /contiene entrenamiento cancelado/);
    assert.doesNotMatch(html, /calendar-event-stats/);
  }
});

test('entrenador y familia ven la misma ficha escapada; solo el entrenador puede reactivar', () => {
  const { app, elements, sesion } = client();
  let modal;
  app.openModal = (title, html) => { modal = { title, html }; };
  app.views.sesiones.abrirSesion(sesion.ID);
  const card = app.calendar.fichaCancelacion(sesion);
  assert.equal(modal.title, 'Sesión cancelada');
  assert.ok(modal.html.includes(card));
  assert.match(modal.html, /reactivar\(/);
  for (const valor of ['Cadete &lt;Norte&gt;', '19:00', '20:30', 'Pista &lt;cerrada&gt;', 'Aviso &lt;script&gt;', 'Ana &lt;Entrenadora&gt;', '2026', '17:20', 'WhatsApp']) assert.ok(card.includes(valor), valor);
  assert.doesNotMatch(card, /<script>|<Entrenadora>|<cerrada>/);
  app.state.jugador = { ID: 'j1' };
  app.state.sesionJugadorId = sesion.ID;
  app.views['detalle-sesion-jugador'].render();
  assert.equal(elements['detalle-sesion-jug-estado'].innerHTML, card);
  assert.equal(elements['detalle-sesion-jug-actions'].innerHTML, '');
});

test('sesiones antiguas y canales opcionales se muestran sin campos inventados', () => {
  const { app, sesion } = client();
  delete sesion.CanceladoPor;
  delete sesion.FechaCancelacion;
  delete sesion.CanalAvisoCancelacion;
  delete sesion.DetalleCancelacion;
  const html = app.calendar.fichaCancelacion(sesion);
  assert.match(html, /Entrenamiento cancelado/);
  assert.match(html, /Pista &lt;cerrada&gt;/);
  assert.doesNotMatch(html, /undefined|null|Cancelado por|Fecha de cancelación|Canal de aviso|cancelacion-ficha-detalle/);
  for (const [valor, etiqueta] of [['correo', 'Correo'], ['copiar', 'Copiar mensaje'], ['ninguno', 'No avisar']]) {
    sesion.CanalAvisoCancelacion = valor;
    assert.ok(app.calendar.fichaCancelacion(sesion).includes(etiqueta));
  }
});
