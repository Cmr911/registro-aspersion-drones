/* Persistencia en localStorage con adaptador inyectable. Nunca falla en silencio. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(require('./model.js')); }
  else { root.DDO = root.DDO || {}; root.DDO.storage = factory(root.DDO.model); }
})(typeof self !== 'undefined' ? self : this, function (model) {
  'use strict';

  var CLAVE = 'ddo.registro-aspersion.v1';

  function tipoError(e) {
    var n = e && (e.name || '');
    var c = e && e.code;
    if (n === 'QuotaExceededError' || n === 'NS_ERROR_DOM_QUOTA_REACHED' || c === 22 || c === 1014) return 'cuota';
    if (n === 'SecurityError') return 'bloqueado';
    return 'escritura';
  }

  var MENSAJES = {
    cuota: 'El navegador no tiene espacio para guardar más datos.',
    bloqueado: 'El navegador bloquea el almacenamiento (modo privado o configuración).',
    escritura: 'No se pudo guardar en el navegador.',
    lectura: 'No se pudo leer el almacenamiento del navegador.',
    noDisponible: 'El almacenamiento del navegador no está disponible.',
    protegido: 'Guardado en pausa: primero descarga la copia de rescate de los datos dañados.',
    serializacion: 'Los datos no se pudieron preparar para guardar.'
  };

  function err(tipo) { return { tipo: tipo, mensaje: MENSAJES[tipo] }; }

  function estadoValido(e) {
    return e && typeof e === 'object' && e.schemaVersion === model.SCHEMA_VERSION && Array.isArray(e.registros);
  }

  function normalizar(e) {
    return {
      schemaVersion: model.SCHEMA_VERSION,
      registros: e.registros,
      perfil: e.perfil && typeof e.perfil === 'object' ? e.perfil : null,
      ultimoRespaldo: typeof e.ultimoRespaldo === 'string' ? e.ultimoRespaldo : null
    };
  }

  /**
   * opciones: {adaptador (getItem/setItem/removeItem), clave, ahora: () => ISO}
   */
  function crearAlmacen(opciones) {
    opciones = opciones || {};
    var adaptador = opciones.adaptador || null;
    var clave = opciones.clave || CLAVE;
    var ahora = opciones.ahora || function () { return new Date().toISOString(); };
    var protegido = false;

    /** Devuelve {ok, estado, error?, rescate?:{clave, crudo, guardado}}. El estado siempre es usable. */
    function cargar() {
      if (!adaptador) return { ok: false, estado: model.estadoVacio(), error: err('noDisponible') };
      var crudo;
      try { crudo = adaptador.getItem(clave); }
      catch (e) { return { ok: false, estado: model.estadoVacio(), error: err('lectura') }; }
      if (crudo === null || crudo === undefined || crudo === '') return { ok: true, estado: model.estadoVacio() };

      var datos = null;
      try { datos = model.migrar(JSON.parse(crudo)); } catch (e) { datos = null; }
      if (datos && estadoValido(datos)) return { ok: true, estado: normalizar(datos) };

      // Corrupto o versión desconocida: no sobrescribir; guardar copia de rescate.
      var claveRescate = clave + '.corrupto.' + ahora().replace(/[:.]/g, '-');
      var guardado = false;
      try { adaptador.setItem(claveRescate, crudo); guardado = true; } catch (e) { guardado = false; }
      if (!guardado) protegido = true; // sin copia de rescate, no tocar la clave original
      return {
        ok: false, estado: model.estadoVacio(),
        error: { tipo: 'corrupto', mensaje: 'Los datos guardados están dañados o son de una versión desconocida.' },
        rescate: { clave: guardado ? claveRescate : null, crudo: crudo, guardado: guardado }
      };
    }

    /** Escritura atómica: serializa y verifica antes de escribir. Si falla, lo guardado sigue intacto. */
    function guardar(estado) {
      if (!adaptador) return { ok: false, error: err('noDisponible') };
      if (protegido) return { ok: false, error: err('protegido') };
      var texto;
      try {
        if (!estadoValido(estado)) return { ok: false, error: err('serializacion') };
        texto = JSON.stringify(normalizar(estado));
        if (!estadoValido(JSON.parse(texto))) return { ok: false, error: err('serializacion') };
      } catch (e) { return { ok: false, error: err('serializacion') }; }
      try { adaptador.setItem(clave, texto); }
      catch (e) { return { ok: false, error: err(tipoError(e)) }; }
      return { ok: true };
    }

    /** Permite volver a guardar tras descargar la copia de rescate. */
    function liberar() { protegido = false; }
    function estaProtegido() { return protegido; }

    return { clave: clave, cargar: cargar, guardar: guardar, liberar: liberar, estaProtegido: estaProtegido };
  }

  /** Devuelve localStorage o null si no se puede acceder. */
  function adaptadorNavegador() {
    try {
      var ls = window.localStorage;
      return ls || null;
    } catch (e) { return null; }
  }

  /** Pide almacenamiento persistente si existe; nunca depende de ello. */
  function pedirPersistencia(nav) {
    try {
      if (nav && nav.storage && typeof nav.storage.persist === 'function') {
        return nav.storage.persist().catch(function () { return false; });
      }
    } catch (e) { /* ignorado */ }
    return Promise.resolve(false);
  }

  return { CLAVE: CLAVE, crearAlmacen: crearAlmacen, adaptadorNavegador: adaptadorNavegador, pedirPersistencia: pedirPersistencia };
});
