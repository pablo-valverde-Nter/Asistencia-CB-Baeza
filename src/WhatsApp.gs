/**
 * WhatsApp.gs
 * Avisos por WhatsApp a las familias. Dos modos:
 *  - Cloud API (WhatsApp Business): solo si existen las Script Properties WHATSAPP_TOKEN y WHATSAPP_PHONE_ID.
 *    Los mensajes iniciados por el club exigen una plantilla aprobada por Meta (WHATSAPP_TEMPLATE, por defecto
 *    PLANTILLA_CANCELACION, idioma WHATSAPP_TEMPLATE_LANG, por defecto 'es').
 *  - Enlaces (sin configuración): devuelve un enlace https://wa.me por número con el mensaje precargado para que
 *    el entrenador lo envíe con un toque. No se envía nada automáticamente.
 * Todas las funciones son internas. Nunca se registran números ni mensajes en los logs.
 */

const WhatsApp = {
  API_URL: 'https://graph.facebook.com/v21.0/',
  PLANTILLA_CANCELACION: 'cancelacion_entrenamiento',

  // Configuración de la Cloud API o null si falta el token o el ID del número (modo enlaces).
  config_() {
    const props = PropertiesService.getScriptProperties();
    const token = String(props.getProperty('WHATSAPP_TOKEN') || '').trim();
    const phoneId = String(props.getProperty('WHATSAPP_PHONE_ID') || '').trim();
    if (!token || !phoneId) return null;
    return {
      token: token,
      phoneId: phoneId,
      plantilla: String(props.getProperty('WHATSAPP_TEMPLATE') || '').trim() || WhatsApp.PLANTILLA_CANCELACION,
      idioma: String(props.getProperty('WHATSAPP_TEMPLATE_LANG') || '').trim() || 'es',
    };
  },

  // Número en formato internacional (+34…) o '' si no es válido. Sin prefijo se asume España (como en Contactar).
  numero(valor) {
    let telefono = String(valor || '').trim().replace(/[\s().-]/g, '');
    if (/^00\d+$/.test(telefono)) telefono = '+' + telefono.slice(2);
    if (/^\d{9}$/.test(telefono)) telefono = '+34' + telefono;
    if (/^34\d{9}$/.test(telefono)) telefono = '+' + telefono;
    return /^\+\d{7,15}$/.test(telefono) ? telefono : '';
  },

  enlace(telefono, texto) {
    return 'https://wa.me/' + telefono.slice(1) + '?text=' + encodeURIComponent(texto);
  },

  /**
   * Avisa a cada destino por la Cloud API o, sin configuración, prepara sus enlaces wa.me.
   * @param {{ telefono: string }[]} destinos - Números ya normalizados con numero() y sin repetir
   * @param {string} mensaje      - Texto completo del aviso (enlaces)
   * @param {string[]} parametros - Variables {{1}}, {{2}}… de la plantilla (Cloud API)
   * @returns {{ modo: 'cloud-api'|'enlaces', enviados: Object[], fallidos: Object[] }}
   *   En modo enlaces cada destino vuelve en `enviados` con su `url`; en Cloud API los fallidos llevan `url`
   *   para que el entrenador pueda enviarlos a mano.
   */
  avisar(destinos, mensaje, parametros) {
    const config = WhatsApp.config_();
    if (!config) {
      return { modo: 'enlaces', enviados: destinos.map(d => Object.assign({}, d, { url: WhatsApp.enlace(d.telefono, mensaje) })), fallidos: [] };
    }
    const enviados = [], fallidos = [];
    destinos.forEach(d => {
      if (WhatsApp.enviarPlantilla_(config, d.telefono, parametros)) enviados.push(d);
      else fallidos.push(Object.assign({}, d, { url: WhatsApp.enlace(d.telefono, mensaje) }));
    });
    return { modo: 'cloud-api', enviados: enviados, fallidos: fallidos };
  },

  enviarPlantilla_(config, telefono, parametros) {
    const cuerpo = {
      messaging_product: 'whatsapp',
      to: telefono.slice(1),
      type: 'template',
      template: {
        name: config.plantilla,
        language: { code: config.idioma },
        components: [{ type: 'body', parameters: parametros.map(texto => ({ type: 'text', text: texto })) }],
      },
    };
    try {
      const respuesta = UrlFetchApp.fetch(WhatsApp.API_URL + encodeURIComponent(config.phoneId) + '/messages', {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + config.token },
        payload: JSON.stringify(cuerpo),
        muteHttpExceptions: true,
      });
      const codigo = respuesta.getResponseCode();
      if (codigo >= 200 && codigo < 300) return true;
      Logger.log('[WhatsApp] La Cloud API rechazó un aviso (HTTP ' + codigo + ').');
      return false;
    } catch (e) {
      Logger.log('[WhatsApp] No se pudo contactar con la Cloud API.');
      return false;
    }
  },
};
