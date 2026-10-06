'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/model.js');

function base(extra) {
  return Object.assign({ fecha: '2026-10-05', cliente: 'Finca La Esperanza', areaHa: '10' }, extra);
}
function reg(datos, ahora, id) {
  const v = M.validarRegistro(datos);
  assert.ok(v.ok, JSON.stringify(v.errores));
  return M.crearRegistro(v.datos, ahora || '2026-10-05T12:00:00.000Z', () => id || M.generarId());
}

test('1. totales: 10 + 5,5 + 4,5 ha = 20 ha y agrupación por cliente', () => {
  const rs = [
    reg(base({ cliente: 'Finca A', areaHa: '10' })),
    reg(base({ cliente: 'Finca B', areaHa: '5,5' })),
    reg(base({ cliente: '  finca   a ', areaHa: '4.5' }))
  ];
  const r = M.calcularResumen(rs);
  assert.equal(r.n, 3);
  assert.equal(r.totalHa, 20);
  assert.equal(r.porCliente.length, 2);
  assert.equal(r.porCliente[0].cliente, 'Finca A');
  assert.equal(r.porCliente[0].ha, 14.5);
  assert.equal(r.porCliente[1].ha, 5.5);
});

test('2. producto total con conversión de unidades y sin mezclar L con kg', () => {
  assert.deepEqual(M.productoTotal(0.5, 'L/ha', 10), { cantidad: 5, unidad: 'L' });
  assert.deepEqual(M.productoTotal(250, 'mL/ha', 8), { cantidad: 2, unidad: 'L' });
  assert.deepEqual(M.productoTotal(500, 'g/ha', 4), { cantidad: 2, unidad: 'kg' });
  assert.equal(M.productoTotal(1, 'xx', 4), null);
  assert.equal(M.productoTotal(NaN, 'L/ha', 4), null);

  const rs = [
    reg(base({ areaHa: '10', productos: [{ nombre: 'Producto X', dosis: '0,5', unidad: 'L/ha' }] })),
    reg(base({ areaHa: '8', productos: [{ nombre: 'producto x', dosis: '250', unidad: 'mL/ha' }] })),
    reg(base({ areaHa: '4', productos: [{ nombre: 'Producto X', dosis: '500', unidad: 'g/ha' }] }))
  ];
  const r = M.calcularResumen(rs);
  const l = r.productos.find(p => p.unidad === 'L');
  const kg = r.productos.find(p => p.unidad === 'kg');
  assert.equal(r.productos.length, 2);
  assert.equal(l.cantidad, 7);
  assert.equal(kg.cantidad, 2);
});

test('3. fechas: sin desfase, filtro inclusivo y orden desc', () => {
  const r = reg(base({ fecha: '2026-10-05' }));
  assert.equal(r.fecha, '2026-10-05');
  assert.equal(JSON.parse(JSON.stringify(r)).fecha, '2026-10-05');
  assert.equal(M.hoyLocal(new Date(2026, 9, 5, 23, 59)), '2026-10-05');
  assert.equal(M.hoyLocal(new Date(2026, 9, 5, 0, 1)), '2026-10-05');
  assert.equal(M.esFechaValida('2026-02-29'), false);
  assert.equal(M.esFechaValida('2028-02-29'), true);

  const rs = [
    reg(base({ fecha: '2026-10-01', cliente: 'A' }), '2026-10-01T10:00:00.000Z'),
    reg(base({ fecha: '2026-10-05', cliente: 'B' }), '2026-10-05T10:00:00.000Z'),
    reg(base({ fecha: '2026-10-05', cliente: 'C' }), '2026-10-05T11:00:00.000Z'),
    reg(base({ fecha: '2026-10-10', cliente: 'D' }), '2026-10-10T10:00:00.000Z'),
    reg(base({ fecha: '2026-09-30', cliente: 'E' }), '2026-09-30T10:00:00.000Z')
  ];
  const f = M.filtrarRegistros(rs, { desde: '2026-10-01', hasta: '2026-10-05' });
  assert.deepEqual(f.map(r => r.cliente), ['C', 'B', 'A']);
  assert.deepEqual(M.ordenar(rs).map(r => r.cliente), ['D', 'C', 'B', 'A', 'E']);
});

test('3b. búsqueda por cliente, predio, cultivo y producto (sin tildes)', () => {
  const rs = [
    reg(base({ cliente: 'Hacienda Pérez', cultivo: 'Caña' })),
    reg(base({ cliente: 'Otra', predio: 'Lote 7', productos: [{ nombre: 'Fungicida Á', dosis: '1', unidad: 'L/ha' }] }))
  ];
  assert.equal(M.filtrarRegistros(rs, { texto: 'perez' }).length, 1);
  assert.equal(M.filtrarRegistros(rs, { texto: 'CANA' }).length, 1);
  assert.equal(M.filtrarRegistros(rs, { texto: 'lote 7' }).length, 1);
  assert.equal(M.filtrarRegistros(rs, { texto: 'fungicida a' }).length, 1);
  assert.equal(M.filtrarRegistros(rs, { texto: 'zzz' }).length, 0);
});

test('4. decimales y errores estructurados de área', () => {
  assert.deepEqual(M.parseNumero('5,5'), { ok: true, valor: 5.5 });
  assert.deepEqual(M.parseNumero('5.5'), { ok: true, valor: 5.5 });
  assert.deepEqual(M.parseNumero(' 7 '), { ok: true, valor: 7 });
  assert.deepEqual(M.parseNumero(''), { ok: true, valor: null });
  for (const malo of ['abc', '1.234,5', '5,5,5', 'Infinity', 'NaN', '1e5']) {
    const r = M.parseNumero(malo);
    assert.equal(r.ok, false, malo);
    assert.equal(typeof r.error, 'string');
  }
  assert.equal(M.parseNumero(Infinity).ok, false);
  for (const area of ['abc', '-3', '0', '', null]) {
    const v = M.validarRegistro(base({ areaHa: area }));
    assert.equal(v.ok, false, String(area));
    assert.equal(typeof v.errores.areaHa, 'string');
    assert.equal(v.datos, null);
  }
});

