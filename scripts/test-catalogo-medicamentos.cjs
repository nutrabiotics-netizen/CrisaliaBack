// Catálogo, controlador y esquema reales; materiales simulados, sin MongoDB.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, deps) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(id => {
    if (Object.hasOwn(deps, id)) return deps[id];
    throw Error('Dependencia inesperada: ' + id);
  }, mod, mod.exports);
  return mod.exports;
}
const cum = load('src/utils/buscarCUM.ts', { '../data/cums_catalogo.json': require('../src/data/cums_catalogo.json') });
const material = { _id: 'nutra', codigo: 'NUTRA-PRUEBA', nombre: 'Producto sintético', marca: 'Nutrabiotics', activo: true,
  formaFarmaceutica: 'Tableta', concentracion: '10', unidadMedida: 'mg', viaAdministracion: 'ORAL', presentacion: 'Caja de prueba', composicion: 'Vitamina C' };
const controller = load('src/controllers/medico/materialesController.ts', {
  '../../utils/buscarCUM': cum,
  '../../models/Material': { find(query) {
    assert.equal(query.activo, true);
    const matches = [material].filter(m => query.$or.some(condition => Object.entries(condition).some(([k, regex]) => regex.test(m[k] || ''))));
    return { limit() { return this; }, lean: async () => matches };
  } },
});
async function buscar(query, handler = controller.buscarMedicamentos) {
  let resultado, status;
  await handler({ query }, { status(code) { status = code; return this; }, json(body) { resultado = body; } });
  assert.equal(status, 200);
  return resultado.data;
}
test('incluye otras marcas y permite buscar por nombre, marca corta o CUM', async () => {
  for (const q of ['Dolex', 'Advil', 'MK', 'omeprazol']) {
    const rows = await buscar({ q });
    assert.ok(rows.length > 0 && rows.length <= 30, q);
    assert.ok(rows.every(m => m.codigoCUM && m.producto && m.presentacion));
  }
  const [med] = await buscar({ q: '10042-1' });
  assert.equal(med.codigoCUM, '10042-1');
  assert.equal(med.producto, cum.obtenerCUM('10042-1').nombre);
  assert.equal(med.presentacion, cum.obtenerCUM('10042-1').descripcion);
  for (const key of ['concentracion', 'unidadMedida', 'formaFarmaceutica', 'viaAdministracion']) assert.equal(med[key], '', key);
});
test('mantiene Nutrabiotics y separa suplementos, integraciones y otros países', async () => {
  const [med] = await buscar({ q: 'nutrabiotics' });
  assert.equal(med.marca, 'Nutrabiotics');
  assert.equal(med.concentracion, '10');
  assert.equal(med.viaAdministracion, 'ORAL');
  const combinados = await buscar({ q: 'vitamina' });
  assert.ok(combinados.some(m => m.marca === 'Nutrabiotics'));
  assert.ok(combinados.some(m => m.codigoCUM));
  assert.deepEqual(await buscar({ q: 'dolex', catalogo: 'materiales' }), []);
  assert.deepEqual(await buscar({ q: 'dolex' }, controller.buscarMateriales), []);
  assert.deepEqual(await buscar({ q: 'dolex', pais: 'EC' }), []);
  assert.ok((await buscar({ q: 'dolex', pais: 'co' })).length);
});
test('conserva presentaciones distintas y trata la búsqueda como texto literal', async () => {
  const rows = await buscar({ q: 'dolex' });
  assert.equal(new Set(rows.map(m => m.codigoCUM)).size, rows.length);
  assert.ok(rows.some((m, i) => rows.some((n, j) => i !== j && m.producto === n.producto && m.presentacion !== n.presentacion)));
  for (const q of ['', 'a', '.*', '[']) assert.deepEqual(await buscar({ q }), []);
  assert.deepEqual(cum.buscarCUM('MK'), [], 'Se mantiene el mínimo de tres caracteres del buscador del paciente');
});
test('la fórmula conserva el CUM y la presentación seleccionada', () => {
  const mongoose = require('mongoose');
  const Formula = load('src/models/FormulaMedica.ts', { mongoose }).default;
  const doc = new Formula({ pacienteId: new mongoose.Types.ObjectId(), medicoId: new mongoose.Types.ObjectId(), citaId: new mongoose.Types.ObjectId(),
    medicamentos: [{ codigoCUM: '10042-1', presentacion: 'Presentación de prueba', marca: 'Marca de prueba', denominacionComun: 'Medicamento sintético',
      concentracion: '1', unidadMedida: 'mg', formaFarmaceutica: 'tableta', dosis: '1', viaAdministracion: 'ORAL', frecuencia: '24', diasTratamiento: '1', indicaciones: 'Prueba' }],
  });
  assert.equal(doc.validateSync(), undefined);
  assert.equal(doc.toObject().medicamentos[0].codigoCUM, '10042-1');
  assert.equal(doc.toObject().medicamentos[0].presentacion, 'Presentación de prueba');
});
