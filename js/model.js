/* Modelo: validación, normalización y totales. Lógica pura, sin DOM. */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) { module.exports = m; }
  else { root.DDO = root.DDO || {}; root.DDO.model = m; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SCHEMA_VERSION = 1;

  var LIMITES = {
    cliente: 80, predio: 80, cultivo: 60, ubicacion: 120, operador: 60, dron: 60,
    agronomo: 60, numeroReceta: 40, boquilla: 40, observaciones: 500,
    productoNombre: 40, loteProducto: 30, maxProductos: 8
  };

  var LIMITES_PERFIL = { nombre: 80, idTributaria: 30, telefono: 30, correo: 80, ciudad: 60, certificacion: 80 };

  // Advertencias no bloqueantes. Clima: referencia general (CropLife Latin America, POE drones).
  var UMBRALES = { areaHaAlta: 5000, vientoKmh: 11, temperaturaC: 35, humedadPct: 50 };

  var UNIDADES = ['L/ha', 'mL/ha', 'kg/ha', 'g/ha'];

  var MONEDAS = ['COP', 'USD', 'MXN', 'PEN', 'ARS', 'CLP', 'BOB', 'GTQ', 'HNL', 'NIO', 'CRC', 'PAB', 'DOP', 'PYG', 'UYU', 'VES'];

  var RE_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
  var RE_NUMERO = /^-?(\d+([.,]\d*)?|[.,]\d+)$/;
  var RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
  var RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
  var RE_ID = /^[A-Za-z0-9_-]{1,64}$/;
  var RE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

  function redondear(x, dec) {
    var f = Math.pow(10, dec === undefined ? 6 : dec);
    return Math.round(x * f) / f;
  }

  function vacio(v) { return v === undefined || v === null || (typeof v === 'string' && v.trim() === ''); }

  /** Convierte "5,5" | "5.5" | 5.5 en número. Devuelve {ok, valor} o {ok:false, error}. Vacío → valor null. */
  function parseNumero(v) {
    if (vacio(v)) return { ok: true, valor: null };
    if (typeof v === 'number') {
      return isFinite(v) ? { ok: true, valor: v } : { ok: false, error: 'Debe ser un número válido.' };
    }
    if (typeof v !== 'string') return { ok: false, error: 'Debe ser un número válido.' };
    var s = v.trim();
    if (!RE_NUMERO.test(s)) return { ok: false, error: 'Debe ser un número (usa coma o punto decimal, sin separador de miles).' };
    var n = Number(s.replace(',', '.'));
    if (!isFinite(n)) return { ok: false, error: 'Debe ser un número válido.' };
    return { ok: true, valor: n };
  }

  /** Normaliza texto. multilinea=false colapsa todo espacio en uno. Devuelve {ok, valor} o {ok:false, error}. */
  function limpiarTexto(v, max, multilinea) {
    if (v === undefined || v === null) return { ok: true, valor: '' };
    if (typeof v !== 'string' && typeof v !== 'number') return { ok: false, error: 'Texto no válido.' };
    var s = String(v);
    if (multilinea) {
      s = s.replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(/[ ]+\n/g, '\n').trim();
    } else {
      s = s.replace(/[\t\r\n]+/g, ' ').replace(/ {2,}/g, ' ').trim();
    }
    if (RE_CONTROL.test(s)) return { ok: false, error: 'Contiene caracteres no permitidos.' };
    if (max && s.length > max) return { ok: false, error: 'Máximo ' + max + ' caracteres (tiene ' + s.length + ').' };
    return { ok: true, valor: s };
  }

  function diasDelMes(a, m) {
    if (m === 2) return (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0 ? 29 : 28;
    return [4, 6, 9, 11].indexOf(m) >= 0 ? 30 : 31;
  }

  /** Valida "YYYY-MM-DD" sin usar Date (evita desfases por zona horaria). */
  function esFechaValida(s) {
    if (typeof s !== 'string') return false;
    var r = RE_FECHA.exec(s);
    if (!r) return false;
    var a = +r[1], m = +r[2], d = +r[3];
    return a >= 1900 && a <= 2999 && m >= 1 && m <= 12 && d >= 1 && d <= diasDelMes(a, m);
  }

  function esHoraValida(s) { return typeof s === 'string' && RE_HORA.test(s); }

  function dos(n) { return (n < 10 ? '0' : '') + n; }

  /** Fecha local de hoy como "YYYY-MM-DD" (getters locales, nunca UTC). */
  function hoyLocal(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate());
  }

  function generarId() {
    var c = (typeof crypto !== 'undefined') ? crypto : null;
    try { if (c && typeof c.randomUUID === 'function') return c.randomUUID(); } catch (e) { /* file:// sin contexto seguro */ }
    var hex = '';
    try {
      if (c && typeof c.getRandomValues === 'function') {
        var b = new Uint8Array(16); c.getRandomValues(b);
        for (var i = 0; i < b.length; i++) hex += (b[i] < 16 ? '0' : '') + b[i].toString(16);
      }
    } catch (e2) { hex = ''; }
    if (!hex) { for (var j = 0; j < 32; j++) hex += Math.floor(Math.random() * 16).toString(16); }
    return Date.now().toString(36) + '-' + hex.slice(0, 20);
  }

  function esId(s) { return typeof s === 'string' && RE_ID.test(s); }
  function esISO(s) { return typeof s === 'string' && RE_ISO.test(s); }

  /** Clave de agrupación: minúsculas, sin tildes, espacios colapsados. */
  function normalizarNombre(s) {
    var t = String(s === undefined || s === null ? '' : s).toLowerCase();
    if (t.normalize) t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return t.replace(/\s+/g, ' ').trim();
  }

  /** Producto total = dosis × área, con mL→L y g→kg. */
  function productoTotal(dosis, unidad, areaHa) {
    if (typeof dosis !== 'number' || typeof areaHa !== 'number' || !isFinite(dosis) || !isFinite(areaHa)) return null;
    var base = dosis * areaHa;
    switch (unidad) {
      case 'L/ha': return { cantidad: redondear(base), unidad: 'L' };
      case 'mL/ha': return { cantidad: redondear(base / 1000), unidad: 'L' };
      case 'kg/ha': return { cantidad: redondear(base), unidad: 'kg' };
      case 'g/ha': return { cantidad: redondear(base / 1000), unidad: 'kg' };
      default: return null;
    }
  }

  // ---- Validación de registro ----

  var CAMPOS_TEXTO = [
    ['cliente', true], ['predio', false], ['cultivo', false], ['ubicacion', false],
    ['operador', false], ['dron', false], ['agronomo', false], ['numeroReceta', false], ['boquilla', false]
  ];

  /**
   * Valida y normaliza datos de un registro (desde formulario o importación).
   * Devuelve {ok, datos, errores:{campo:msg}, advertencias:[{campo, mensaje}]}. Nunca lanza.
   * opciones.hoy: "YYYY-MM-DD" para advertir fechas futuras.
   */
  function validarRegistro(input, opciones) {
    var errores = {}, advertencias = [], d = {};
    opciones = opciones || {};
    try {
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { ok: false, datos: null, errores: { general: 'Registro no válido.' }, advertencias: [] };
      }

      // Fecha
      var fecha = typeof input.fecha === 'string' ? input.fecha.trim() : '';
      if (!fecha) errores.fecha = 'La fecha es obligatoria.';
      else if (!esFechaValida(fecha)) errores.fecha = 'Fecha no válida (AAAA-MM-DD).';
      else {
        d.fecha = fecha;
        if (opciones.hoy && fecha > opciones.hoy) advertencias.push({ campo: 'fecha', mensaje: 'La fecha está en el futuro.' });
      }

      // Horas
      ['horaInicio', 'horaFin'].forEach(function (k) {
        var h = typeof input[k] === 'string' ? input[k].trim() : (vacio(input[k]) ? '' : null);
        if (h === null) { errores[k] = 'Hora no válida (HH:MM).'; return; }
        if (!h) { d[k] = ''; return; }
        if (!esHoraValida(h)) errores[k] = 'Hora no válida (HH:MM).';
        else d[k] = h;
      });
      if (d.horaInicio && d.horaFin && d.horaFin < d.horaInicio) {
        advertencias.push({ campo: 'horaFin', mensaje: 'La hora de fin es anterior a la de inicio (¿cruzó la medianoche?).' });
      }

      // Textos de una línea
      CAMPOS_TEXTO.forEach(function (par) {
        var k = par[0], r = limpiarTexto(input[k], LIMITES[k], false);
        if (!r.ok) errores[k] = r.error;
        else if (par[1] && !r.valor) errores[k] = 'Este campo es obligatorio.';
        else d[k] = r.valor;
      });

      var obs = limpiarTexto(input.observaciones, LIMITES.observaciones, true);
      if (!obs.ok) errores.observaciones = obs.error; else d.observaciones = obs.valor;

      // Números
      function num(k, reglas) {
        var r = parseNumero(input[k]);
        if (!r.ok) { errores[k] = r.error; return; }
        if (r.valor === null) {
          if (reglas.obligatorio) errores[k] = 'Este campo es obligatorio.';
          else d[k] = null;
          return;
        }
        var v = r.valor;
        if (reglas.mayorQue !== undefined && !(v > reglas.mayorQue)) { errores[k] = 'Debe ser mayor que ' + reglas.mayorQue + '.'; return; }
        if (reglas.min !== undefined && v < reglas.min) { errores[k] = 'Debe ser mayor o igual a ' + reglas.min + '.'; return; }
        if (reglas.max !== undefined && v > reglas.max) { errores[k] = 'Debe ser menor o igual a ' + reglas.max + '.'; return; }
        d[k] = v;
      }
      num('areaHa', { obligatorio: true, mayorQue: 0, max: 1e7 });
      num('volumenLHa', { mayorQue: 0, max: 1e5 });
      num('alturaVueloM', { min: 0, max: 1000 });
      num('temperaturaC', { min: -50, max: 70 });
      num('humedadPct', { min: 0, max: 100 });
      num('vientoKmh', { min: 0, max: 500 });
      num('tarifaPorHa', { min: 0, max: 1e12 });

      if (d.areaHa > UMBRALES.areaHaAlta) advertencias.push({ campo: 'areaHa', mensaje: 'Área inusualmente grande (más de ' + UMBRALES.areaHaAlta + ' ha). Verifica.' });
      if (d.vientoKmh !== null && d.vientoKmh > UMBRALES.vientoKmh) advertencias.push({ campo: 'vientoKmh', mensaje: 'Viento mayor a ' + UMBRALES.vientoKmh + ' km/h: riesgo de deriva (referencia general; verifica la etiqueta).' });
      if (d.temperaturaC !== null && d.temperaturaC > UMBRALES.temperaturaC) advertencias.push({ campo: 'temperaturaC', mensaje: 'Temperatura mayor a ' + UMBRALES.temperaturaC + ' °C: riesgo de evaporación (referencia general; verifica la etiqueta).' });
      if (d.humedadPct !== null && d.humedadPct < UMBRALES.humedadPct) advertencias.push({ campo: 'humedadPct', mensaje: 'Humedad menor a ' + UMBRALES.humedadPct + ' %: riesgo de evaporación (referencia general; verifica la etiqueta).' });

      // Moneda (solo relevante con tarifa)
      var moneda = typeof input.moneda === 'string' ? input.moneda.trim().toUpperCase() : '';
      if (d.tarifaPorHa !== null && d.tarifaPorHa !== undefined) {
        if (MONEDAS.indexOf(moneda) < 0) {
          if (moneda) errores.moneda = 'Moneda no válida.';
          else moneda = opciones.monedaPorDefecto && MONEDAS.indexOf(opciones.monedaPorDefecto) >= 0 ? opciones.monedaPorDefecto : 'COP';
        }
        d.moneda = moneda;
      } else {
        d.moneda = MONEDAS.indexOf(moneda) >= 0 ? moneda : '';
      }

      // Productos
      var prods = input.productos === undefined || input.productos === null ? [] : input.productos;
      if (!Array.isArray(prods)) errores.productos = 'Lista de productos no válida.';
      else if (prods.length > LIMITES.maxProductos) errores.productos = 'Máximo ' + LIMITES.maxProductos + ' productos.';
      else {
        d.productos = [];
        prods.forEach(function (p, i) {
          var pre = 'productos.' + i + '.';
          if (!p || typeof p !== 'object' || Array.isArray(p)) { errores[pre + 'nombre'] = 'Producto no válido.'; return; }
          var out = {};
          var n = limpiarTexto(p.nombre, LIMITES.productoNombre, false);
          if (!n.ok) errores[pre + 'nombre'] = n.error;
          else if (!n.valor) errores[pre + 'nombre'] = 'El nombre del producto es obligatorio.';
          else out.nombre = n.valor;
          var ds = parseNumero(p.dosis);
          if (!ds.ok) errores[pre + 'dosis'] = ds.error;
          else if (ds.valor === null) errores[pre + 'dosis'] = 'La dosis es obligatoria.';
          else if (ds.valor < 0) errores[pre + 'dosis'] = 'Debe ser mayor o igual a 0.';
          else if (ds.valor > 1e6) errores[pre + 'dosis'] = 'Valor demasiado grande.';
          else out.dosis = ds.valor;
          if (UNIDADES.indexOf(p.unidad) < 0) errores[pre + 'unidad'] = 'Unidad no válida.';
          else out.unidad = p.unidad;
          var lote = limpiarTexto(p.loteProducto, LIMITES.loteProducto, false);
          if (!lote.ok) errores[pre + 'loteProducto'] = lote.error; else out.loteProducto = lote.valor;
          d.productos.push(out);
        });
      }
    } catch (e) {
      errores.general = 'No se pudo validar el registro.';
    }
    var ok = Object.keys(errores).length === 0;
    return { ok: ok, datos: ok ? d : null, errores: errores, advertencias: advertencias };
  }

  var CAMPOS_DATOS = ['fecha', 'horaInicio', 'horaFin', 'cliente', 'predio', 'cultivo', 'ubicacion', 'areaHa', 'volumenLHa',
    'operador', 'dron', 'agronomo', 'numeroReceta', 'alturaVueloM', 'boquilla', 'productos', 'temperaturaC', 'humedadPct',
    'vientoKmh', 'tarifaPorHa', 'moneda', 'observaciones'];

  function copiarDatos(d) {
    var out = {};
    CAMPOS_DATOS.forEach(function (k) {
      if (k === 'productos') out.productos = (d.productos || []).map(function (p) { return { nombre: p.nombre, dosis: p.dosis, unidad: p.unidad, loteProducto: p.loteProducto || '' }; });
      else out[k] = d[k] === undefined ? null : d[k];
    });
    return out;
  }

  function crearRegistro(datos, ahoraISO, idGen) {
    var r = copiarDatos(datos);
    var ahora = ahoraISO || new Date().toISOString();
    r.id = (idGen || generarId)();
    r.creadoEn = ahora; r.actualizadoEn = ahora;
    return r;
  }

  function actualizarRegistro(existente, datos, ahoraISO) {
    var r = copiarDatos(datos);
    r.id = existente.id; r.creadoEn = existente.creadoEn;
    r.actualizadoEn = ahoraISO || new Date().toISOString();
    return r;
  }

  function duplicarRegistro(existente, ahoraISO, idGen) {
    return crearRegistro(existente, ahoraISO, idGen);
  }

  // ---- Perfil del operador ----

  function validarPerfil(input) {
    var errores = {}, d = {};
    try {
      if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, datos: null, errores: { general: 'Perfil no válido.' } };
      Object.keys(LIMITES_PERFIL).forEach(function (k) {
        var r = limpiarTexto(input[k], LIMITES_PERFIL[k], false);
        if (!r.ok) errores[k] = r.error; else d[k] = r.valor;
      });
      if (d.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.correo)) errores.correo = 'Correo no válido.';
      var m = typeof input.moneda === 'string' ? input.moneda.trim().toUpperCase() : '';
      if (m && MONEDAS.indexOf(m) < 0) errores.moneda = 'Moneda no válida.';
      d.moneda = m || 'COP';
    } catch (e) { errores.general = 'No se pudo validar el perfil.'; }
    var ok = Object.keys(errores).length === 0;
    return { ok: ok, datos: ok ? d : null, errores: errores };
  }

  // ---- Consultas ----

  function compararRegistros(a, b) {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
    var ca = a.creadoEn || '', cb = b.creadoEn || '';
    return ca === cb ? 0 : (ca < cb ? 1 : -1);
  }

  function ordenar(registros) { return (registros || []).slice().sort(compararRegistros); }

  /** filtro: {texto, desde, hasta}. Rango inclusivo, comparación de strings ISO. */
  function filtrarRegistros(registros, filtro) {
    filtro = filtro || {};
    var q = normalizarNombre(filtro.texto || '');
    var desde = esFechaValida(filtro.desde) ? filtro.desde : '';
    var hasta = esFechaValida(filtro.hasta) ? filtro.hasta : '';
    return ordenar((registros || []).filter(function (r) {
      if (desde && r.fecha < desde) return false;
      if (hasta && r.fecha > hasta) return false;
      if (!q) return true;
      var campos = [r.cliente, r.predio, r.cultivo].concat((r.productos || []).map(function (p) { return p.nombre; }));
      return campos.some(function (c) { return normalizarNombre(c).indexOf(q) >= 0; });
    }));
  }

  function calcularResumen(registros) {
    var res = { n: 0, totalHa: 0, porCliente: [], productos: [], ingresos: [] };
    var clientes = {}, prods = {}, ingresos = {};
    (registros || []).forEach(function (r) {
      if (!r || typeof r.areaHa !== 'number' || !isFinite(r.areaHa)) return;
      res.n++;
      res.totalHa = redondear(res.totalHa + r.areaHa);
      var kc = normalizarNombre(r.cliente);
      if (!clientes[kc]) { clientes[kc] = { cliente: r.cliente, ha: 0, registros: 0 }; res.porCliente.push(clientes[kc]); }
      clientes[kc].ha = redondear(clientes[kc].ha + r.areaHa);
      clientes[kc].registros++;
      (r.productos || []).forEach(function (p) {
        var t = productoTotal(p.dosis, p.unidad, r.areaHa);
        if (!t) return;
        var kp = normalizarNombre(p.nombre) + '|' + t.unidad;
        if (!prods[kp]) { prods[kp] = { nombre: p.nombre, unidad: t.unidad, cantidad: 0 }; res.productos.push(prods[kp]); }
        prods[kp].cantidad = redondear(prods[kp].cantidad + t.cantidad);
      });
      if (typeof r.tarifaPorHa === 'number' && isFinite(r.tarifaPorHa)) {
        var mon = r.moneda || 'COP';
        if (!ingresos[mon]) { ingresos[mon] = { moneda: mon, valor: 0 }; res.ingresos.push(ingresos[mon]); }
        ingresos[mon].valor = redondear(ingresos[mon].valor + r.tarifaPorHa * r.areaHa, 2);
      }
    });
    res.porCliente.sort(function (a, b) { return b.ha - a.ha; });
    res.productos.sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
    return res;
  }

  // ---- Estado y migraciones ----

  function estadoVacio() { return { schemaVersion: SCHEMA_VERSION, registros: [], perfil: null, ultimoRespaldo: null }; }

  /** Migra un estado guardado a la versión actual. v1: sin cambios. Devuelve null si la versión es desconocida. */
  function migrar(datos) {
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return null;
    if (datos.schemaVersion === SCHEMA_VERSION) return datos;
    // Futuras versiones: if (datos.schemaVersion === 1) { ...; datos.schemaVersion = 2; }
    return null;
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION, LIMITES: LIMITES, LIMITES_PERFIL: LIMITES_PERFIL, UMBRALES: UMBRALES,
    UNIDADES: UNIDADES, MONEDAS: MONEDAS,
    parseNumero: parseNumero, limpiarTexto: limpiarTexto, esFechaValida: esFechaValida, esHoraValida: esHoraValida,
    hoyLocal: hoyLocal, generarId: generarId, esId: esId, esISO: esISO, normalizarNombre: normalizarNombre,
    productoTotal: productoTotal, validarRegistro: validarRegistro, validarPerfil: validarPerfil,
    crearRegistro: crearRegistro, actualizarRegistro: actualizarRegistro, duplicarRegistro: duplicarRegistro,
    compararRegistros: compararRegistros, ordenar: ordenar, filtrarRegistros: filtrarRegistros,
    calcularResumen: calcularResumen, estadoVacio: estadoVacio, migrar: migrar, redondear: redondear
  };
});
