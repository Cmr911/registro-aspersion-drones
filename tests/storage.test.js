'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/model.js');
const S = require('../js/storage.js');

function adaptadorFalso(inicial, opciones) {
  opciones = opciones || {};
  const datos = Object.assign({}, inicial);
  return {
    datos,
    getItem(k) { if (opciones.falloLectura) throw new Error('bloqueado'); return k in datos ? datos[k] : null; },
    setItem(k, v) {
      if (opciones.cuota && (opciones.cuota === true || opciones.cuota(k))) {
        const e = new Error('cuota'); e.name = 'QuotaExceededError'; throw e;
      }
      datos[k] = String(v);
    },
    removeItem(k) { delete datos[k]; }
  };
}

function estadoCon(n) {
  const e = M.estadoVacio();
  for (let i = 0; i < n; i++) {
    const v = M.validarRegistro({ fecha: '2026-10-05', cliente: 'C' + i, areaHa: 1 });
    e.registros.push(M.crearRegistro(v.datos, '2026-10-05T00:00:00.000Z'));
  }
  return e;
}

test('7a. lectura vacía → lista vacía', () => {
  const a = S.crearAlmacen({ adaptador: adaptadorFalso() });
  const r = a.cargar();
  assert.equal(r.ok, true);
  assert.deepEqual(r.estado.registros, []);
  assert.equal(a.clave, 'ddo.registro-aspersion.v1');
});

test('7b. guardar y volver a cargar', () => {
  const ad = adaptadorFalso();
  const a = S.crearAlmacen({ adaptador: ad });
  assert.equal(a.guardar(estadoCon(2)).ok, true);
  const r = a.cargar();
  assert.equal(r.ok, true);
  assert.equal(r.estado.registros.length, 2);
  assert.deepEqual(Object.keys(ad.datos), ['ddo.registro-aspersion.v1']);
});

test('7c. cuota excedida → error estructurado y estado previo intacto', () => {
  const ad = adaptadorFalso();
  const a = S.crearAlmacen({ adaptador: ad });
  a.guardar(estadoCon(1));
  const previo = ad.datos['ddo.registro-aspersion.v1'];
  ad.setItem = function () { const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; };
  const r = a.guardar(estadoCon(3));
  assert.equal(r.ok, false);
  assert.equal(r.error.tipo, 'cuota');
  assert.equal(typeof r.error.mensaje, 'string');
  assert.equal(ad.datos['ddo.registro-aspersion.v1'], previo);
});

test('7d. JSON corrupto → copia de rescate y original sin sobrescribir', () => {
  const ad = adaptadorFalso({ 'ddo.registro-aspersion.v1': '{roto' });
  const a = S.crearAlmacen({ adaptador: ad, ahora: () => '2026-10-05T12:00:00.000Z' });
  const r = a.cargar();
  assert.equal(r.ok, false);
  assert.equal(r.error.tipo, 'corrupto');
  assert.deepEqual(r.estado.registros, []);
  assert.equal(r.rescate.guardado, true);
  assert.equal(r.rescate.crudo, '{roto');
  assert.equal(ad.datos[r.rescate.clave], '{roto');
  assert.ok(r.rescate.clave.startsWith('ddo.registro-aspersion.v1.corrupto.'));
  assert.equal(ad.datos['ddo.registro-aspersion.v1'], '{roto');
});

test('7e. versión desconocida se trata como corrupto', () => {
  const crudo = JSON.stringify({ schemaVersion: 7, registros: [] });
  const ad = adaptadorFalso({ 'ddo.registro-aspersion.v1': crudo });
  const r = S.crearAlmacen({ adaptador: ad }).cargar();
  assert.equal(r.error.tipo, 'corrupto');
  assert.equal(ad.datos['ddo.registro-aspersion.v1'], crudo);
});

test('7f. si no se puede crear la copia de rescate, se bloquea el guardado hasta liberar', () => {
  const ad = adaptadorFalso({ 'ddo.registro-aspersion.v1': 'xx' }, { cuota: k => k.includes('corrupto') });
  const a = S.crearAlmacen({ adaptador: ad });
  const r = a.cargar();
  assert.equal(r.rescate.guardado, false);
  assert.equal(r.rescate.crudo, 'xx');
  const g = a.guardar(estadoCon(1));
  assert.equal(g.ok, false);
  assert.equal(g.error.tipo, 'protegido');
  assert.equal(ad.datos['ddo.registro-aspersion.v1'], 'xx');
  a.liberar();
  assert.equal(a.guardar(estadoCon(1)).ok, true);
});

test('7g. fallo de lectura o sin adaptador → error claro, sin excepción', () => {
  let r = S.crearAlmacen({ adaptador: adaptadorFalso({}, { falloLectura: true }) }).cargar();
  assert.equal(r.ok, false); assert.equal(r.error.tipo, 'lectura'); assert.deepEqual(r.estado.registros, []);
  const a = S.crearAlmacen({ adaptador: null });
  r = a.cargar();
  assert.equal(r.error.tipo, 'noDisponible');
  assert.equal(a.guardar(estadoCon(1)).ok, false);
  assert.equal(S.crearAlmacen({ adaptador: adaptadorFalso() }).guardar({ x: 1 }).ok, false);
});

test('pedirPersistencia no falla sin soporte', async () => {
  assert.equal(await S.pedirPersistencia(undefined), false);
  assert.equal(await S.pedirPersistencia({ storage: { persist: () => Promise.reject(new Error('x')) } }), false);
  assert.equal(await S.pedirPersistencia({ storage: { persist: () => Promise.resolve(true) } }), true);
});
