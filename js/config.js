/*
 * Configuración editable. Los valores 'TODO_CONFIGURAR' ocultan el botón o enlace correspondiente.
 * Solo se aceptan URLs https:// o mailto:.
 */
(function (root) {
  var config = {
    marca: 'Datos de Occidente',
    nombreHerramienta: 'Registro de Aspersión',
    urlSitio: 'https://cmr911.github.io/registro-aspersion-drones/',
    urlRepositorio: 'https://github.com/Cmr911/registro-aspersion-drones',
    // Otras herramientas de Datos de Occidente (enlaces cruzados).
    urlCalculadora: 'https://cmr911.github.io/calculadora-aspersion-drones/',
    urlLector: 'https://cmr911.github.io/lector-bitacoras-drones/',

    // Igual que en la calculadora. WhatsApp: 'https://wa.me/57XXXXXXXXXX' · correo: 'mailto:correo@dominio.com'
    urlFeedback: 'TODO_CONFIGURAR',
    // Web, LinkedIn o Instagram de la marca.
    urlMarca: 'TODO_CONFIGURAR',

    monedaPorDefecto: 'COP',
    diasAvisoRespaldo: 30,

    // Mensajes prellenados (WhatsApp/correo) para saber desde qué parte de la app escriben.
    mensajes: {
      general: 'Hola, uso el Registro de Aspersión. Me serviría una herramienta para: ',
      evidencia: 'Hola, uso el Registro de Aspersión. Me serviría enviar la constancia con fotos y ubicación del lote. ',
      equipo: 'Hola, uso el Registro de Aspersión. Tenemos varios pilotos/drones y nos serviría verlo todo junto. ',
      facturacion: 'Hola, uso el Registro de Aspersión. Me serviría pasar estos datos a mi software de facturación. '
    }
  };
  if (typeof module === 'object' && module.exports) { module.exports = config; }
  else { root.DDO = root.DDO || {}; root.DDO.config = config; }
})(typeof self !== 'undefined' ? self : this);
