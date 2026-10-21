const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const { harness: entrevista, accepted, complete } = require('./test-fase1.cjs');
const clone = value => value === undefined ? undefined : structuredClone(value);
function load(file, deps = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Date, console, require: id => {
    if (Object.hasOwn(deps, id)) return deps[id]; throw Error('Unexpected import: ' + id);
  } }); return module.exports;
}
const mapper = load('src/services/medico/registroRDA/fase1RDA.ts');
const errors = load('src/utils/errors.ts');
const codigo = c => c.repeat(24);
function storage() {
  const rows = []; let fallar = false, inserts = 0;
  const match = (row, query) => row.tipoRegistro === query.tipoRegistro && row.pacienteId === query.pacienteId && row.fuenteFase1.interrogatorioId === query['fuenteFase1.interrogatorioId'];
  const model = {
    findOne: q => ({ lean: async () => clone(rows.find(r => match(r, q))) }),
    findOneAndUpdate: (q, update, options) => ({ lean: async () => {
      assert.equal(options.timestamps, false, 'no tocar updatedAt de registros existentes');
      assert.deepEqual(Object.keys(update), ['$setOnInsert']);
      if (fallar) throw Error('almacenamiento no disponible');
      let r = rows.find(r => match(r, q));
      if (!r) { inserts++; r = { _id: codigo('e'), ...clone(update.$setOnInsert) }; rows.push(r); }
      return clone(r);
    } }),
  };
  const { guardarRDAInicial } = load('src/services/paciente/registroRDAInicialService.ts', {
    '../../models/RegistroRDA': model, '../../models/Paciente': { findById: () => ({ lean: async () => ({ nombre: 'Persona Sintética', apellido: 'Prueba', email: 'sintetico@example.invalid' }) }) },
    '../medico/registroRDA/fase1RDA': mapper, '../../utils/errors': errors,
  });
  return { guardarRDAInicial, rows, get inserts() { return inserts; }, fail: v => { fallar = v; } };
}
const fuente = (pacienteId = codigo('a'), _id = codigo('b')) => ({ _id, pacienteId, tipo: 'primera_vez', fase1: { confirmada: true, version: 30 },
  respuestas: { s01_tipo_alergia: 'sin_alergias_conocidas', s01_enfermedades_familia: { estado: 'no_conoce', familiares: [] },
    s01_medicamentos_actuales: { estado: 'toma', medicamentos: [{ codigo: null, nombre: 'Medicamento declarado', origen: 'declarado' }] } } });