test('8. límites: textos largos, 9 productos, humedad 120 %, horas', () => {
  let v = M.validarRegistro(base({ cliente: 'x'.repeat(81), observaciones: 'y'.repeat(501), predio: 'p'.repeat(81) }));
  assert.ok(v.errores.cliente && v.errores.observaciones && v.errores.predio);

  const nueve = Array.from({ length: 9 }, (_, i) => ({ nombre: 'P' + i, dosis: '1', unidad: 'L/ha' }));
  v = M.validarRegistro(base({ productos: nueve }));
  assert.ok(v.errores.productos);
  v = M.validarRegistro(base({ productos: nueve.slice(0, 8) }));
  assert.ok(v.ok);

  v = M.validarRegistro(base({ humedadPct: '120' }));
  assert.ok(v.errores.humedadPct);

  v = M.validarRegistro(base({ horaInicio: '15:00', horaFin: '09:30' }));
  assert.ok(v.ok);
  assert.ok(v.advertencias.some(a => a.campo === 'horaFin'));
  v = M.validarRegistro(base({ horaInicio: '25:00', horaFin: '9:3' }));
  assert.ok(v.errores.horaInicio && v.errores.horaFin);

  v = M.validarRegistro(base({ cliente: 'abc\u0007' }));
  assert.ok(v.errores.cliente);
  v = M.validarRegistro(base({ cliente: '  Juan \t  Pérez \n ', observaciones: 'línea 1\r\nlínea 2  ' }));
  assert.equal(v.datos.cliente, 'Juan Pérez');
  assert.equal(v.datos.observaciones, 'línea 1\nlínea 2');

  v = M.validarRegistro(base({ productos: [{ nombre: '', dosis: '-1', unidad: 'oz' }] }));
  assert.ok(v.errores['productos.0.nombre'] && v.errores['productos.0.dosis'] && v.errores['productos.0.unidad']);
  v = M.validarRegistro(base({ cliente: '' }));
  assert.ok(v.errores.cliente);
  v = M.validarRegistro(base({ fecha: '2026-13-01' }));
  assert.ok(v.errores.fecha);
});

test('8b. advertencias no bloqueantes', () => {
  const v = M.validarRegistro(base({ areaHa: '6000', vientoKmh: '15', humedadPct: '40', temperaturaC: '36', fecha: '2026-12-01' }), { hoy: '2026-10-05' });
  assert.ok(v.ok);
  const campos = v.advertencias.map(a => a.campo).sort();
  assert.deepEqual(campos, ['areaHa', 'fecha', 'humedadPct', 'temperaturaC', 'vientoKmh']);
});

test('9. duplicar crea nuevo id y conserva datos; editar actualiza actualizadoEn', () => {
  const r = reg(base({ productos: [{ nombre: 'A', dosis: '1', unidad: 'L/ha' }], tarifaPorHa: '80000' }), '2026-10-05T12:00:00.000Z', 'id-1');
  const d = M.duplicarRegistro(r, '2026-10-06T12:00:00.000Z', () => 'id-2');
  assert.equal(d.id, 'id-2');
  assert.notEqual(d.id, r.id);
  for (const k of ['fecha', 'cliente', 'areaHa', 'tarifaPorHa', 'moneda']) assert.equal(d[k], r[k]);
  assert.deepEqual(d.productos, r.productos);
  assert.notEqual(d.productos, r.productos);

  const v = M.validarRegistro(Object.assign({}, r, { areaHa: '12' }));
  const e = M.actualizarRegistro(r, v.datos, '2026-10-07T08:00:00.000Z');
  assert.equal(e.id, 'id-1');
  assert.equal(e.creadoEn, r.creadoEn);
  assert.equal(e.actualizadoEn, '2026-10-07T08:00:00.000Z');
  assert.equal(e.areaHa, 12);
});

test('ids únicos e ingresos por moneda sin mezclar', () => {
  const ids = new Set(Array.from({ length: 500 }, () => M.generarId()));
  assert.equal(ids.size, 500);
  const rs = [
    reg(base({ areaHa: '10', tarifaPorHa: '100', moneda: 'COP' })),
    reg(base({ areaHa: '2', tarifaPorHa: '15,5', moneda: 'USD' })),
    reg(base({ areaHa: '5' }))
  ];
  const r = M.calcularResumen(rs);
  assert.deepEqual(r.ingresos, [{ moneda: 'COP', valor: 1000 }, { moneda: 'USD', valor: 31 }]);
});

test('nunca lanza ni devuelve NaN con entradas hostiles', () => {
  for (const x of [null, undefined, 5, 'x', [], { productos: 'x' }, { areaHa: {}, fecha: 7 }]) {
    const v = M.validarRegistro(x);
    assert.equal(v.ok, false);
  }
  const r = M.calcularResumen([null, { areaHa: NaN }, { areaHa: 'x' }]);
  assert.equal(r.totalHa, 0);
  assert.equal(M.validarPerfil(null).ok, false);
  assert.equal(M.validarPerfil({ nombre: 'Op', correo: 'malo' }).ok, false);
  assert.equal(M.validarPerfil({ nombre: 'Op', moneda: 'usd' }).datos.moneda, 'USD');
  assert.equal(M.migrar({ schemaVersion: 2 }), null);
});
