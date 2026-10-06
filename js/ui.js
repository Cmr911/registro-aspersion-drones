/* Interfaz: DOM, eventos y formato. Nunca usa innerHTML con datos: solo textContent/createElement. */
(function () {
  'use strict';
  var DDO = window.DDO || {};
  var M = DDO.model, S = DDO.storage, X = DDO.exporter, C = DDO.config || {};
  if (!M || !S || !X) return;

  // ---------- Utilidades ----------
  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, hijos) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'text') n.textContent = v;
      else if (k === 'class') n.className = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    (hijos || []).forEach(function (h) { if (h) n.appendChild(typeof h === 'string' ? document.createTextNode(h) : h); });
    return n;
  }
  function vaciar(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  var fmtNum = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
  function num(n) { return (typeof n === 'number' && isFinite(n)) ? fmtNum.format(n) : '—'; }
  function dinero(v, moneda) {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    try { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: moneda || 'COP', maximumFractionDigits: 2 }).format(v); }
    catch (e) { return fmtNum.format(v) + ' ' + (moneda || ''); }
  }
  function fecha(iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '—'; }
  function fechaDeISO(isoTs) {
    var d = new Date(isoTs);
    return isNaN(d.getTime()) ? '—' : fecha(M.hoyLocal(d));
  }
  function numAEntrada(n) { return (typeof n === 'number' && isFinite(n)) ? String(n).replace('.', ',') : ''; }
  function ahoraISO() { return new Date().toISOString(); }

  function urlSegura(u) {
    if (typeof u !== 'string' || !u || u.indexOf('TODO_CONFIGURAR') >= 0) return null;
    return /^(https:\/\/|mailto:)/i.test(u) ? u : null;
  }
  function urlCta(tipo) {
    var base = urlSegura(C.urlFeedback);
    if (!base) return null;
    var msg = (C.mensajes && C.mensajes[tipo]) || '';
    if (!msg) return base;
    var sep = base.indexOf('?') >= 0 ? '&' : '?';
    if (/^https:\/\/wa\.me\//i.test(base)) return base + sep + 'text=' + encodeURIComponent(msg);
    if (/^mailto:/i.test(base)) return base + sep + 'subject=' + encodeURIComponent(msg);
    return base;
  }

  function descargar(nombre, contenido, tipo) {
    try {
      var blob = new Blob([contenido], { type: tipo });
      var url = URL.createObjectURL(blob);
      var a = el('a', { href: url, download: nombre });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      return true;
    } catch (e) {
      alerta('error', 'No se pudo descargar el archivo en este navegador.');
      return false;
    }
  }

  // ---------- Estado ----------
  var almacen = S.crearAlmacen({ adaptador: S.adaptadorNavegador() });
  var estado = M.estadoVacio();
  var filtro = { texto: '', desde: '', hasta: '' };
  var vistaActual = 'historial';
  var edicion = { id: null, sucio: false };
  var constanciaId = null;
  var errorGuardado = null;

  function monedaPorDefecto() {
    return (estado.perfil && estado.perfil.moneda) || C.monedaPorDefecto || 'COP';
  }

  // ---------- Alertas ----------
  function alerta(tipo, texto, acciones) {
    var cont = $('alertas');
    var caja = el('div', { class: 'alerta alerta-' + tipo }, [el('p', { text: texto })]);
    (acciones || []).forEach(function (a) {
      caja.appendChild(el('button', { type: 'button', class: 'btn', text: a.texto, onclick: function () { a.fn(caja); } }));
    });
    caja.appendChild(el('button', { type: 'button', class: 'btn cerrar', 'aria-label': 'Cerrar aviso', text: '×', onclick: function () { caja.remove(); } }));
    if (tipo === 'ok' || tipo === 'info') {
      cont.querySelectorAll('.alerta-ok, .alerta-info').forEach(function (n) { n.remove(); });
      setTimeout(function () { caja.remove(); }, 5000);
    }
    cont.appendChild(caja);
    return caja;
  }

  var cajaErrorGuardado = null;
  function persistir() {
    var r = almacen.guardar(estado);
    if (r.ok) {
      errorGuardado = null;
      if (cajaErrorGuardado) { cajaErrorGuardado.remove(); cajaErrorGuardado = null; }
      return true;
    }
    errorGuardado = r.error;
    if (cajaErrorGuardado) cajaErrorGuardado.remove();
    cajaErrorGuardado = alerta('error', r.error.mensaje + ' Tus cambios siguen en esta pestaña, pero se perderán al cerrarla. Descarga un respaldo ahora.', [
      { texto: 'Descargar respaldo', fn: function () { exportarRespaldo(); } }
    ]);
    return false;
  }

  // ---------- Diálogo ----------
  /** opciones: {titulo, mensaje (string|string[]), botones:[{valor, texto, clase}], palabra} → Promise<valor|null> */
  function dialogo(opciones) {
    var dlg = $('dialogo');
    if (!dlg || typeof dlg.showModal !== 'function') {
      var texto = opciones.titulo + '\n\n' + [].concat(opciones.mensaje || []).join('\n');
      var principal = opciones.botones[opciones.botones.length - 1];
      if (opciones.palabra) {
        var w = window.prompt(texto + '\n\nEscribe ' + opciones.palabra + ' para confirmar:');
        return Promise.resolve(w && w.trim().toUpperCase() === opciones.palabra ? principal.valor : null);
      }
      return Promise.resolve(window.confirm(texto) ? principal.valor : null);
    }
    return new Promise(function (resolve) {
      $('dlg-titulo').textContent = opciones.titulo;
      var msg = $('dlg-mensaje'); vaciar(msg);
      [].concat(opciones.mensaje || []).forEach(function (t) { msg.appendChild(el('p', { text: t })); });
      var bloque = $('dlg-palabra-bloque'), input = $('dlg-palabra');
      bloque.hidden = !opciones.palabra; input.value = ''; input.removeAttribute('aria-invalid');
      input.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); botones.lastChild.click(); } };
      $('dlg-palabra-label').textContent = opciones.palabra ? 'Escribe ' + opciones.palabra + ' para confirmar' : '';
      var botones = $('dlg-botones'); vaciar(botones);
      var resultado = null;
      function cerrar(v) { resultado = v; dlg.close(); }
      botones.appendChild(el('button', { type: 'button', class: 'btn', text: 'Cancelar', onclick: function () { cerrar(null); } }));
      opciones.botones.forEach(function (b) {
        var btn = el('button', { type: 'button', class: 'btn ' + (b.clase || ''), text: b.texto, onclick: function () {
          if (opciones.palabra && input.value.trim().toUpperCase() !== opciones.palabra) { input.focus(); input.setAttribute('aria-invalid', 'true'); return; }
          cerrar(b.valor);
        } });
        botones.appendChild(btn);
      });
      dlg.addEventListener('close', function h() { dlg.removeEventListener('close', h); resolve(resultado); });
      dlg.showModal();
      (opciones.palabra ? input : botones.firstChild).focus();
    });
  }
  function confirmar(titulo, mensaje, textoBoton, peligro, palabra) {
    return dialogo({ titulo: titulo, mensaje: mensaje, palabra: palabra, botones: [{ valor: true, texto: textoBoton, clase: peligro ? 'peligro' : 'primario' }] })
      .then(function (v) { return v === true; });
  }

  // ---------- Navegación ----------
  var VISTAS = ['historial', 'form', 'constancia', 'perfil', 'datos'];
  function mostrar(vista) {
    VISTAS.forEach(function (v) { $('vista-' + v).hidden = v !== vista; });
    vistaActual = vista;
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      if (b.getAttribute('data-ir') === vista) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
    var h = document.querySelector('#vista-' + vista + ' h1');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }

  function salirDelFormulario() {
    if (vistaActual !== 'form' || !edicion.sucio) return Promise.resolve(true);
    return confirmar('Cambios sin guardar', 'Tienes cambios sin guardar en este registro. Si sales, se perderán.', 'Salir sin guardar', true);
  }

  function ir(destino) {
    salirDelFormulario().then(function (ok) {
      if (!ok) return;
      edicion.sucio = false;
      if (destino === 'nuevo') abrirFormulario(null, false);
      else if (destino === 'perfil') { llenarPerfil(); mostrar('perfil'); }
      else if (destino === 'datos') { pintarRespaldo(); mostrar('datos'); }
      else { pintarHistorial(); mostrar('historial'); }
    });
  }

  // ---------- Campos del formulario ----------
  var L = M.LIMITES;
  var CAMPOS = {
    basicos: [
      { k: 'fecha', etq: 'Fecha', tipo: 'date', oblig: true },
      { k: 'horaInicio', etq: 'Hora de inicio', tipo: 'time' },
      { k: 'horaFin', etq: 'Hora de fin', tipo: 'time' },
      { k: 'cliente', etq: 'Cliente', max: L.cliente, oblig: true, ancho: true },
      { k: 'predio', etq: 'Predio / lote', max: L.predio },
      { k: 'cultivo', etq: 'Cultivo', max: L.cultivo },
      { k: 'ubicacion', etq: 'Ubicación', max: L.ubicacion, ancho: true, ayuda: 'Vereda, municipio o referencia.' },
      { k: 'areaHa', etq: 'Área aplicada (ha)', dec: true, oblig: true },
      { k: 'volumenLHa', etq: 'Volumen de caldo (L/ha)', dec: true },
      { k: 'operador', etq: 'Operador / piloto', max: L.operador },
      { k: 'dron', etq: 'Dron', max: L.dron, ayuda: 'Modelo o identificación interna.' }
    ],
    condiciones: [
      { k: 'temperaturaC', etq: 'Temperatura (°C)', dec: true },
      { k: 'humedadPct', etq: 'Humedad relativa (%)', dec: true },
      { k: 'vientoKmh', etq: 'Viento (km/h)', dec: true },
      { k: 'alturaVueloM', etq: 'Altura de vuelo (m)', dec: true },
      { k: 'boquilla', etq: 'Boquilla', max: L.boquilla, ayuda: 'Tipo o referencia de boquilla.' }
    ],
    tecnica: [
      { k: 'agronomo', etq: 'Ingeniero agrónomo', max: L.agronomo },
      { k: 'numeroReceta', etq: 'N.º de receta o recomendación', max: L.numeroReceta }
    ],
    costos: [
      { k: 'tarifaPorHa', etq: 'Tarifa por hectárea', dec: true },
      { k: 'moneda', etq: 'Moneda', opciones: M.MONEDAS }
    ],
    observaciones: [
      { k: 'observaciones', etq: 'Observaciones', max: L.observaciones, area: true, ancho: true }
    ]
  };
  var CAMPOS_PERFIL = [
    { k: 'nombre', etq: 'Nombre o razón social', max: M.LIMITES_PERFIL.nombre, ancho: true, ayuda: 'Aparece como encabezado de la constancia.' },
    { k: 'idTributaria', etq: 'Identificación tributaria', max: M.LIMITES_PERFIL.idTributaria, ayuda: 'NIT, RUC, CUIT, RFC u otro.' },
    { k: 'telefono', etq: 'Teléfono', max: M.LIMITES_PERFIL.telefono, modo: 'tel' },
    { k: 'correo', etq: 'Correo', max: M.LIMITES_PERFIL.correo, modo: 'email' },
    { k: 'ciudad', etq: 'Ciudad / región', max: M.LIMITES_PERFIL.ciudad },
    { k: 'certificacion', etq: 'Certificación o registro', max: M.LIMITES_PERFIL.certificacion, ancho: true, ayuda: 'Opcional. P. ej., certificado ante la autoridad aeronáutica.' },
    { k: 'moneda', etq: 'Moneda por defecto', opciones: M.MONEDAS }
  ];

  function idCampo(prefijo, k) { return prefijo + k.replace(/\./g, '-'); }

  function crearCampo(def, prefijo) {
    var id = idCampo(prefijo, def.k), idErr = idCampo(prefijo + 'e-', def.k);
    var describe = [idErr];
    var ctrl;
    if (def.opciones) {
      ctrl = el('select', { id: id, name: def.k });
      def.opciones.forEach(function (o) { ctrl.appendChild(el('option', { value: o, text: o })); });
    } else if (def.area) {
      ctrl = el('textarea', { id: id, name: def.k, rows: '4', maxlength: String(def.max) });
    } else {
      ctrl = el('input', {
        id: id, name: def.k, type: def.tipo || 'text',
        inputmode: def.dec ? 'decimal' : (def.modo || null),
        maxlength: def.max ? String(def.max) : null,
        autocomplete: def.modo === 'email' ? 'email' : (def.modo === 'tel' ? 'tel' : 'off'),
        required: def.oblig || null
      });
    }
    var hijos = [el('label', { for: id }, [def.etq, def.oblig ? el('span', { class: 'oblig', 'aria-hidden': 'true', text: ' *' }) : null])];
    hijos.push(ctrl);
    if (def.ayuda) {
      var idAy = idCampo(prefijo + 'a-', def.k);
      hijos.push(el('p', { class: 'ayuda', id: idAy, text: def.ayuda }));
      describe.unshift(idAy);
    }
    hijos.push(el('p', { class: 'error', id: idErr, 'aria-live': 'polite' }));
    ctrl.setAttribute('aria-describedby', describe.join(' '));
    return el('div', { class: 'campo' + (def.ancho ? ' campo-ancho' : '') }, hijos);
  }

  function construirFormulario() {
    Object.keys(CAMPOS).forEach(function (sec) {
      var cont = $('sec-' + sec);
      CAMPOS[sec].forEach(function (d) { cont.appendChild(crearCampo(d, 'f-')); });
    });
    var perfil = $('sec-perfil');
    CAMPOS_PERFIL.forEach(function (d) { perfil.appendChild(crearCampo(d, 'p-')); });
  }

  // ---------- Productos ----------
  function filaProducto(p) {
    var cont = $('productos');
    var i = cont.children.length;
    var fs = el('fieldset', { class: 'producto' });
    fs.appendChild(el('legend', { text: 'Producto ' + (i + 1) }));
    var rej = el('div', { class: 'rejilla' });
    rej.appendChild(crearCampo({ k: 'nombre', etq: 'Nombre', max: L.productoNombre, oblig: true }, 'fp' + i + '-'));
    rej.appendChild(crearCampo({ k: 'dosis', etq: 'Dosis', dec: true, oblig: true }, 'fp' + i + '-'));
    rej.appendChild(crearCampo({ k: 'unidad', etq: 'Unidad', opciones: M.UNIDADES }, 'fp' + i + '-'));
    rej.appendChild(crearCampo({ k: 'loteProducto', etq: 'Lote del producto', max: L.loteProducto }, 'fp' + i + '-'));
    fs.appendChild(rej);
    fs.appendChild(el('p', { class: 'total-producto sutil', 'aria-live': 'polite' }));
    fs.appendChild(el('button', { type: 'button', class: 'btn quitar', text: 'Quitar producto', onclick: function () {
      var datos = leerProductos(); datos.splice(i, 1); pintarProductos(datos); marcarSucio();
    } }));
    cont.appendChild(fs);
    if (p) {
      fs.querySelector('[name="nombre"]').value = p.nombre || '';
      fs.querySelector('[name="dosis"]').value = typeof p.dosis === 'number' ? numAEntrada(p.dosis) : (p.dosis || '');
      fs.querySelector('[name="unidad"]').value = M.UNIDADES.indexOf(p.unidad) >= 0 ? p.unidad : 'L/ha';
      fs.querySelector('[name="loteProducto"]').value = p.loteProducto || '';
    }
  }
  function leerProductos() {
    return Array.prototype.map.call($('productos').children, function (fs) {
      return {
        nombre: fs.querySelector('[name="nombre"]').value,
        dosis: fs.querySelector('[name="dosis"]').value,
        unidad: fs.querySelector('[name="unidad"]').value,
        loteProducto: fs.querySelector('[name="loteProducto"]').value
      };
    });
  }
  function pintarProductos(lista) {
    vaciar($('productos'));
    lista.forEach(filaProducto);
    actualizarContadorProductos();
    actualizarTotales();
  }
  function actualizarContadorProductos() {
    var n = $('productos').children.length;
    $('n-productos').textContent = n ? '(' + n + ')' : '';
    $('btn-agregar-producto').disabled = n >= L.maxProductos;
  }
  function actualizarTotales() {
    var area = M.parseNumero($('f-areaHa').value);
    Array.prototype.forEach.call($('productos').children, function (fs) {
      var d = M.parseNumero(fs.querySelector('[name="dosis"]').value);
      var t = (area.ok && area.valor > 0 && d.ok && d.valor !== null && d.valor >= 0) ? M.productoTotal(d.valor, fs.querySelector('[name="unidad"]').value, area.valor) : null;
      fs.querySelector('.total-producto').textContent = t ? 'Total aplicado: ' + num(t.cantidad) + ' ' + t.unidad : '';
    });
  }

  // ---------- Formulario: leer, llenar, validar ----------
  function todosLosCampos() { return [].concat(CAMPOS.basicos, CAMPOS.condiciones, CAMPOS.tecnica, CAMPOS.costos, CAMPOS.observaciones); }

  function leerFormulario() {
    var d = {};
    todosLosCampos().forEach(function (c) { d[c.k] = $('f-' + c.k).value; });
    d.productos = leerProductos();
    return d;
  }

  function llenarFormulario(r) {
    todosLosCampos().forEach(function (c) {
      var v = r ? r[c.k] : null;
      $('f-' + c.k).value = (typeof v === 'number') ? numAEntrada(v) : (v || '');
    });
    if (!r || !r.moneda) $('f-moneda').value = monedaPorDefecto();
    pintarProductos(r && r.productos ? r.productos : []);
  }

  function limpiarErrores(form) {
    form.querySelectorAll('.error').forEach(function (p) { p.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach(function (n) { n.removeAttribute('aria-invalid'); });
  }

  function mostrarErrores(errores, prefijo, form, resumenId) {
    var primero = null, n = 0;
    Object.keys(errores).forEach(function (k) {
      n++;
      var m = /^productos\.(\d+)\.(\w+)$/.exec(k);
      var idCtrl = m ? 'fp' + m[1] + '-' + m[2] : (k === 'productos' ? 'btn-agregar-producto' : idCampo(prefijo, k));
      var idErr = m ? 'fp' + m[1] + '-e-' + m[2] : idCampo(prefijo + 'e-', k);
      var pErr = $(idErr), ctrl = $(idCtrl);
      if (pErr) pErr.textContent = errores[k];
      if (ctrl) { ctrl.setAttribute('aria-invalid', 'true'); if (!primero) primero = ctrl; }
    });
    if (resumenId) {
      $(resumenId).textContent = n ? 'Revisa ' + (n === 1 ? '1 campo' : n + ' campos') + ' marcados.' : '';
      if (errores.general || errores.productos) $(resumenId).textContent += ' ' + (errores.general || errores.productos);
    }
    if (primero) {
      var det = primero.closest('details'); if (det) det.open = true;
      primero.focus();
    }
  }

  function mostrarAdvertencias() {
    var v = M.validarRegistro(leerFormulario(), { hoy: M.hoyLocal(), monedaPorDefecto: monedaPorDefecto() });
    var cont = $('form-advertencias');
    var clave = v.advertencias.map(function (a) { return a.mensaje; }).join('|');
    if (cont.getAttribute('data-clave') === clave) return; // evita mover el botón Guardar al tocarlo
    cont.setAttribute('data-clave', clave);
    vaciar(cont);
    if (!v.advertencias.length) return;
    cont.appendChild(el('p', { class: 'advertencias-titulo', text: 'Advertencias (puedes guardar igual):' }));
    var ul = el('ul');
    v.advertencias.forEach(function (a) { ul.appendChild(el('li', { text: a.mensaje })); });
    cont.appendChild(ul);
  }

  function marcarSucio() { edicion.sucio = true; }

  function abrirFormulario(registro, comoCopia) {
    edicion = { id: registro && !comoCopia ? registro.id : null, sucio: false };
    limpiarErrores($('form'));
    $('form-errores').textContent = '';
    vaciar($('form-advertencias')); $('form-advertencias').removeAttribute('data-clave');
    llenarFormulario(registro);
    if (!registro || comoCopia) $('f-fecha').value = M.hoyLocal();
    $('t-form').textContent = edicion.id ? 'Editar registro' : (comoCopia ? 'Nuevo registro (copia)' : 'Nuevo registro');
    document.querySelectorAll('#form details.seccion').forEach(function (d) { d.open = d.getAttribute('data-seccion') === 'basicos'; });
    if (comoCopia) edicion.sucio = true;
    mostrar('form');
    mostrarAdvertencias();
  }

  function guardarFormulario(ev) {
    ev.preventDefault();
    var form = $('form');
    limpiarErrores(form);
    var v = M.validarRegistro(leerFormulario(), { hoy: M.hoyLocal(), monedaPorDefecto: monedaPorDefecto() });
    if (!v.ok) { mostrarErrores(v.errores, 'f-', form, 'form-errores'); return; }
    $('form-errores').textContent = '';
    var ahora = ahoraISO(), guardado;
    if (edicion.id) {
      var i = indicePorId(edicion.id);
      if (i < 0) { alerta('error', 'El registro ya no existe.'); return; }
      guardado = M.actualizarRegistro(estado.registros[i], v.datos, ahora);
      estado.registros[i] = guardado;
    } else {
      guardado = M.crearRegistro(v.datos, ahora);
      estado.registros.push(guardado);
    }
    persistir();
    edicion.sucio = false;
    abrirConstancia(guardado.id);
    alerta('ok', v.advertencias.length ? 'Registro guardado con advertencias.' : 'Registro guardado.');
  }

  function indicePorId(id) {
    for (var i = 0; i < estado.registros.length; i++) if (estado.registros[i].id === id) return i;
    return -1;
  }
  function porId(id) { var i = indicePorId(id); return i >= 0 ? estado.registros[i] : null; }

  // ---------- Historial ----------
  function filtrados() { return M.filtrarRegistros(estado.registros, filtro); }

  function pintarAvisoRespaldo() {
    var n = estado.registros.length;
    var ult = estado.ultimoRespaldo;
    var dias = ult ? Math.floor((Date.now() - new Date(ult).getTime()) / 86400000) : null;
    var limite = C.diasAvisoRespaldo || 30;
    var texto = ult ? 'Último respaldo: ' + fechaDeISO(ult) + '.' : 'Nunca has descargado un respaldo.';
    var alertaResp = n > 0 && (!ult || isNaN(dias) || dias > limite);
    if (alertaResp && ult) texto += ' Han pasado más de ' + limite + ' días.';
    if (alertaResp) texto += ' Descarga uno para no perder tus registros.';
    $('texto-respaldo').textContent = texto;
    $('aviso-respaldo').classList.toggle('resaltado', alertaResp);
    $('d-ultimo').textContent = texto;
  }

  function pintarHistorial() {
    pintarAvisoRespaldo();
    var hay = estado.registros.length > 0;
    $('vacio').hidden = hay;
    $('con-datos').hidden = !hay;
    if (!hay) return;
    var lista = filtrados();
    pintarResumen(lista);
    var ul = $('lista'); vaciar(ul);
    $('sin-resultados').hidden = lista.length > 0;
    lista.forEach(function (r) {
      var detalle = [r.predio, r.cultivo].filter(Boolean).join(' · ');
      var prods = (r.productos || []).map(function (p) { return p.nombre; }).join(', ');
      var li = el('li', { class: 'tarjeta' }, [
        el('div', { class: 'tarjeta-cab' }, [
          el('span', { class: 'tarjeta-fecha', text: fecha(r.fecha) }),
          el('span', { class: 'tarjeta-area', text: num(r.areaHa) + ' ha' })
        ]),
        el('p', { class: 'tarjeta-cliente', text: r.cliente }),
        detalle ? el('p', { class: 'sutil', text: detalle }) : null,
        prods ? el('p', { class: 'sutil', text: 'Productos: ' + prods }) : null,
        el('div', { class: 'tarjeta-acciones' }, [
          el('button', { type: 'button', class: 'btn', text: 'Ver', 'aria-label': 'Ver constancia de ' + r.cliente + ' del ' + fecha(r.fecha), onclick: function () { abrirConstancia(r.id); } }),
          el('button', { type: 'button', class: 'btn', text: 'Editar', 'aria-label': 'Editar registro de ' + r.cliente, onclick: function () { abrirFormulario(porId(r.id), false); } }),
          el('button', { type: 'button', class: 'btn', text: 'Duplicar', 'aria-label': 'Duplicar registro de ' + r.cliente, onclick: function () { abrirFormulario(porId(r.id), true); } }),
          el('button', { type: 'button', class: 'btn peligro', text: 'Eliminar', 'aria-label': 'Eliminar registro de ' + r.cliente, onclick: function () { eliminar(r.id); } })
        ])
      ]);
      ul.appendChild(li);
    });
  }

  function pintarResumen(lista) {
    var r = M.calcularResumen(lista);
    var activo = filtro.texto || filtro.desde || filtro.hasta;
    $('resumen-filtro').textContent = activo ? '(filtro activo)' : '(todos)';
    $('k-registros').textContent = num(r.n);
    $('k-ha').textContent = num(r.totalHa);
    var uc = $('r-clientes'); vaciar(uc);
    r.porCliente.forEach(function (c) { uc.appendChild(el('li', {}, [el('span', { text: c.cliente }), el('span', { class: 'cifra', text: num(c.ha) + ' ha' })])); });
    var up = $('r-productos'); vaciar(up);
    if (!r.productos.length) up.appendChild(el('li', { class: 'sutil', text: 'Sin productos registrados.' }));
    r.productos.forEach(function (p) { up.appendChild(el('li', {}, [el('span', { text: p.nombre }), el('span', { class: 'cifra', text: num(p.cantidad) + ' ' + p.unidad })])); });
    var ui = $('r-ingresos'); vaciar(ui);
    $('r-ingresos-bloque').hidden = !r.ingresos.length;
    r.ingresos.forEach(function (x) { ui.appendChild(el('li', {}, [el('span', { text: x.moneda }), el('span', { class: 'cifra', text: dinero(x.valor, x.moneda) })])); });
  }

  function eliminar(id) {
    var r = porId(id); if (!r) return;
    confirmar('Eliminar registro', ['Se eliminará la aplicación de "' + r.cliente + '" del ' + fecha(r.fecha) + '.', 'Esta acción no se puede deshacer.'], 'Eliminar', true)
      .then(function (ok) {
        if (!ok) return;
        var i = indicePorId(id); if (i < 0) return;
        estado.registros.splice(i, 1);
        persistir();
        pintarHistorial();
        if (vistaActual !== 'historial') mostrar('historial');
        alerta('ok', 'Registro eliminado.');
      });
  }

  // ---------- Constancia ----------
  function fila(tabla, etiqueta, valor) {
    if (valor === null || valor === undefined || valor === '' || valor === '—') return;
    tabla.appendChild(el('tr', {}, [el('th', { scope: 'row', text: etiqueta }), el('td', { text: String(valor) })]));
  }

  function abrirConstancia(id) {
    var r = porId(id);
    if (!r) { ir('historial'); return; }
    constanciaId = id;
    var c = $('constancia'); vaciar(c);
    var p = estado.perfil || {};

    var cab = el('header', { class: 'c-cab' });
    if (p.nombre) {
      cab.appendChild(el('p', { class: 'c-emisor', text: p.nombre }));
      var linea = [p.idTributaria ? 'ID: ' + p.idTributaria : '', p.ciudad, p.telefono, p.correo].filter(Boolean).join(' · ');
      if (linea) cab.appendChild(el('p', { class: 'c-emisor-datos', text: linea }));
      if (p.certificacion) cab.appendChild(el('p', { class: 'c-emisor-datos', text: 'Certificación/registro: ' + p.certificacion }));
    } else if (r.operador) {
      cab.appendChild(el('p', { class: 'c-emisor', text: r.operador }));
    }
    $('c-sin-perfil').hidden = !!p.nombre;
    cab.appendChild(el('h1', { class: 'c-titulo', text: 'Constancia de aplicación' }));
    cab.appendChild(el('p', { class: 'c-meta', text: 'N.º ' + String(r.id).slice(0, 8).toUpperCase() + ' · Emitida el ' + fecha(M.hoyLocal()) }));
    c.appendChild(cab);

    var t1 = el('table', { class: 'c-tabla' }); var b1 = el('tbody'); t1.appendChild(b1);
    var horario = r.horaInicio || r.horaFin ? [r.horaInicio || '—', r.horaFin || '—'].join(' a ') : '';
    fila(b1, 'Fecha', fecha(r.fecha));
    fila(b1, 'Horario', horario);
    fila(b1, 'Cliente', r.cliente);
    fila(b1, 'Predio / lote', r.predio);
    fila(b1, 'Cultivo', r.cultivo);
    fila(b1, 'Ubicación', r.ubicacion);
    fila(b1, 'Área aplicada', num(r.areaHa) + ' ha');
    fila(b1, 'Volumen de caldo', r.volumenLHa !== null && r.volumenLHa !== undefined ? num(r.volumenLHa) + ' L/ha' : '');
    fila(b1, 'Operador / piloto', r.operador);
    fila(b1, 'Dron', r.dron);
    fila(b1, 'Ingeniero agrónomo', r.agronomo);
    fila(b1, 'Receta / recomendación N.º', r.numeroReceta);
    c.appendChild(el('section', {}, [el('h2', { text: 'Datos de la aplicación' }), t1]));

    var sp = el('section', {}, [el('h2', { text: 'Productos aplicados' })]);
    if (r.productos && r.productos.length) {
      var tp = el('table', { class: 'c-tabla c-productos' });
      tp.appendChild(el('thead', {}, [el('tr', {}, ['Producto', 'Lote', 'Dosis', 'Total aplicado'].map(function (h) { return el('th', { scope: 'col', text: h }); }))]));
      var bp = el('tbody');
      r.productos.forEach(function (x) {
        var t = M.productoTotal(x.dosis, x.unidad, r.areaHa);
        bp.appendChild(el('tr', {}, [
          el('td', { text: x.nombre }), el('td', { text: x.loteProducto || '—' }),
          el('td', { class: 'cifra', text: num(x.dosis) + ' ' + x.unidad }),
          el('td', { class: 'cifra', text: t ? num(t.cantidad) + ' ' + t.unidad : '—' })
        ]));
      });
      tp.appendChild(bp); sp.appendChild(tp);
    } else sp.appendChild(el('p', { text: 'Sin productos registrados.' }));
    c.appendChild(sp);

    var t3 = el('table', { class: 'c-tabla' }); var b3 = el('tbody'); t3.appendChild(b3);
    function med(v, u) { return (v === null || v === undefined) ? '' : num(v) + ' ' + u; }
    fila(b3, 'Temperatura', med(r.temperaturaC, '°C'));
    fila(b3, 'Humedad relativa', med(r.humedadPct, '%'));
    fila(b3, 'Viento', med(r.vientoKmh, 'km/h'));
    fila(b3, 'Altura de vuelo', med(r.alturaVueloM, 'm'));
    fila(b3, 'Boquilla', r.boquilla);
    if (b3.children.length) c.appendChild(el('section', {}, [el('h2', { text: 'Condiciones y parámetros' }), t3]));

    if (r.observaciones) c.appendChild(el('section', {}, [el('h2', { text: 'Observaciones' }), el('p', { class: 'c-obs', text: r.observaciones })]));

    c.appendChild(el('div', { class: 'c-firmas' }, ['Operador', 'Cliente'].map(function (q) {
      return el('div', { class: 'c-firma' }, [el('div', { class: 'c-linea' }), el('p', { text: q }), el('p', { class: 'c-sub', text: 'Nombre y documento' })]);
    })));

    c.appendChild(el('footer', { class: 'c-pie' }, [
      el('p', { text: 'Documento informativo generado por el operador con sus propios datos. No constituye certificación, informe oficial ni acto administrativo.' }),
      el('p', { class: 'c-sub', text: 'Generado con ' + (C.nombreHerramienta || 'Registro de Aspersión') + ' · ' + (C.marca || 'Datos de Occidente') + (urlSegura(C.urlSitio) ? ' · ' + C.urlSitio.replace(/^https:\/\//, '') : '') })
    ]));
    mostrar('constancia');
  }

  // ---------- Perfil ----------
  function llenarPerfil() {
    var p = estado.perfil || {};
    limpiarErrores($('form-perfil'));
    CAMPOS_PERFIL.forEach(function (c) { $('p-' + c.k).value = p[c.k] || ''; });
    $('p-moneda').value = p.moneda || C.monedaPorDefecto || 'COP';
  }
  function guardarPerfil(ev) {
    ev.preventDefault();
    var form = $('form-perfil');
    limpiarErrores(form);
    var d = {};
    CAMPOS_PERFIL.forEach(function (c) { d[c.k] = $('p-' + c.k).value; });
    var v = M.validarPerfil(d);
    if (!v.ok) { mostrarErrores(v.errores, 'p-', form, null); return; }
    estado.perfil = v.datos;
    persistir();
    alerta('ok', 'Perfil guardado.');
    if (constanciaId && porId(constanciaId)) abrirConstancia(constanciaId); else ir('historial');
  }

  // ---------- Exportar / importar ----------
  function mostrarCtaTrasExportar() {
    document.querySelectorAll('[data-cta-tras-exportar]').forEach(function (n) { n.hidden = !urlCta('equipo'); });
  }

  function exportarCSV() {
    var lista = filtrados();
    if (!lista.length) { alerta('info', 'No hay registros para exportar con el filtro actual.'); return; }
    if (descargar('registro-aspersion-' + M.hoyLocal() + '.csv', X.generarCSV(lista), 'text/csv;charset=utf-8')) mostrarCtaTrasExportar();
  }

  function exportarRespaldo() {
    var ahora = ahoraISO();
    var copia = { registros: estado.registros, perfil: estado.perfil };
    if (descargar('respaldo-registro-aspersion-' + M.hoyLocal() + '.json', X.generarRespaldo(copia, ahora), 'application/json')) {
      estado.ultimoRespaldo = ahora;
      persistir();
      pintarAvisoRespaldo();
      mostrarCtaTrasExportar();
      alerta('ok', 'Respaldo descargado. Guárdalo en un lugar seguro (correo, nube o computador).');
    }
  }

  function importar(ev) {
    var input = ev.target, archivo = input.files && input.files[0];
    var res = $('resultado-importar'); vaciar(res);
    input.value = '';
    if (!archivo) return;
    if (archivo.size > X.MAX_BYTES) { res.appendChild(el('p', { class: 'error', text: 'El archivo supera 2 MB.' })); return; }
    var lector = new FileReader();
    lector.onerror = function () { res.appendChild(el('p', { class: 'error', text: 'No se pudo leer el archivo.' })); };
    lector.onload = function () {
      var a = X.analizarImportacion(String(lector.result || ''), { bytes: archivo.size });
      if (!a.ok) { res.appendChild(el('p', { class: 'error', text: a.error })); return; }
      var msg = ['El archivo tiene ' + a.registros.length + ' registro(s) válido(s)' + (a.omitidos.length ? ' y ' + a.omitidos.length + ' omitido(s)' : '') + '.',
        'Combinar: agrega los nuevos y, si un registro existe en ambos, conserva la versión editada más recientemente.',
        'Reemplazar todo: borra lo que hay en este navegador y deja solo lo del archivo.'];
      dialogo({ titulo: 'Restaurar respaldo', mensaje: msg, botones: [
        { valor: 'reemplazar', texto: 'Reemplazar todo', clase: 'peligro' },
        { valor: 'combinar', texto: 'Combinar', clase: 'primario' }
      ] }).then(function (op) {
        if (op === 'combinar') {
          var c = X.combinarRegistros(estado.registros, a.registros);
          estado.registros = c.registros;
          if (!estado.perfil && a.perfil) estado.perfil = a.perfil;
          persistir();
          informeImportacion(res, 'Combinado: ' + c.agregados + ' nuevo(s), ' + c.actualizados + ' actualizado(s), ' + c.sinCambios + ' sin cambios.', a);
        } else if (op === 'reemplazar') {
          confirmar('Reemplazar todo', ['Se borrarán los ' + estado.registros.length + ' registro(s) actuales de este navegador y quedarán solo los ' + a.registros.length + ' del archivo.',
            'Si no lo has hecho, descarga primero un respaldo de lo actual.'], 'Reemplazar todo', true, 'REEMPLAZAR')
            .then(function (ok) {
              if (!ok) return;
              estado.registros = a.registros;
              if (a.perfil) estado.perfil = a.perfil;
              persistir();
              informeImportacion(res, 'Reemplazado: ahora hay ' + a.registros.length + ' registro(s).', a);
            });
        }
      });
    };
    lector.readAsText(archivo, 'utf-8');
  }

  function informeImportacion(cont, titulo, a) {
    vaciar(cont);
    cont.appendChild(el('p', { class: 'ok', text: titulo }));
    if (a.omitidos.length) {
      cont.appendChild(el('p', { text: a.omitidos.length + ' registro(s) omitido(s):' }));
      var ul = el('ul');
      a.omitidos.slice(0, 20).forEach(function (o) { ul.appendChild(el('li', { text: 'N.º ' + o.indice + ': ' + o.motivo })); });
      if (a.omitidos.length > 20) ul.appendChild(el('li', { text: '… y ' + (a.omitidos.length - 20) + ' más.' }));
      cont.appendChild(ul);
    }
    pintarAvisoRespaldo();
  }

  function borrarTodo() {
    confirmar('Borrar todo', ['Se eliminarán los ' + estado.registros.length + ' registro(s) y tu perfil de este navegador. No se puede deshacer.',
      'Si no lo has hecho, descarga primero un respaldo.'], 'Borrar todo', true, 'BORRAR')
      .then(function (ok) {
        if (!ok) return;
        estado = M.estadoVacio();
        persistir();
        alerta('ok', 'Se borraron todos los datos de este navegador.');
        ir('historial');
      });
  }

  function pintarRespaldo() { pintarAvisoRespaldo(); vaciar($('resultado-importar')); }

  // ---------- Enlaces de configuración ----------
  function configurarEnlaces() {
    document.querySelectorAll('a[data-cta]').forEach(function (a) {
      var u = urlCta(a.getAttribute('data-cta'));
      if (u) { a.href = u; a.hidden = false; } else { a.hidden = true; }
    });
    // Enlaces cruzados: cada [data-herramienta] se muestra solo si su URL está configurada.
    var herramientas = { calculadora: C.urlCalculadora, lector: C.urlLector };
    document.querySelectorAll('[data-herramienta]').forEach(function (n) {
      var u = urlSegura(herramientas[n.getAttribute('data-herramienta')]);
      var a = n.tagName === 'A' ? n : n.querySelector('a');
      if (a) { if (u) a.href = u; else a.removeAttribute('href'); }
      n.hidden = !u;
    });
    var repo = urlSegura(C.urlRepositorio);
    if (repo) { $('l-repo').href = repo; $('l-repo').hidden = false; }
    var marca = urlSegura(C.urlMarca);
    if (marca) {
      var span = $('l-marca');
      var a = el('a', { href: marca, target: '_blank', rel: 'noopener noreferrer', id: 'l-marca', text: C.marca || 'Datos de Occidente' });
      span.parentNode.replaceChild(a, span);
    }
  }

  // ---------- Arranque ----------
  function iniciar() {
    construirFormulario();
    configurarEnlaces();

    var carga = almacen.cargar();
    estado = carga.estado;
    if (carga.rescate) {
      var crudo = carga.rescate.crudo;
      var texto = carga.error.mensaje + (carga.rescate.guardado
        ? ' Se conservó una copia en el navegador. Descárgala y guárdala antes de seguir.'
        : ' No se pudo hacer una copia: descárgala ahora. El guardado queda en pausa hasta que la descargues.');
      alerta('error', texto, [{ texto: 'Descargar copia de rescate', fn: function (caja) {
        if (descargar('rescate-registro-aspersion-' + M.hoyLocal() + '.txt', crudo, 'text/plain;charset=utf-8')) {
          almacen.liberar();
          caja.remove();
          alerta('info', 'Copia de rescate descargada. Puedes seguir usando la app con una lista nueva.');
        }
      } }]);
    } else if (!carga.ok) {
      alerta('error', carga.error.mensaje + ' Puedes usar la app, pero los datos solo durarán mientras esta pestaña esté abierta. Descarga respaldos con frecuencia.');
    }
    S.pedirPersistencia(navigator);

    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ir]');
      if (b) { e.preventDefault(); ir(b.getAttribute('data-ir')); }
    });
    $('form').addEventListener('submit', guardarFormulario);
    $('form').addEventListener('input', function (e) {
      marcarSucio();
      if (e.target.getAttribute('aria-invalid')) {
        e.target.removeAttribute('aria-invalid');
        var ids = (e.target.getAttribute('aria-describedby') || '').split(' ');
        var pe = $(ids[ids.length - 1]); if (pe) pe.textContent = '';
      }
      if (e.target.id === 'f-areaHa' || e.target.closest('.producto')) actualizarTotales();
    });
    var tAdv = null;
    $('form').addEventListener('input', function () { clearTimeout(tAdv); tAdv = setTimeout(mostrarAdvertencias, 400); });
    $('form').addEventListener('change', function () { clearTimeout(tAdv); tAdv = setTimeout(mostrarAdvertencias, 400); });
    $('btn-cancelar').addEventListener('click', function () { ir('historial'); });
    $('btn-agregar-producto').addEventListener('click', function () {
      if ($('productos').children.length >= L.maxProductos) return;
      filaProducto(null); actualizarContadorProductos(); marcarSucio();
      var ult = $('productos').lastElementChild; if (ult) ult.querySelector('input').focus();
    });
    $('form-perfil').addEventListener('submit', guardarPerfil);

    $('f-buscar').addEventListener('input', function (e) { filtro.texto = e.target.value; pintarHistorial(); });
    $('f-desde').addEventListener('change', function (e) { filtro.desde = e.target.value; pintarHistorial(); });
    $('f-hasta').addEventListener('change', function (e) { filtro.hasta = e.target.value; pintarHistorial(); });
    $('filtros').addEventListener('submit', function (e) { e.preventDefault(); });
    $('btn-limpiar-filtros').addEventListener('click', function () {
      filtro = { texto: '', desde: '', hasta: '' };
      $('f-buscar').value = ''; $('f-desde').value = ''; $('f-hasta').value = '';
      pintarHistorial();
    });
    $('btn-csv').addEventListener('click', exportarCSV);
    $('btn-respaldo').addEventListener('click', exportarRespaldo);
    $('archivo-importar').addEventListener('change', importar);
    $('btn-borrar-todo').addEventListener('click', borrarTodo);

    $('c-volver').addEventListener('click', function () { ir('historial'); });
    $('c-imprimir').addEventListener('click', function () { window.print(); });
    $('c-editar').addEventListener('click', function () { var r = porId(constanciaId); if (r) abrirFormulario(r, false); });
    $('c-duplicar').addEventListener('click', function () { var r = porId(constanciaId); if (r) abrirFormulario(r, true); });

    window.addEventListener('beforeunload', function (e) {
      if ((vistaActual === 'form' && edicion.sucio) || errorGuardado) { e.preventDefault(); e.returnValue = ''; }
    });

    pintarHistorial();
    mostrar('historial');
    $('principal').focus({ preventScroll: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
