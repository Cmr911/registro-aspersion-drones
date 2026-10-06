/* Exportación CSV, respaldo JSON y validación de importación. Lógica pura, sin DOM. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(require('./model.js')); }
  else { root.DDO = root.DDO || {}; root.DDO.exporter = factory(root.DDO.model); }
})(typeof self !== 'undefined' ? self : this, function (model) {
  'use strict';

  var APP_ID = 'ddo.registro-aspersion';
  var MAX_BYTES = 2 * 1024 * 1024;
  var MAX_REGISTROS = 5000;
  var SEP = ';';
  var CLAVES_PROHIBIDAS = { '__proto__': true, 'constructor': true, 'prototype': true };

  /** Escapa una celda (RFC 4180) y neutraliza inyección de fórmulas en texto. */
  function celda(v) {
    if (v === undefined || v === null) return '';
    if (typeof v === 'number') return isFinite(v) ? String(v).replace('.', ',') : '';
    var s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[";,\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  var COLUMNAS = [
    ['id', 'id'], ['fecha', 'fecha'], ['horaInicio', 'hora_inicio'], ['horaFin', 'hora_fin'], ['cliente', 'cliente'],
    ['predio', 'predio_lote'], ['cultivo', 'cultivo'], ['ubicacion', 'ubicacion'], ['areaHa', 'area_ha'],
    ['volumenLHa', 'volumen_l_ha'], ['operador', 'operador'], ['dron', 'dron'], ['agronomo', 'agronomo'],
    ['numeroReceta', 'receta_recomendacion'], ['alturaVueloM', 'altura_vuelo_m'], ['boquilla', 'boquilla'],
    ['temperaturaC', 'temperatura_c'], ['humedadPct', 'humedad_pct'], ['vientoKmh', 'viento_kmh'],
    ['tarifaPorHa', 'tarifa_por_ha'], ['moneda', 'moneda'], ['_ingreso', 'ingreso_estimado'],
    ['_pNombre', 'producto'], ['_pDosis', 'dosis'], ['_pUnidad', 'unidad_dosis'], ['_pLote', 'lote_producto'],
    ['_pTotal', 'producto_total'], ['_pTotalUnidad', 'unidad_total'],
    ['observaciones', 'observaciones'], ['creadoEn', 'creado_en'], ['actualizadoEn', 'actualizado_en']
  ];

  /** CSV UTF-8 con BOM, separador ';', una fila por producto (repite los datos del registro). */
  function generarCSV(registros) {
    var filas = [COLUMNAS.map(function (c) { return celda(c[1]); }).join(SEP)];
    (registros || []).forEach(function (r) {
      var ingreso = (typeof r.tarifaPorHa === 'number' && typeof r.areaHa === 'number') ? model.redondear(r.tarifaPorHa * r.areaHa, 2) : null;
      var prods = (r.productos && r.productos.length) ? r.productos : [null];
      prods.forEach(function (p) {
        var t = p ? model.productoTotal(p.dosis, p.unidad, r.areaHa) : null;
        var extra = {
          _ingreso: ingreso,
          _pNombre: p ? p.nombre : '', _pDosis: p ? p.dosis : null, _pUnidad: p ? p.unidad : '',
          _pLote: p ? p.loteProducto : '', _pTotal: t ? t.cantidad : null, _pTotalUnidad: t ? t.unidad : ''
        };
        filas.push(COLUMNAS.map(function (c) {
          return celda(c[0].charAt(0) === '_' ? extra[c[0]] : r[c[0]]);
        }).join(SEP));
      });
    });
    return '﻿' + filas.join('\r\n') + '\r\n';
  }

  /** Respaldo JSON completo. */
  function generarRespaldo(estado, ahoraISO) {
    return JSON.stringify({
      app: APP_ID,
      schemaVersion: model.SCHEMA_VERSION,
      exportadoEn: ahoraISO || new Date().toISOString(),
      perfil: estado && estado.perfil ? estado.perfil : null,
      registros: estado && Array.isArray(estado.registros) ? estado.registros : []
    }, null, 2);
  }

  function bytesUTF8(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xD800 && c <= 0xDBFF) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }

  function reviverSeguro(k, v) { return CLAVES_PROHIBIDAS[k] ? undefined : v; }

  /**
   * Analiza un archivo de respaldo. Nunca lanza.
   * Devuelve {ok, error?, registros, perfil, omitidos:[{indice, motivo}], total}.
   * opciones: {bytes (tamaño real del archivo), ahoraISO, idGen}
   */
  function analizarImportacion(texto, opciones) {
    opciones = opciones || {};
    var res = { ok: false, error: null, registros: [], perfil: null, omitidos: [], total: 0 };
    try {
      if (typeof texto !== 'string') { res.error = 'Archivo no válido.'; return res; }
      var bytes = typeof opciones.bytes === 'number' ? opciones.bytes : bytesUTF8(texto);
      if (bytes > MAX_BYTES) { res.error = 'El archivo supera 2 MB.'; return res; }
      var datos;
      try { datos = JSON.parse(texto.replace(/^﻿/, ''), reviverSeguro); }
      catch (e) { res.error = 'El archivo no es un JSON válido.'; return res; }
      if (!datos || typeof datos !== 'object' || Array.isArray(datos)) { res.error = 'Formato de respaldo no reconocido.'; return res; }
      if (datos.app !== undefined && datos.app !== APP_ID) { res.error = 'El archivo no es un respaldo de este registro.'; return res; }
      if (!model.migrar(datos)) { res.error = 'Versión de datos desconocida (schemaVersion: ' + String(datos.schemaVersion).slice(0, 20) + ').'; return res; }
      if (!Array.isArray(datos.registros)) { res.error = 'El respaldo no contiene registros.'; return res; }
      if (datos.registros.length > MAX_REGISTROS) { res.error = 'El respaldo tiene más de ' + MAX_REGISTROS + ' registros.'; return res; }

      res.total = datos.registros.length;
      var ahora = opciones.ahoraISO || new Date().toISOString();
      var porId = {};
      datos.registros.forEach(function (r, i) {
        var v = model.validarRegistro(r);
        if (!v.ok) {
          var campos = Object.keys(v.errores);
          res.omitidos.push({ indice: i + 1, motivo: campos[0] + ': ' + v.errores[campos[0]] });
          return;
        }
        var base = model.crearRegistro(v.datos, ahora, opciones.idGen);
        if (model.esId(r.id)) base.id = r.id;
        if (model.esISO(r.creadoEn)) base.creadoEn = r.creadoEn;
        if (model.esISO(r.actualizadoEn)) base.actualizadoEn = r.actualizadoEn;
        var previo = porId[base.id];
        if (previo !== undefined) {
          res.omitidos.push({ indice: i + 1, motivo: 'id repetido en el archivo' });
          if (base.actualizadoEn > res.registros[previo].actualizadoEn) res.registros[previo] = base;
          return;
        }
        porId[base.id] = res.registros.length;
        res.registros.push(base);
      });
      if (datos.perfil) {
        var p = model.validarPerfil(datos.perfil);
        if (p.ok) res.perfil = p.datos;
      }
      res.ok = true;
    } catch (e) {
      res.ok = false; res.error = 'No se pudo leer el respaldo.';
    }
    return res;
  }

  /** Combina por id: gana el de actualizadoEn más reciente (empate: se conserva el actual). */
  function combinarRegistros(actuales, importados) {
    var mapa = {}, out = [], agregados = 0, actualizados = 0, sinCambios = 0;
    (actuales || []).forEach(function (r) { mapa[r.id] = out.length; out.push(r); });
    (importados || []).forEach(function (r) {
      var i = mapa[r.id];
      if (i === undefined) { mapa[r.id] = out.length; out.push(r); agregados++; }
      else if ((r.actualizadoEn || '') > (out[i].actualizadoEn || '')) { out[i] = r; actualizados++; }
      else sinCambios++;
    });
    return { registros: out, agregados: agregados, actualizados: actualizados, sinCambios: sinCambios };
  }

  return {
    APP_ID: APP_ID, MAX_BYTES: MAX_BYTES, MAX_REGISTROS: MAX_REGISTROS,
    celda: celda, generarCSV: generarCSV, generarRespaldo: generarRespaldo,
    analizarImportacion: analizarImportacion, combinarRegistros: combinarRegistros, bytesUTF8: bytesUTF8
  };
});
