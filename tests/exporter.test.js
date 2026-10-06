'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/model.js');
const X = require('../js/exporter.js');

function reg(extra, id, act) {
  const v = M.validarRegistro(Object.assign({ fecha: '2026-10-05', cliente: 'Cliente', areaHa: '10' }, extra));
  assert.ok(v.ok, JSON.stringify(v.errores));
  const r = M.crearRegistro(v.datos, act || '2026-10-05T12:00:00.000Z', () => id || M.generarId());
  return r;
}

test('5. CSV: escape RFC 4180, neutralización de fórmulas, BOM y una fila por producto', () => {
  assert.equal(X.celda('a,b'), '"a,b"');
  assert.equal(X.celda('di "hola"'), '"di ""hola"""');
  assert.equal(X.celda('a;b'), '"a;b"');
  assert.equal(X.celda('l1\nl2'), '"l1\nl2"');
  assert.equal(X.celda('=1+1'), "'=1+1");
  assert.equal(X.celda('+cmd'), "'+cmd");
  assert.equal(X.celda('@x'), "'@x");
  assert.equal(X.celda('-x'), "'-x");
  assert.equal(X.celda('\tx'), "'\tx");
  assert.equal(X.celda('\rx'), "\"'\rx\"");
  assert.equal(X.celda(5.5), '5,5');
  assert.equal(X.celda(-3), '-3');
  assert.equal(X.celda(null), '');
  assert.equal(X.celda(NaN), '');

  const r = reg({
    cliente: '=HYPERLINK("x")', observaciones: 'a;b, "c"\nd',
    productos: [{ nombre: 'P1', dosis: '0,5', unidad: 'L/ha' }, { nombre: 'P2', dosis: '500', unidad: 'g/ha' }]
  });
  const r2 = reg({ cliente: 'Sin productos' });
  const csv = X.generarCSV([r, r2]);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  const lineas = csv.slice(1).split('\r\n').filter(Boolean);
  assert.equal(lineas.length, 1 + 2 + 1);
  assert.ok(lineas[0].startsWith('id;fecha;'));
  assert.ok(lineas[1].includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(lineas[1].includes(';2026-10-05;'));
  assert.ok(lineas[1].includes(';P1;0,5;L/ha;;5;L;'));
  assert.ok(lineas[2].includes(';P2;500;g/ha;;5;kg;'));
  assert.ok(csv.includes('"a;b, ""c""\nd"'));
  assert.ok(lineas[lineas.length - 1].includes('Sin productos'));
});

test('6a. importación válida y respaldo ida y vuelta', () => {
  const r = reg({ productos: [{ nombre: 'A', dosis: '1', unidad: 'L/ha' }] }, 'id-1');
  const json = X.generarRespaldo({ registros: [r], perfil: { nombre: 'Op', moneda: 'COP' } }, '2026-10-05T12:00:00.000Z');
  const res = X.analizarImportacion(json);
  assert.equal(res.ok, true);
  assert.equal(res.registros.length, 1);
  assert.deepEqual(res.registros[0], r);
  assert.equal(res.perfil.nombre, 'Op');
  assert.equal(res.omitidos.length, 0);
});

test('6b. rechazos: versión desconocida, >2 MB, >5000 registros, JSON inválido', () => {
  let res = X.analizarImportacion(JSON.stringify({ schemaVersion: 99, registros: [] }));
  assert.equal(res.ok, false); assert.match(res.error, /Versión/);
  res = X.analizarImportacion('{', {});
  assert.equal(res.ok, false); assert.match(res.error, /JSON/);
  res = X.analizarImportacion('x'.repeat(10), { bytes: 2 * 1024 * 1024 + 1 });
  assert.equal(res.ok, false); assert.match(res.error, /2 MB/);
  res = X.analizarImportacion(' '.repeat(2 * 1024 * 1024 + 1));
  assert.equal(res.ok, false); assert.match(res.error, /2 MB/);
  const muchos = Array.from({ length: 5001 }, () => ({}));
  res = X.analizarImportacion(JSON.stringify({ schemaVersion: 1, registros: muchos }));
  assert.equal(res.ok, false); assert.match(res.error, /5000/);
  res = X.analizarImportacion(JSON.stringify({ app: 'otra', schemaVersion: 1, registros: [] }));
  assert.equal(res.ok, false);
  res = X.analizarImportacion(JSON.stringify([1, 2]));
  assert.equal(res.ok, false);
  res = X.analizarImportacion(null);
  assert.equal(res.ok, false);
});

test('6c. __proto__ y campos extra ignorados; inválidos omitidos con motivo', () => {
  const texto = '{"schemaVersion":1,"__proto__":{"contaminado":true},"registros":[' +
    '{"id":"ok-1","fecha":"2026-10-05","cliente":"A","areaHa":5,"campoRaro":"x","__proto__":{"admin":true},"constructor":{"prototype":{"y":1}}},' +
    '{"id":"malo-1","fecha":"2026-10-05","cliente":"","areaHa":5},' +
    '{"id":"malo-2","fecha":"05/10/2026","cliente":"B","areaHa":-1}' +
    ']}';
  const res = X.analizarImportacion(texto);
  assert.equal(res.ok, true);
  assert.equal(res.total, 3);
  assert.equal(res.registros.length, 1);
  const r = res.registros[0];
  assert.equal(r.id, 'ok-1');
  assert.equal(r.campoRaro, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(r, '__proto__'), false);
  assert.equal(({}).admin, undefined);
  assert.equal(({}).contaminado, undefined);
  assert.equal(res.omitidos.length, 2);
  assert.match(res.omitidos[0].motivo, /cliente/);
  assert.equal(res.omitidos[1].indice, 3);
});

test('6d. combinar por id respeta actualizadoEn', () => {
  const a1 = reg({ cliente: 'Viejo' }, 'id-1', '2026-10-01T00:00:00.000Z');
  const a2 = reg({ cliente: 'Local reciente' }, 'id-2', '2026-10-05T00:00:00.000Z');
  const i1 = reg({ cliente: 'Nuevo' }, 'id-1', '2026-10-03T00:00:00.000Z');
  const i2 = reg({ cliente: 'Importado viejo' }, 'id-2', '2026-10-02T00:00:00.000Z');
  const i3 = reg({ cliente: 'Otro' }, 'id-3', '2026-10-02T00:00:00.000Z');
  const c = X.combinarRegistros([a1, a2], [i1, i2, i3]);
  assert.equal(c.registros.length, 3);
  assert.equal(c.registros.find(r => r.id === 'id-1').cliente, 'Nuevo');
  assert.equal(c.registros.find(r => r.id === 'id-2').cliente, 'Local reciente');
  assert.deepEqual([c.agregados, c.actualizados, c.sinCambios], [1, 1, 1]);
});

test('6e. id repetido dentro del archivo conserva el más reciente', () => {
  const v1 = reg({ cliente: 'v1' }, 'dup', '2026-10-01T00:00:00.000Z');
  const v2 = reg({ cliente: 'v2' }, 'dup', '2026-10-04T00:00:00.000Z');
  const res = X.analizarImportacion(JSON.stringify({ schemaVersion: 1, registros: [v1, v2] }));
  assert.equal(res.registros.length, 1);
  assert.equal(res.registros[0].cliente, 'v2');
});