test('confirmar fase 1 crea inmediatamente el RDA inicial, sin cita ni médico ni abrir su pantalla', async () => {
  const db = storage(); const h = entrevista({ interpret: accepted, guardarRDAInicial: db.guardarRDAInicial });
  await complete(h); assert.equal(db.rows.length, 0);
  const result = await h.send('Sí, está correcto', { accion: 'confirmar' });
  assert.equal(result.statusCode, 200); assert.equal(db.rows.length, 1);
  const registro = db.rows[0]; assert.equal(registro.tipoRegistro, 'inicial'); assert.equal(registro.estado, 'borrador');
  assert.equal(registro.medicoId, undefined); assert.equal(registro.citaId, undefined);
  assert.equal(registro.fuenteFase1.interrogatorioId, h.doc._id);
  assert.equal(result.body.data.registroRDAInicialId, registro._id);
  await h.send('Sí, está correcto', result.request); assert.equal(db.inserts, 1);
});
test('fallo del RDA después de confirmar no devuelve éxito; reintentar la misma petición recupera sin duplicar entrevista', async () => {
  const db = storage(); const h = entrevista({ interpret: accepted, guardarRDAInicial: db.guardarRDAInicial });
  await complete(h); db.fail(true);
  const fallo = await h.send('Sí', { accion: 'confirmar' });
  assert.equal(fallo.statusCode, 503); assert.equal(h.doc.fase1.confirmada, true); assert.equal(db.rows.length, 0);
  const version = h.doc.fase1.version; db.fail(false);
  const result = await h.send('Sí', fallo.request);
  assert.equal(result.statusCode, 200); assert.equal(h.doc.fase1.version, version); assert.equal(db.inserts, 1);
});
test('reanudar una entrevista previamente confirmada recupera el RDA faltante sin repetir preguntas', async () => {
  const vieja = entrevista({ interpret: accepted }); await complete(vieja); await vieja.send('Sí', { accion: 'confirmar' });
  const db = storage(); const h = entrevista({ doc: vieja.doc, guardarRDAInicial: db.guardarRDAInicial });
  const result = await h.send('', { accion: 'reanudar' });
  assert.equal(result.statusCode, 200); assert.equal(result.body.data.fase1Confirmada, true); assert.equal(db.inserts, 1);
});
test('listar al reabrir el interrogatorio recupera el borrador de una fase previamente confirmada', async () => {
  const db = storage(); const doc = { ...fuente(), createdAt: new Date() };
  const controller = load('src/controllers/paciente/interrogatorio/interrogatorioController.ts', {
    '../../../services/paciente/interrogatorio/interrogatorioService': { obtenerInterrogatoriosPaciente: async () => [doc] },
    '../../../utils/auditoriaHelper': {}, '../../../models/Interrogatorio': {}, '../../../models/Cita': {}, '../../../models/Paciente': {},
    '../../../utils/notificacionHelper': {}, '../../../services/ai/AIService': {}, '../../../services/ai/anamnesisOrchestratorService': {},
    '../../../services/ai/cuerpoConChatService': {}, '../../../services/ai/fase1Flow': { calcularProgresoFase1: () => ({ porcentaje: 100 }) },
    '../../../services/paciente/registroRDAInicialService': { guardarRDAInicial: db.guardarRDAInicial },
    '../fase2Controller': {},
    '../../../services/paciente/reinicioFase2Flow': {},
  });
  const res = { status(c) { this.statusCode = c; return this; }, json(body) { this.body = body; } };
  await controller.obtenerInterrogatorios({ userId: doc.pacienteId, query: {} }, res);
  assert.equal(res.body.success, true); assert.equal(db.inserts, 1);
  await controller.obtenerInterrogatorios({ userId: doc.pacienteId, query: {} }, res); assert.equal(db.inserts, 1);
});
test('borrador conserva negativas y medicamentos sin código; dos pacientes generan registros separados', async () => {
  const db = storage(); await db.guardarRDAInicial(fuente()); await db.guardarRDAInicial(fuente(codigo('c'), codigo('d')));
  assert.equal(db.rows.length, 2);
  const ii = db.rows[0].seccionInterrogatorioInicial;
  assert.equal(ii.indicadorAlergia, false); assert.equal(ii.estadoAntecedentesFamiliares, 'no_conoce');
  assert.equal(ii.antecedentesFarmacologicos[0].codigoCUMS, null); assert.equal(ii.antecedentesFarmacologicos[0].origen, 'declarado');
});
test('repeticiones concurrentes insertan un solo borrador y un registro transmitido no se modifica', async () => {
  const db = storage(); await Promise.all([db.guardarRDAInicial(fuente()), db.guardarRDAInicial(fuente())]);
  assert.equal(db.rows.length, 1);
  db.rows[0].estado = 'transmitido'; const antes = clone(db.rows[0]);
  const cambio = fuente(); cambio.respuestas = {}; await db.guardarRDAInicial(cambio);
  assert.deepEqual(db.rows[0], antes); assert.equal(db.inserts, 1);
});
test('borrador inicial no se crea para una entrevista sin confirmar', async () => {
  const db = storage(); const doc = fuente(); doc.fase1.confirmada = false;
  assert.equal(await db.guardarRDAInicial(doc), null); assert.equal(db.inserts, 0);
});
test('esquema admite borradores de paciente sin cita y sigue exigiéndola para consulta', async () => {
  const mongoose = require('mongoose'); const Model = load('src/models/RegistroRDA.ts', { mongoose }).default;
  const inicial = new Model({ pacienteId: codigo('a'), tipoRegistro: 'inicial', estado: 'borrador' });
  await inicial.validate(); assert.equal(Model.collection.collectionName, 'registrordas');
  const consulta = new Model({ pacienteId: codigo('a'), tipoRegistro: 'consulta' });
  await assert.rejects(consulta.validate(), /citaId|medicoId/);
  const indexes = Model.schema.indexes();
  assert(indexes.some(([keys, options]) => keys.citaId && options.unique && options.partialFilterExpression?.citaId?.$type === 'objectId'));
});
test('migración de índices: simula sin escribir y crea protecciones antes de retirar el índice antiguo', async () => {
  const { prepararIndicesRDA } = load('src/utils/indicesRDA.ts'); const operations = [];
  const collection = { indexes: async () => [{ key: { citaId: 1 }, name: 'citaId_1', unique: true }],
    createIndex: async (_keys, options) => { operations.push(options.name); }, dropIndex: async name => { operations.push('drop:' + name); } };
  const plan = await prepararIndicesRDA(collection); assert.equal(plan.length, 3); assert.equal(operations.length, 0);
  await prepararIndicesRDA(collection, true);
  assert.deepEqual(operations, ['rda_cita_unica', 'rda_inicial_por_interrogatorio', 'drop:citaId_1']);
});
test('si no se pueden crear los índices de reemplazo, no se retira el índice anterior', async () => {
  const { prepararIndicesRDA } = load('src/utils/indicesRDA.ts'); let dropped = false;
  await assert.rejects(prepararIndicesRDA({ indexes: async () => [{ key: { citaId: 1 }, name: 'citaId_1', unique: true }],
    createIndex: async () => { throw Error('fallo del índice'); }, dropIndex: async () => { dropped = true; } }, true));
  assert.equal(dropped, false);
});
