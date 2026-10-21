// Pruebas del TypeScript real, sin credenciales, red ni pacientes reales.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const quiet = { log() {}, warn() {}, info() {}, error() {} };
function load(file, deps = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: id => { if (Object.hasOwn(deps, id)) return deps[id]; throw Error('Unexpected import: ' + id); },
    structuredClone, AbortSignal, console: quiet, process: { env: {} } }, { filename: file });
  return module.exports;
}
const flow = load('src/services/ai/fase1Flow.ts');
const errors = load('src/utils/errors.ts');
const catalogo = load('src/utils/buscarCIUO.ts', { '../data/ciuo_ocupaciones.json': JSON.parse(fs.readFileSync(path.join(root, 'src/data/ciuo_ocupaciones.json'), 'utf8')) });
const sections = Object.fromEntries(['s01', 's03'].map(id => [id, JSON.parse(fs.readFileSync(path.join(root, 'src/data/anamnesis_sections', id + '.json'), 'utf8'))]));
const datosCIE10 = JSON.parse(fs.readFileSync(path.join(root, 'src/data/cie10_catalogo.json'), 'utf8'));
const cie10 = load('src/utils/buscarCIE10.ts', { '../data/cie10_catalogo.json': datosCIE10 });
const datosCUM = JSON.parse(fs.readFileSync(path.join(root, 'src/data/cums_catalogo.json'), 'utf8'));
const cum = load('src/utils/buscarCUM.ts', { '../data/cums_catalogo.json': datosCUM });
const patient = { nombre: 'Paciente', apellido: 'Sintético', sexoBiologico: 'masculino', genero: { codigo: '01' }, fechaNacimiento: '1990-01-01', escolaridad: 'universitario' };
const clone = value => value === undefined ? undefined : structuredClone(value);
const valueAt = (o, k) => k.split('.').reduce((v, key) => v?.[key], o);
function harness(options = {}) {
  let doc = clone(options.doc), failWrite = false, aiCalls = 0, cierreCalls = 0;
  let interpret = options.interpret || (async () => ({ respuestas: [] }));
  let cerrar = options.cerrar || (async (r, preguntas) => ({ resumen: flow.cierreDeterminista(r, preguntas).resumenItems,
    enfoque: `En Crisal-IA organizaremos la información sobre ${r.s03_sintoma_principal} y tu objetivo ${r.s03_objetivo_a || ''} para revisar contigo su evolución en consulta.`,
    sintesis: `Durante la entrevista refieres ${r.s03_sintoma_principal}. Tu médico revisará los detalles y tus objetivos.`,
    causas: [{ titulo: 'Evolución de las molestias', desc: 'Revisaremos contigo cómo comenzaron y los cambios que has notado.', evidencias: ['s03_sintoma_principal'] }] }));
  function matches(query) {
    if (!doc) return false;
    return Object.entries(query).every(([key, value]) => {
      const actual = valueAt(doc, key);
      if (value && typeof value === 'object') {
        if ('$in' in value) return value.$in.includes(actual);
        if ('$exists' in value) return (actual !== undefined) === value.$exists;
      }
      return actual === value;
    });
  }
  function query(result) { return { sort() { return this; }, async lean() { return result(); } }; }
  const model = {
    findOne(q) { return query(() => matches(q) ? clone(doc) : null); },
    findOneAndUpdate(q, update, opts) { return query(() => {
      if (failWrite) throw Error('database offline');
      if (!matches(q)) {
        if (!opts?.upsert) return null;
        if (doc?.fase1) throw Object.assign(Error('unique'), { code: 11000 });
        doc = { _id: 'a'.repeat(24), ...clone(update.$setOnInsert) };
      }
      if (update.$set) Object.assign(doc, clone(update.$set));
      return clone(doc);
    }); },
  };
  const controller = load('src/controllers/paciente/fase1Controller.ts', {
    crypto: require('node:crypto'), '../../models/Paciente': { findById: () => ({ select: () => query(() => clone(options.patient || patient)) }) },
    '../../models/Interrogatorio': model, '../../utils/errors': errors, '../../utils/buscarCIUO': { buscarCIUO: options.ciuo || (() => []), obtenerCIUO: catalogo.obtenerCIUO },
    '../../utils/buscarCIE10': cie10,
    '../../utils/buscarCUM': cum,
    '../../services/paciente/registroRDAInicialService': { guardarRDAInicial: async doc => options.guardarRDAInicial ? options.guardarRDAInicial(doc) : { _id: 'rda-sintetico' } },
    '../../utils/auditoriaHelper': { registrarAccion: async () => {} },
    '../../services/ai/anamnesisOrchestratorService': { cargarSecciones: () => options.missingSections ? {} : sections },
    '../../services/ai/fase1Interpreter': { interpretarTurnoFase1: async input => { aiCalls++; return interpret(input); },
      generarCierrePersonalizadoFase1: async (...args) => { cierreCalls++; return cerrar(...args); } }, '../../services/ai/fase1Flow': flow,
  });
  let seq = 0, last;
  return {
    get doc() { return clone(doc); }, get last() { return clone(last); }, get aiCalls() { return aiCalls; }, get cierreCalls() { return cierreCalls; },
    failWrites(v) { failWrite = v; }, interpretWith(fn) { interpret = fn; },
    cerrarWith(fn) { cerrar = fn; },
    searchCIE10(texto) {
      const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = clone(v); } };
      controller.buscarEnfermedadesFase1({ query: { buscar: texto } }, res); return res;
    },
    searchCUM(texto) {
      const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = clone(v); } };
      controller.buscarMedicamentosFase1({ query: { buscar: texto } }, res); return res;
    },
    search(texto) {
      const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = clone(v); } };
      controller.buscarOcupacionesFase1({ query: { buscar: texto } }, res); return res;
    },
    async send(message, overrides = {}) {
      const body = { mensajeUsuario: message, requestId: 'req-' + (++seq), version: last?.fase1Version ?? 0,
        questionId: last?.questionId ?? null, interrogatorioId: doc?._id, ...overrides };
      const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = clone(v); } };
      await controller.responderFase1({ userId: 'synthetic-patient', body }, res);
      if (res.body.success) last = res.body.data;
      return { ...res, request: body };
    },
  };
}
const accepted = input => ({ respuestas: input.pregunta ? [{ id: input.pregunta.id, valor: input.mensaje }] : [] });
async function complete(h, stopAt) {
  await h.send('Quiero consultar por molestias digestivas');
  const seen = new Set();
  while (!h.last.finConversacion && h.last.questionId !== stopAt) {
    const q = h.doc.fase1.preguntas.find(p => p.id === h.last.questionId);
    assert(q, 'must have a canonical pending question');
    assert(!seen.has(q.id), 'must not repeat an accepted question: ' + q.id);
    seen.add(q.id);
    if (q.search?.source === 'cie10') { await h.send('No conozco enfermedades en mi familia', { valorRespuesta: { sinDatos: true } }); continue; }
    if (q.search?.source === 'medicamentos') { await h.send('No tomo medicamentos', { valorRespuesta: { sinDatos: true } }); continue; }
    const value = q.allergyRole === 'more' ? 'no' : q.type === 'single' ? q.options[0].value : q.type === 'checkbox' ? ['ninguno'] : q.type === 'scale' ?
      (q.required === false ? null : q.id === 's01_talla' ? 175 : 70) : q.type === 'table' ? [{ [q.columns[0]]: 'Molestia digestiva' }] : q.id === 's01_contacto_emergencia' ? 'Persona de Prueba, 3000000000' : 'Respuesta sintética';
    const result = ['text', 'search'].includes(q.type) ? await h.send(value) : await h.send(JSON.stringify(value), { valorRespuesta: value });
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.data.guardado, true);
    assert(result.body.data.progresoFase1.porcentaje < 100, 'no termina antes de confirmar');
    assert(seen.size <= 35, 'interview must terminate');
  }
  return seen;
}

async function hastaContacto(h) {
  await h.send('Molestia digestiva');
  let turnos = 0;
  while (h.last.questionId !== 's01_contacto_emergencia') {
    const q = h.doc.fase1.preguntas.find(q => q.id === h.last.questionId);
    assert(q && ++turnos < 12);
    await h.send(q.id === 's01_anos_ocupacion' ? '3 años' : ['text', 'search'].includes(q.type) ? 'soy desarrolladora' : q.options[0].label,
      q.type === 'single' ? { valorRespuesta: q.options[0].value } : {});
  }
}
module.exports = { harness, complete, accepted, patient, hastaContacto, buscarCatalogo: catalogo.buscarCIUO, calcularProgresoFase1: flow.calcularProgresoFase1, buscarCIE10: cie10.buscarCIE10, obtenerCIE10: cie10.obtenerCIE10, buscarCUM: cum.buscarCUM };
if (require.main === module) {
test('entrevista completa: cada respuesta se guarda, no se repite y termina sin marcadores', async () => {
  const h = harness({ interpret: accepted }); const seen = await complete(h);
  assert(seen.size > 10); assert.equal(h.doc.fase1.estado, 'resumen'); assert.equal(h.doc.progreso, 10);
  assert.equal(h.doc.respuestas.s03_sintoma_principal, 'Quiero consultar por molestias digestivas');
  assert(h.last.resumenItems.length > 0); assert(h.doc.respuestas.historialChat.length > 24);
  assert.equal(h.last.interrogatorioId, h.doc._id);
});
test('recargar conserva versión, questionId y widget exacto', async () => {
  const h = harness(); await h.send('Tengo dolor');
  const saved = h.last; const recovered = await h.send('', { accion: 'reanudar' });
  assert.equal(recovered.body.data.questionId, saved.questionId);
  assert.deepEqual(recovered.body.data.opciones, saved.opciones);
  assert.equal(recovered.body.data.fase1Version, saved.fase1Version);
  assert.equal(h.doc.fase1.version, 1);
});
test('un mismo requestId reintentado no duplica historial ni llama a IA otra vez', async () => {
  const h = harness(); const first = await h.send('Tengo dolor'); const history = h.doc.fase1.historial.length;
  const again = await h.send('Tengo dolor', first.request);
  assert.deepEqual(again.body, first.body); assert.equal(h.doc.fase1.historial.length, history); assert.equal(h.aiCalls, 1);
});
test('un turno de otra pestaña con versión vieja se rechaza antes de llamar al modelo', async () => {
  const h = harness(); await h.send('Tengo dolor'); const before = h.doc;
  const r = await h.send('Otra respuesta', { version: 0 });
  assert.equal(r.statusCode, 409); assert.deepEqual(h.doc, before); assert.equal(h.aiCalls, 1);
});
test('error del proveedor no avanza ni añade mensajes ficticios; el mismo turno se puede reintentar', async () => {
  const h = harness({ interpret: () => { throw new errors.AppError('Proveedor no disponible', 503); } });
  const failed = await h.send('Tengo dolor'); assert.equal(failed.statusCode, 503);
  assert.equal(h.doc.fase1.version, 0); assert.equal(h.doc.fase1.historial.length, 0);
  h.interpretWith(accepted); const retry = await h.send('Tengo dolor', failed.request);
  assert.equal(retry.statusCode, 200); assert.equal(h.doc.fase1.historial.length, 2);
});
test('falla al guardar no devuelve éxito y conserva la pregunta anterior', async () => {
  const h = harness({ interpret: accepted }); await h.send('Tengo dolor'); const before = h.doc;
  h.failWrites(true); const r = await h.send('Trabajo remoto', { valorRespuesta: 'remoto' });
  assert.equal(r.statusCode, 500); assert.notEqual(r.body.success, true); assert.deepEqual(h.doc, before);
});
test('dos solicitudes simultáneas no aceptan dos respuestas para la misma pregunta', async () => {
  const h = harness({ interpret: accepted }); await h.send('Tengo dolor'); const version = h.last.fase1Version, questionId = h.last.questionId;
  const results = await Promise.all([h.send('Primera', { version, questionId, requestId: 'concurrent-a' }), h.send('Segunda', { version, questionId, requestId: 'concurrent-b' })]);
  assert.equal(results.filter(r => r.statusCode === 200).length, 1); assert.equal(results.filter(r => r.statusCode === 409).length, 1);
  assert.equal(h.doc.fase1.version, version + 1);
});
test('ocupación ambigua conserva pregunta y secuencia; CIUO no mueve límites', async () => {
  const h = harness({ interpret: accepted, ciuo: () => [{ codigo: '1', nombre: 'Área A' }, { codigo: '2', nombre: 'Área B' }] });
  await h.send('Tengo dolor'); assert.equal(h.last.questionId, 's01_ocupacion');
  const ids = h.doc.fase1.preguntas.map(q => q.id);
  await h.send('Ingeniería'); assert.equal(h.last.questionId, '_ciuo');
  await h.send('Área B', { valorRespuesta: '2' });
  assert.equal(h.last.questionId, 's01_anos_ocupacion'); assert.equal(h.doc.respuestas.s01_ocupacion_ciuo.codigo, '2');
  assert.deepEqual(h.doc.fase1.preguntas.map(q => q.id), ids);
});
test('edición del resumen actualiza solo la corrección y no reinicia las preguntas', async () => {
  const h = harness({ interpret: accepted }); await complete(h);
  h.interpretWith(() => ({ respuestas: [{ id: 's03_objetivo_a', valor: 'Dormir mejor' }] }));
  await h.send('Corrijo mi objetivo: dormir mejor');
  assert.equal(h.doc.respuestas.s03_objetivo_a, 'Dormir mejor'); assert.equal(h.last.finConversacion, true); assert.equal(h.last.questionId, null);
  const confirm = await h.send('Sí, está correcto', { accion: 'confirmar' });
  assert.equal(confirm.body.data.fase1Confirmada, true); assert.equal(h.doc.fase1.confirmada, true);
  const retry = await h.send('Sí, está correcto', confirm.request); assert.deepEqual(retry.body, confirm.body);
});
test('corrección ambigua mantiene el resumen editable sin inventar cambios', async () => {
  const h = harness({ interpret: accepted }); await complete(h); const before = h.doc.respuestas.s03_objetivo_a;
  h.interpretWith(() => ({ respuestas: [], aclaracion: '¿Qué dato quieres corregir?' }));
  await h.send('Eso no'); assert.equal(h.last.finConversacion, false); assert.equal(h.last.editando, true);
  assert.equal(h.doc.respuestas.s03_objetivo_a, before);
});
test('IDs inventados o respuestas inválidas del modelo no se guardan ni saltan la pregunta', async () => {
  const h = harness(); await h.send('Tengo dolor'); const questionId = h.last.questionId;
  h.interpretWith(() => ({ respuestas: [{ id: 's99_inventado', valor: 'x' }, { id: questionId, valor: {} }] }));
  await h.send('Respuesta ambigua'); assert.equal(h.last.questionId, questionId); assert.equal(h.doc.respuestas.s99_inventado, undefined);
});
test('alerta urgente suspende la entrevista y se persiste sin marcar completada', async () => {
  const h = harness({ interpret: () => ({ respuestas: [], alertaUrgente: true }) });
  await h.send('Síntoma de alarma sintético'); assert.equal(h.last.alertaUrgente, true); assert.equal(h.last.finConversacion, false);
  assert.equal(h.doc.fase1.estado, 'alerta'); assert.equal(h.doc.fase1.preguntaId, null);
});
test('escalas aceptan cero/rangos válidos y null opcional, rechazan texto y fuera de rango', () => {
  const q = { id: 'scale', type: 'scale', min: 0, max: 10 };
  assert.equal(flow.normalizarRespuesta(q, 0).valido, true); assert.equal(flow.normalizarRespuesta(q, 11).valido, false);
  assert.equal(flow.normalizarRespuesta(q, '3').valido, false); assert.equal(flow.normalizarRespuesta(q, null).valido, false);
  assert.equal(flow.normalizarRespuesta({ ...q, required: false }, null).valido, true);
});
test('single y checkbox normalizan etiquetas a values y rechazan ninguno combinado', () => {
  const q = { type: 'single', options: [{ label: 'Sí', value: 'si' }] };
  assert.equal(flow.normalizarRespuesta(q, 'Sí').valor, 'si');
  assert.equal(flow.normalizarRespuesta({ type: 'checkbox', options: [{ label: 'Ninguno', value: 'ninguno' }, { label: 'Reloj', value: 'reloj' }] }, ['ninguno', 'reloj']).valido, false);
});
test('menores no reciben mediciones exclusivas de adultos', () => {
  const qs = [...sections.s01.questions, ...sections.s03.questions];
  assert(!flow.preguntasIniciales(qs, { fechaNacimiento: new Date().toISOString() }).some(q => q.adultoOnly));
});
test('seguimientos clínicos son condicionales y no repiten preguntas ya respondidas', () => {
  const preguntas = flow.agregarSeguimientos(sections.s01.questions);
  const r = Object.fromEntries(preguntas.filter(q => !['s01_diagnosticado_peso', 's01_atleta'].includes(q.id)).map(q => [q.id, q.type === 'single' ? q.options[0].value : q.type === 'checkbox' ? ['ninguno'] : q.type === 'scale' ? (q.required === false ? null : q.id === 's01_talla' ? 170 : 110) : q.id === 's01_contacto_emergencia' ? 'Persona de Prueba, 3000000000' : 'dato']));
  r.s01_enfermedades_familia = { estado: 'no_conoce', familiares: [] };
  r.s01_medicamentos_actuales = { estado: 'no_toma', medicamentos: [] };
  const s = { preguntas };
  assert.equal(flow.siguientePregunta(s, r).id, 's01_diagnosticado_peso');
  r.s01_diagnosticado_peso = 'no'; assert.equal(flow.siguientePregunta(s, r), undefined);
});
test('cuestionario faltante falla explícitamente sin iniciar una entrevista vacía', async () => {
  const h = harness({ missingSections: true }); const r = await h.send('Tengo dolor'); assert.equal(r.statusCode, 503); assert.equal(h.doc, undefined);
});
test('datos de otro paciente no se exponen por ID', async () => {
  const h = harness({ doc: { _id: 'b'.repeat(24), pacienteId: 'another-patient', tipo: 'primera_vez', estado: 'en_proceso' } });
  const r = await h.send('Mensaje'); assert.equal(r.statusCode, 404);
});
test('interpretador rechaza JSON incompleto y max_tokens, conserva valores canónicos', async () => {
  let response;
  const interpreter = load('src/services/ai/fase1Interpreter.ts', {
    '@aws-sdk/client-bedrock-runtime': { BedrockRuntimeClient: class { async send() { return response; } }, ConverseCommand: class {} }, '../../utils/errors': errors,
    './fase1Flow': flow, './fase1Catalogo': { SECCION_11_DISFUNCIONES: 'Catálogo de referencia' },
  });
  const input = { mensaje: 'dato', preguntas: [], respuestas: {}, historial: [], editando: false };
  response = { stopReason: 'max_tokens', output: { message: { content: [{ text: '{"respuestas":[]}' }] } } };
  await assert.rejects(interpreter.interpretarTurnoFase1(input), e => e.statusCode === 503);
  response = { stopReason: 'end_turn', output: { message: { content: [{ text: '{broken' }] } } };
  await assert.rejects(interpreter.interpretarTurnoFase1(input), e => e.statusCode === 503);
  response = { stopReason: 'end_turn', output: { message: { content: [{ text: '{"respuestas":[{"id":"s01_talla","valor":175}],"aclaracion":null}' }] } } };
  assert.equal((await interpreter.interpretarTurnoFase1(input)).respuestas[0].valor, 175);
});
test('una respuesta que cubre varios campos avanza sin volver a preguntarlos', async () => {
  const h = harness(); await h.send('Tengo dolor');
  h.interpretWith(() => ({ respuestas: [{ id: 's01_ocupacion', valor: 'Oficina' }, { id: 's01_anos_ocupacion', valor: '5' }, { id: 's01_jornada', valor: 'remoto' }] }));
  await h.send('Trabajo hace cinco años en oficina, desde casa');
  assert.equal(h.last.questionId, 's01_contacto_emergencia'); assert.equal(h.doc.respuestas.s01_anos_ocupacion, '5');
});
test('la interpretación recibe respuestas antiguas aunque el historial reciente esté recortado', async () => {
  const h = harness({ interpret: accepted }); await complete(h);
  let received;
  h.interpretWith(input => { received = input; return { respuestas: [] }; });
  await h.send('Quiero corregir un dato');
  assert.equal(received.respuestas.s01_ocupacion, 'Respuesta sintética');
  assert.equal(received.respuestas.s03_sintoma_principal, 'Quiero consultar por molestias digestivas');
  assert.equal(received.historial.length, 8);
});
test('JSON mal formado de tabla o columnas inventadas no se aceptan', () => {
  const q = sections.s03.questions[0];
  assert.equal(flow.normalizarRespuesta(q, [{ inventado: 'síntoma' }]).valido, false);
  assert.equal(flow.normalizarRespuesta(q, 'texto').valido, false);
  assert.equal(flow.normalizarRespuesta(q, [{ [q.columns[0]]: 'Dolor' }]).valido, true);
});
test('confirmar antes de completar no avanza ni llama al proveedor', async () => {
  const h = harness(); await h.send('Tengo dolor'); const before = h.doc;
  const r = await h.send('Confirmo', { accion: 'confirmar' });
  assert.equal(r.statusCode, 409); assert.deepEqual(h.doc, before); assert.equal(h.aiCalls, 1);
});
test('fase 2 rechaza una fase inicial sin confirmar', async () => {
  const { harness: fase2Harness } = require('./test-fase2.cjs');
  const doc = fase2Harness().doc; doc.fase1.confirmada = false;
  const res = await fase2Harness({ doc }).send();
  assert.equal(res.statusCode, 409);
});
test('contacto incompleto no es aceptado aunque el modelo lo extraiga', () => {
  const q = sections.s01.questions.find(q => q.id === 's01_contacto_emergencia');
  assert.equal(flow.normalizarRespuesta(q, 'Persona de Prueba').valido, false);
  assert.equal(flow.normalizarRespuesta(q, 'Persona de Prueba, +57 300 000 0000').valido, true);
});
test('corregir el motivo principal actualiza el resumen original sin volver a preguntar datos generales', async () => {
  const h = harness({ interpret: accepted }); await complete(h);
  h.interpretWith(() => ({ respuestas: [{ id: 's03_sintoma_principal', valor: 'Corrección del motivo principal' }] }));
  await h.send('Corrijo el motivo principal');
  assert.equal(h.last.finConversacion, true);
  assert(h.last.resumenItems.includes('Corrección del motivo principal'));
  assert(!h.last.resumenItems.includes('Quiero consultar por molestias digestivas'));
});
test('un documento pendiente antiguo se convierte en fase 1 recuperable en_proceso', async () => {
  const h = harness({ doc: { _id: 'b'.repeat(24), pacienteId: 'synthetic-patient', tipo: 'primera_vez', estado: 'pendiente', progreso: 0, respuestas: {} } });
  const r = await h.send('Consulta preventiva');
  assert.equal(r.statusCode, 200); assert.equal(h.doc.estado, 'en_proceso'); assert.equal(h.doc.fase1.version, 1);
});
test('describir un síntoma al inicio no omite la tabla de detalles todavía incompleta', async () => {
  const h = harness({ interpret: () => ({ respuestas: [{ id: 's03_sintomas_tabla', valor: [{ 'Síntoma o trastorno principal': 'Dolor' }] }] }) });
  await h.send('Tengo dolor'); assert.equal(h.doc.respuestas.s03_sintomas_tabla, undefined);
});
test('regresión del relato: Femenino, Universitario, desarrolladora, CIUO, tres años, remoto y sin contacto', async () => {
  const h = harness({ patient: { ...patient, sexoBiologico: 'femenino', genero: undefined, escolaridad: undefined }, interpret: accepted,
    ciuo: () => [{ codigo: '2512', nombre: 'Desarrolladores de software' }, { codigo: '2513', nombre: 'Desarrolladores web' }] });
  await h.send('Molestia digestiva');
  assert.equal(h.last.questionId, 's01_identidad_genero');
  await h.send('Femenino', { valorRespuesta: '02' });
  await h.send('Universitario', { valorRespuesta: 'universitario' });
  await h.send('soy desarrolladora');
  assert.equal(h.last.questionId, '_ciuo');
  await h.send('Desarrolladores de software', { valorRespuesta: '2512' });
  await h.send('3 años');
  assert.equal(h.last.questionId, 's01_jornada'); assert(h.last.respuesta.includes('¿cómo es tu jornada de trabajo?'));
  await h.send('Trabajo remoto', { valorRespuesta: 'remoto' });
  const calls = h.aiCalls;
  await h.send('no tengo');
  assert.equal(h.aiCalls, calls, 'no depende de que la IA acepte la ausencia');
  assert.equal(h.doc.respuestas.s01_contacto_emergencia, flow.SIN_CONTACTO_EMERGENCIA);
  assert.equal(h.last.questionId, 's01_como_nos_conociste');
  assert.equal(h.last.tipoOpciones, 'single'); assert.equal(h.last.questionType, 'single');
  assert.deepEqual(h.last.opciones, sections.s01.questions.find(q => q.id === h.last.questionId).options.map(o => o.label));
  h.interpretWith(() => ({ respuestas: [{ id: 's01_como_nos_conociste', valor: 'amigo_familiar' }] }));
  await h.send('por amigos');
  assert.equal(h.last.questionId, 's01_talla'); assert.equal(h.last.tipoOpciones, 'scale');
  assert.equal(h.doc.respuestas.s01_como_nos_conociste, 'amigo_familiar');
});
test('no tener contacto y no querer compartirlo son válidos; desconocer un teléfono no significa ausencia', () => {
  const q = sections.s01.questions.find(q => q.id === 's01_contacto_emergencia');
  for (const text of ['no tengo', 'que no tengo', 'ya te dije que no tengo', 'es que no tengo', 'no tengo a nadie', 'ninguno', 'No tengo contacto de emergencia', 'no tengo un contacto de emergencia', 'no tengo nadie para contactar']) {
    const r = flow.normalizarRespuesta(q, text); assert.equal(r.valido, true, text); assert.equal(r.valor, flow.SIN_CONTACTO_EMERGENCIA);
  }
  assert.equal(flow.normalizarRespuesta(q, 'prefiero no compartirlo').valor, flow.CONTACTO_NO_COMPARTIDO);
  for (const text of ['María', 'no tengo el teléfono', 'no tengo su número', 'no tengo el número de María', 'no tengo aire']) assert.equal(flow.normalizarRespuesta(q, text).valido, false, text);
});
test('una aclaración del modelo no puede anunciar cómo nos conociste mientras falte el contacto', async () => {
  const h = harness({ interpret: accepted }); await hastaContacto(h);
  h.interpretWith(() => ({ respuestas: [{ id: 's01_contacto_emergencia', valor: 'María' }],
    aclaracion: 'Entendido. Si deseas agregar contacto puedes hacerlo. ¿Cómo nos conociste?' }));
  await h.send('María');
  assert.equal(h.last.questionId, 's01_contacto_emergencia');
  assert(!h.last.respuesta.includes('¿Cómo nos conociste?'));
  assert(h.last.respuesta.includes('número de teléfono'));
  assert.equal(h.doc.respuestas.s01_contacto_emergencia, undefined);
  await h.send('que no tengo');
  assert.equal(h.last.questionId, 's01_como_nos_conociste'); assert(h.last.opciones.includes('Amigo o familiar'));
});
test('ausencia de contacto guardada se conserva tras recarga y no reaparece después de responder amigos', async () => {
  const h = harness({ interpret: accepted }); await hastaContacto(h); await h.send('no tengo');
  const recovered = harness({ doc: h.doc, interpret: accepted });
  const resume = await recovered.send('', { accion: 'reanudar' });
  assert.equal(resume.body.data.questionId, 's01_como_nos_conociste');
  await recovered.send('Amigo o familiar', { valorRespuesta: 'amigo_familiar', requestId: 'resume-amigos-unico' });
  assert.equal(recovered.last.questionId, 's01_talla');
});
test('cada pregunta de s01 y s03 conserva type, opciones, columnas y límites del JSON original', () => {
  for (const q of [...sections.s01.questions, ...sections.s03.questions]) {
    const payload = flow.presentarPregunta(q);
    assert.equal(payload.questionId, q.id); assert.equal(payload.questionType, q.type);
    assert(!payload.respuesta.startsWith('Gracias.'), q.id);
    if (['single', 'checkbox'].includes(q.type)) {
      assert.equal(payload.tipoOpciones, q.type); assert.deepEqual(clone(payload.opciones), q.options.map(o => o.label));
    } else if (q.type === 'scale') {
      assert.equal(payload.tipoOpciones, 'scale'); assert.equal(payload.scaleData.min, q.min); assert.equal(payload.scaleData.max, q.max);
      assert.equal(payload.scaleData.required, q.required !== false);
    } else if (q.type === 'table') {
      assert.equal(payload.tipoOpciones, 'tabla_dinamica'); assert.deepEqual(clone(payload.columnas), q.columns);
    } else if (q.type === 'search') { assert.equal(payload.tipoOpciones, 'search'); assert.deepEqual(clone(payload.busqueda), q.search); } else assert.equal(payload.opciones.length, 0);
  }
});
test('un single mal configurado no se presenta como una pregunta abierta sin opciones', () => {
  assert.throws(() => flow.presentarPregunta({ id: 's01_test', type: 'single', text: 'Pregunta' }));
});

test('el cierre personalizado se guarda igual para resumen, abordaje e informe y confirmar reutiliza el contenido', async () => {
  const h = harness({ interpret: accepted }); await complete(h);
  assert.equal(h.cierreCalls, 1);
  assert.equal(h.last.cierreEstado, 'generado');
  const cierre = h.doc.respuestas.cierreFase1;
  assert.deepEqual(cierre.resumen, h.last.resumenItems);
  assert.equal(cierre.enfoque, h.last.enfoqueAbordaje);
  assert.equal(cierre.sintesis, h.last.informeResumen);
  assert.deepEqual(cierre.causas, h.doc.respuestas.causas);
  assert(cierre.enfoque.includes(h.doc.respuestas.s03_sintoma_principal));
  const confirmed = await h.send('Correcto', { accion: 'confirmar' });
  assert.equal(confirmed.statusCode, 200); assert.equal(h.cierreCalls, 1);
  assert.deepEqual(h.doc.respuestas.cierreFase1, cierre);
});

test('editar un objetivo invalida el cierre y lo regenera sin repetir preguntas', async () => {
  const h = harness({ interpret: accepted }); await complete(h);
  h.interpretWith(() => ({ respuestas: [{ id: 's03_objetivo_a', valor: 'Dormir mejor' }] }));
  await h.send('Mi objetivo es dormir mejor');
  assert.equal(h.cierreCalls, 2); assert.equal(h.last.finConversacion, true);
  assert(h.last.enfoqueAbordaje.includes('Dormir mejor'));
  await h.send('Correcto', { accion: 'confirmar' }); assert.equal(h.cierreCalls, 2);
});

test('si falla el cierre conserva todas las respuestas y permite generarlo tras confirmar sin reabrir la entrevista', async () => {
  const h = harness({ interpret: accepted, cerrar: () => { throw new Error('provider offline'); } }); await complete(h);
  assert.equal(h.last.cierreEstado, 'pendiente'); assert.deepEqual(h.doc.respuestas.causas, []);
  const preguntas = h.doc.fase1.preguntas;
  await h.send('Correcto', { accion: 'confirmar' }); assert.equal(h.last.fase1Confirmada, true);
  h.cerrarWith(() => ({ resumen: ['Resumen recuperado'], enfoque: 'Abordaje recuperado', sintesis: 'Informe recuperado', causas: [] }));
  const calls = h.aiCalls;
  const result = await h.send('Actualizar informe', { accion: 'regenerar_cierre' });
  assert.equal(result.statusCode, 200); assert.equal(h.last.cierreEstado, 'generado');
  assert.equal(h.last.fase1Confirmada, true); assert.equal(h.aiCalls, calls);
  assert.deepEqual(h.doc.fase1.preguntas, preguntas); assert.equal(h.last.questionId, null);
  assert.equal(h.doc.respuestas.cierreFase1.sintesis, 'Informe recuperado');
  const duplicate = await h.send('Actualizar informe', result.request);
  assert.deepEqual(duplicate.body, result.body); assert.equal(h.cierreCalls, 3);
});

test('si falla la regeneración tras editar no conserva un informe antiguo que contradiga los nuevos datos', async () => {
  const h = harness({ interpret: accepted }); await complete(h);
  h.interpretWith(() => ({ respuestas: [{ id: 's03_objetivo_a', valor: 'Nuevo objetivo' }] }));
  h.cerrarWith(() => { throw Error('offline'); }); await h.send('Cambio de objetivo');
  assert.equal(h.last.cierreEstado, 'pendiente'); assert.equal(h.doc.fase1.cierre, undefined);
  assert.deepEqual(h.doc.respuestas.causas, []); assert(h.last.resumenItems.some(s => s.includes('Nuevo objetivo')));
});

test('generador usa datos clínicos registrados, excluye contactos y rechaza evidencia inventada y respuesta truncada', async () => {
  let response, command;
  const service = load('src/services/ai/fase1Interpreter.ts', {
    '@aws-sdk/client-bedrock-runtime': { BedrockRuntimeClient: class { async send(c) { command = c.input; return response; } }, ConverseCommand: class { constructor(input) { this.input = input; } } },
    '../../utils/errors': errors, './fase1Flow': flow, './fase1Catalogo': { SECCION_11_DISFUNCIONES: 'Catálogo de referencia' },
  });
  const datos = { s03_sintoma_principal: 'Molestia digestiva', s03_objetivo_a: 'Dormir mejor', s01_nombre: 'NOMBRE PRIVADO',
    s01_contacto_emergencia: 'CONTACTO PRIVADO', s01_telefono: '3000000000', historialChat: [{ texto: 'HISTORIAL PRIVADO' }] };
  const contenido = { resumen: ['Refieres molestias digestivas.'], enfoque: 'Revisaremos tus molestias y tu objetivo de dormir mejor.', sintesis: 'Consulta por molestias digestivas.',
    causas: [{ titulo: 'Evolución de las molestias', desc: 'Profundizaremos en su evolución.', evidencias: ['s03_sintoma_principal'] }] };
  const set = (v, stopReason = 'end_turn') => { response = { stopReason, output: { message: { content: [{ text: JSON.stringify(v) }] } } }; };
  set(contenido); const result = await service.generarCierrePersonalizadoFase1(datos, sections.s03.questions);
  assert.equal(result.enfoque, contenido.enfoque);
  const input = command.messages[0].content[0].text;
  assert(input.includes('Molestia digestiva')); assert(!input.includes('PRIVADO')); assert(!input.includes('3000000000'));
  set({ ...contenido, causas: [{ ...contenido.causas[0], evidencias: ['s99_inventado'] }] });
  await assert.rejects(service.generarCierrePersonalizadoFase1(datos, []));
  set(contenido, 'max_tokens'); await assert.rejects(service.generarCierrePersonalizadoFase1(datos, []));
  set({ ...contenido, enfoque: '' }); await assert.rejects(service.generarCierrePersonalizadoFase1(datos, []));
});


test('las rutas de lectura devuelven el estado para reanudar y la versión necesaria para recuperar el informe', async () => {
  const h = harness({ interpret: accepted }); await complete(h);
  const doc = { ...h.doc, pacienteId: { toString: () => 'synthetic-patient' } };
  const controller = load('src/controllers/paciente/interrogatorio/interrogatorioController.ts', {
    '../../../services/paciente/interrogatorio/interrogatorioService': { obtenerInterrogatoriosPaciente: async () => [doc], obtenerInterrogatorioPorId: async () => doc },
    '../../../utils/auditoriaHelper': {}, '../../../models/Interrogatorio': {}, '../../../models/Cita': {}, '../../../models/Paciente': {},
    '../../../utils/notificacionHelper': {}, '../../../services/ai/AIService': {}, '../../../services/ai/anamnesisOrchestratorService': {},
    '../../../services/ai/cuerpoConChatService': {}, '../../../services/ai/fase1Flow': flow,
    '../../../services/paciente/registroRDAInicialService': { guardarRDAInicial: async () => ({ _id: 'rda-sintetico' }) },
    '../fase2Controller': {},
    '../../../services/paciente/reinicioFase2Flow': {},
  });
  const response = () => ({ status(c) { this.statusCode = c; return this; }, json(body) { this.body = body; } });
  const lista = response(); await controller.obtenerInterrogatorios({ userId: 'synthetic-patient', query: {} }, lista);
  assert.deepEqual(clone(lista.body.data[0].fase1), h.doc.fase1);
  const detalle = response(); await controller.obtenerInterrogatorioPorId({ userId: 'synthetic-patient', params: { interrogatorioId: doc._id } }, detalle);
  assert.equal(detalle.body.data.fase1.version, h.doc.fase1.version);
  assert.equal(detalle.body.data.fase1.estado, 'resumen');
  assert.equal(detalle.body.data.respuestas.cierreFase1.enfoque, h.last.enfoqueAbordaje);
});


test('selección del buscador guarda el código real, ignora el nombre del cliente y avanza sin IA ni segunda selección', async () => {
  const h = harness({ interpret: accepted, ciuo: () => [{ codigo: '2512', nombre: 'Desarrolladores de software' }, { codigo: '2513', nombre: 'Desarrolladores web' }] });
  await h.send('Consulta preventiva');
  assert.equal(h.last.questionId, 's01_ocupacion'); assert.equal(h.last.tipoOpciones, 'search');
  assert.equal(h.last.busqueda.source, 'ocupaciones');
  const calls = h.aiCalls;
  const result = await h.send('Nombre inventado', { valorRespuesta: { codigo: '2512', nombre: 'Nombre inventado' } });
  assert.equal(result.statusCode, 200); assert.equal(h.aiCalls, calls);
  assert.equal(h.doc.respuestas.s01_ocupacion_ciuo.codigo, '2512');
  assert.equal(h.doc.respuestas.s01_ocupacion, catalogo.obtenerCIUO('2512').nombre);
  assert.equal(h.last.questionId, 's01_anos_ocupacion'); assert.equal(h.doc.fase1.ciuoCandidatos, undefined);
});

test('no encuentro mi ocupación permite respuesta propia sin forzar un código ni otra pregunta CIUO', async () => {
  const h = harness({ interpret: accepted, ciuo: () => [{ codigo: '2512', nombre: 'Desarrolladores de software' }, { codigo: '2513', nombre: 'Desarrolladores web' }] });
  await h.send('Consulta preventiva'); const calls = h.aiCalls;
  await h.send('Trabajo de prueba', { valorRespuesta: { noEncontrada: true, texto: 'Trabajo de prueba' } });
  assert.equal(h.doc.respuestas.s01_ocupacion, 'Trabajo de prueba');
  assert.equal(h.doc.respuestas.s01_ocupacion_ciuo, undefined); assert.equal(h.aiCalls, calls);
  assert.equal(h.last.questionId, 's01_anos_ocupacion');
});

test('no acepta códigos inventados ni respuestas manuales vacías del buscador', async () => {
  const h = harness({ interpret: accepted }); await h.send('Consulta preventiva');
  const version = h.doc.fase1.version;
  for (const valorRespuesta of [{ codigo: 'inventado' }, { noEncontrada: true, texto: '  ' }, { nombre: 'inventado' }]) {
    const result = await h.send('Ocupación', { valorRespuesta }); assert.equal(result.statusCode, 400);
    assert.equal(h.doc.fase1.version, version); assert.equal(h.doc.respuestas.s01_ocupacion, undefined);
  }
});

test('buscador CIUO admite acentos, prefijos y variantes y la configuración search requiere catálogo', () => {
  assert.equal(catalogo.buscarCIUO('desarrolladora', 10)[0].codigo, '2512');
  assert(catalogo.buscarCIUO('médico', 10).length > 0);
  assert(catalogo.buscarCIUO('desar', 10).some(o => o.codigo === '2512'));
  assert.equal(catalogo.buscarCIUO('zzzzzzzzzz', 10).length, 0);
  assert.throws(() => flow.presentarPregunta({ id: 'q_search', type: 'search', text: 'Buscar' }));
});


test('endpoint del catálogo devuelve coincidencias limitadas y rechaza búsquedas inválidas', () => {
  const h = harness({ ciuo: catalogo.buscarCIUO });
  assert(h.search('desarrolladora').body.data.some(o => o.codigo === '2512'));
  assert(h.search('médico').body.data.length <= 10);
  assert.deepEqual(h.search('de').body.data, []);
  assert.equal(h.search(['dato']).statusCode, 400);
  assert.equal(h.search('x'.repeat(101)).statusCode, 400);
});


test('progreso de fase 1 empieza en cero con perfil precargado, cuenta respuestas y termina solo tras confirmar', async () => {
  const h = harness({ interpret: accepted }); await h.send('Consulta preventiva');
  assert(h.last.progresoFase1.porcentaje > 0 && h.last.progresoFase1.porcentaje < 10);
  const vacia = { ...h.doc.fase1, confirmada: false };
  assert.equal(flow.calcularProgresoFase1(vacia, flow.respuestasDelPerfil(patient)).porcentaje, 0);
  assert(!vacia.preguntasProgreso.includes('s01_nombre'));
  const antes = h.last.progresoFase1.porcentaje;
  await h.send('Desarrollo de software', { valorRespuesta: { codigo: '2512' } });
  assert(h.last.progresoFase1.porcentaje > antes);
  const completa = harness({ interpret: accepted }); await complete(completa);
  const resumen = completa.last.progresoFase1;
  assert(resumen.porcentaje >= 90 && resumen.porcentaje < 100);
  assert.equal(resumen.pasosCompletados, resumen.totalPasos - 1);
  await completa.send('Correcto', { accion: 'confirmar' });
  assert.equal(completa.last.progresoFase1.porcentaje, 100);
});

test('aclaración, requestId repetido, versión inválida y fallo de guardado no adelantan el progreso', async () => {
  const h = harness({ interpret: accepted }); await hastaContacto(h);
  const antes = h.last.progresoFase1;
  h.interpretWith(() => ({ respuestas: [] }));
  const aclaracion = await h.send('No entiendo');
  assert.deepEqual(h.last.progresoFase1, antes);
  await h.send('No entiendo', aclaracion.request); assert.deepEqual(h.last.progresoFase1, antes);
  h.failWrites(true); await h.send('No tengo');
  assert.deepEqual(h.doc.fase1.ultimaRespuesta.progresoFase1, antes);
  h.failWrites(false); const invalido = await h.send('No tengo', { version: -1 });
  assert.equal(invalido.statusCode, 409); assert.deepEqual(h.last.progresoFase1, antes);
  await h.send('No tengo'); assert(h.last.progresoFase1.porcentaje > antes.porcentaje);
});

test('progreso calcula solo seguimientos aplicables, acepta no sé y reserva el paso de confirmación', () => {
  const preguntas = flow.agregarSeguimientos([
    { id: 's01_talla', type: 'scale', min: 50, max: 250, text: 'Talla' },
    { id: 's01_peso_actual', type: 'scale', min: 1, max: 400, text: 'Peso' },
    { id: 's01_grasa_corporal', type: 'scale', min: 1, max: 70, required: false, text: 'Grasa' },
  ]);
  const estado = { preguntas, historial: [], version: 1, estado: 'recopilando', preguntaId: null, turnos: [] };
  const r = { s03_sintoma_principal: 'Motivo de prueba', s01_talla: 175, s01_peso_actual: 70, s01_grasa_corporal: null };
  const normal = flow.calcularProgresoFase1(estado, r);
  assert.equal(normal.totalPasos, 5); assert.equal(normal.pasosCompletados, 4); assert.equal(normal.porcentaje, 80);
  const seguimiento = flow.calcularProgresoFase1(estado, { ...r, s01_peso_actual: 120 });
  assert.equal(seguimiento.totalPasos, 6); assert.equal(seguimiento.pasosCompletados, 4);
  const respondido = { ...r, s01_peso_actual: 120, s01_diagnosticado_peso: 'no' };
  assert.equal(flow.calcularProgresoFase1({ ...estado, confirmada: true }, respondido).porcentaje, 100);
  const menores = flow.preguntasIniciales(sections.s01.questions, { fechaNacimiento: '2015-01-01' });
  const menor = { ...estado, preguntas: flow.agregarSeguimientos(menores) };
  assert.equal(flow.calcularProgresoFase1(menor, {}).totalPasos, menor.preguntas.length - 2 + 1);
});

test('reanudar y leer una sesión antigua recupera el porcentaje a partir de sus respuestas', async () => {
  const h = harness({ interpret: accepted }); await hastaContacto(h);
  const esperado = h.last.progresoFase1;
  const reload = await h.send('', { accion: 'reanudar' }); assert.deepEqual(reload.body.data.progresoFase1, esperado);
  const doc = h.doc; delete doc.fase1.ultimaRespuesta.progresoFase1; delete doc.fase1.preguntasProgreso;
  const vieja = harness({ doc }); const result = await vieja.send('', { accion: 'reanudar' });
  assert.deepEqual(result.body.data.progresoFase1, clone(flow.calcularProgresoFase1(doc.fase1, doc.respuestas)));
  assert(result.body.data.progresoFase1.porcentaje < 100);
});

test('editar un resumen y regenerar el cierre no convierten la fase en confirmada ni suman mensajes como pasos', async () => {
  const h = harness({ interpret: accepted }); await complete(h);
  const antes = h.last.progresoFase1;
  h.interpretWith(() => ({ respuestas: [{ id: 's03_objetivo_a', valor: 'Nuevo objetivo' }] }));
  await h.send('Cambio de objetivo'); assert.deepEqual(h.last.progresoFase1, antes);
  await h.send('Generar cierre', { accion: 'regenerar_cierre' }); assert.deepEqual(h.last.progresoFase1, antes);
  assert.equal(h.doc.fase1.confirmada, undefined);
});


test('pregunta de alergias aparece entre datos generales y síntomas, con las siete opciones exactas y un solo valor', async () => {
  const h = harness({ interpret: accepted }); await complete(h, 's01_tipo_alergia');
  assert.equal(h.last.respuesta, '¿A qué tipo de sustancias tienes alergia?');
  assert.equal(h.last.tipoOpciones, 'single'); assert.equal(h.last.questionType, 'single');
  assert.deepEqual(h.last.opciones, ['Medicamentos', 'Alimentos', 'Sustancias del ambiente', 'Sustancias en contacto con la piel', 'Picaduras de insectos', 'Otra', 'No tengo alergias conocidas']);
  const ids = h.doc.fase1.preguntas.map(q => q.id);
  assert(ids.indexOf('s01_tipo_alergia') > ids.indexOf('s01_dispositivos'));
  assert(ids.indexOf('s01_tipo_alergia') < ids.indexOf('s03_sintomas_tabla'));
  assert(ids.every(id => id.startsWith('s01_') || id.startsWith('s03_')), 'la fase 1 solo incluye s01 y s03');
  const q = h.doc.fase1.preguntas.find(q => q.id === 's01_tipo_alergia');
  assert.equal(flow.normalizarRespuesta(q, ['medicamentos', 'alimentos']).valido, false);
  assert.equal(h.doc.respuestas.s01_tipo_alergia, undefined);
});

test('cada opción de alergias se guarda sin IA y solo la ausencia de alergias desactiva el seguimiento', async () => {
  const h = harness({ interpret: accepted }); await complete(h, 's01_tipo_alergia');
  const doc = h.doc;
  for (const opcion of sections.s01.questions.find(q => q.id === 's01_tipo_alergia').options) {
    const caso = harness({ doc, interpret: accepted });
    const result = await caso.send(opcion.label, { valorRespuesta: opcion.value, version: doc.fase1.version, questionId: 's01_tipo_alergia', requestId: 'alergia-' + opcion.value });
    assert.equal(result.statusCode, 200); assert.equal(caso.aiCalls, 0);
    assert.equal(caso.doc.respuestas.s01_tipo_alergia, opcion.value);
    assert.deepEqual(caso.last.seguimientoAlergia, { tipo: opcion.value, requerido: opcion.value !== 'sin_alergias_conocidas' });
    assert.equal(caso.last.questionId, opcion.value === 'sin_alergias_conocidas' ? 's01_enfermedades_familia' : 's01_sustancia_alergia');
    assert(caso.last.progresoFase1.porcentaje > doc.fase1.ultimaRespuesta.progresoFase1.porcentaje);
    assert.equal(flow.datosParaCierre(caso.doc.respuestas).s01_tipo_alergia, opcion.value);
  }
});

test('alergias pendientes se recuperan con opciones; una opción inválida no se guarda ni cambia la pregunta', async () => {
  const h = harness({ interpret: accepted }); await complete(h, 's01_tipo_alergia');
  const version = h.doc.fase1.version;
  const reload = await h.send('', { accion: 'reanudar' }); assert.equal(reload.body.data.opciones.length, 7);
  await h.send('No sé', { valorRespuesta: 'invalido' });
  assert.equal(h.last.questionId, 's01_tipo_alergia'); assert.equal(h.doc.respuestas.s01_tipo_alergia, undefined);
  await h.send('No tengo alergias conocidas', { valorRespuesta: 'sin_alergias_conocidas' });
  assert.equal(h.last.seguimientoAlergia.requerido, false);
  assert(h.doc.fase1.version > version);
});

test('editar la categoría de alergia actualiza la condición de seguimiento y el resumen', async () => {
  const h = harness({ interpret: accepted }); await complete(h);
  assert.equal(h.last.seguimientoAlergia.requerido, true);
  h.interpretWith(() => ({ respuestas: [{ id: 's01_tipo_alergia', valor: 'sin_alergias_conocidas' }] }));
  await h.send('Corrijo: no tengo alergias conocidas');
  assert.equal(h.last.seguimientoAlergia.requerido, false);
  assert(h.last.resumenItems.some(item => item.includes('No tengo alergias conocidas')));
});

test('entrevistas antiguas en curso reciben la nueva pregunta una sola vez y se incorpora a su progreso', async () => {
  const h = harness({ interpret: accepted }); await h.send('Consulta preventiva');
  const doc = h.doc;
  doc.fase1.preguntas = doc.fase1.preguntas.filter(q => q.id !== 's01_tipo_alergia');
  doc.fase1.preguntasProgreso = doc.fase1.preguntasProgreso.filter(id => id !== 's01_tipo_alergia');
  const antigua = harness({ doc, interpret: accepted });
  await antigua.send('Desarrolladores de software', { valorRespuesta: { codigo: '2512' }, version: doc.fase1.version, questionId: doc.fase1.preguntaId, requestId: 'ocupacion-migrada' });
  assert.equal(antigua.doc.fase1.preguntas.filter(q => q.id === 's01_tipo_alergia').length, 1);
  assert(antigua.doc.fase1.preguntasProgreso.includes('s01_tipo_alergia'));
  await antigua.send('Tres años', { requestId: 'anos-migrados' });
  assert.equal(antigua.doc.fase1.preguntas.filter(q => q.id === 's01_tipo_alergia').length, 1);
});


test('mover alergias de s02 a s01 conserva la respuesta o pregunta pendiente en sesiones de la versión anterior', async () => {
  for (const respondida of [false, true]) {
    const h = harness({ interpret: accepted }); await complete(h, 's01_tipo_alergia');
    if (respondida) await h.send('No tengo alergias conocidas', { valorRespuesta: 'sin_alergias_conocidas' });
    const doc = h.doc;
    doc.fase1.preguntas = doc.fase1.preguntas.map(q => q.id === 's01_tipo_alergia' ? { ...q, id: 's02_tipo_alergia' } : q);
    doc.fase1.preguntasProgreso = doc.fase1.preguntasProgreso.map(id => id === 's01_tipo_alergia' ? 's02_tipo_alergia' : id);
    if (doc.fase1.preguntaId === 's01_tipo_alergia') doc.fase1.preguntaId = 's02_tipo_alergia';
    if (respondida) { doc.respuestas.s02_tipo_alergia = doc.respuestas.s01_tipo_alergia; delete doc.respuestas.s01_tipo_alergia; }
    const antigua = harness({ doc, interpret: accepted });
    const result = await antigua.send(respondida ? 'Sin síntomas adicionales' : 'No tengo alergias conocidas', {
      valorRespuesta: respondida ? { sinDatos: true } : 'sin_alergias_conocidas', version: doc.fase1.version,
      questionId: doc.fase1.preguntaId, requestId: 'mover-alergia-' + respondida,
    });
    assert.equal(result.statusCode, 200);
    assert.equal(antigua.doc.respuestas.s01_tipo_alergia, 'sin_alergias_conocidas');
    assert.equal(antigua.doc.respuestas.s02_tipo_alergia, undefined);
    assert(antigua.doc.fase1.preguntas.every(q => q.id.startsWith('s01_') || q.id.startsWith('s03_')));
    assert.equal(antigua.last.seguimientoAlergia.requerido, false);
    assert.equal(antigua.last.questionId, respondida ? 's01_medicamentos_actuales' : 's01_enfermedades_familia');
  }
});


test('alergias: sustancia text, pregunta por más y No cierra el bloque conservando el par tipo/sustancia', async () => {
  const h = harness({ interpret: accepted }); await complete(h, 's01_tipo_alergia');
  await h.send('Medicamentos', { valorRespuesta: 'medicamentos' });
  assert.equal(h.last.questionId, 's01_sustancia_alergia');
  assert.equal(h.last.respuesta, '¿Qué medicamento, alimento o sustancia te causa alergia?');
  assert.equal(h.last.questionType, 'text'); assert.deepEqual(h.last.opciones, []);
  await h.send('Penicilina');
  assert.equal(h.last.questionId, 's01_mas_alergias');
  assert.deepEqual(h.doc.respuestas.s01_alergias, [{ tipo: 'medicamentos', sustancia: 'Penicilina' }]);
  await h.send('No, no tengo más alergias', { valorRespuesta: 'no' });
  assert.equal(h.last.questionId, 's01_enfermedades_familia');
});

test('añadir varias alergias conserva cada una, respeta el orden y no retrocede el porcentaje ni duplica al reintentar', async () => {
  const h = harness({ interpret: accepted }); await complete(h, 's01_tipo_alergia');
  await h.send('Medicamentos', { valorRespuesta: 'medicamentos' }); await h.send('Penicilina');
  const porcentaje = h.last.progresoFase1.porcentaje;
  const seguir = await h.send('Sí, tengo otra alergia', { valorRespuesta: 'si' });
  assert.equal(h.last.questionId, 's01_tipo_alergia_2');
  assert(!h.last.opciones.includes('No tengo alergias conocidas'));
  assert.equal(h.last.progresoFase1.porcentaje, porcentaje);
  const n = h.doc.fase1.preguntas.length;
  await h.send('Sí, tengo otra alergia', seguir.request); assert.equal(h.doc.fase1.preguntas.length, n);
  await h.send('Alimentos', { valorRespuesta: 'alimentos' });
  assert.equal(h.last.questionId, 's01_sustancia_alergia_2'); await h.send('Camarón');
  assert.equal(h.last.questionId, 's01_mas_alergias_2');
  await h.send('No, no tengo más alergias', { valorRespuesta: 'no' });
  assert.equal(h.last.questionId, 's01_enfermedades_familia');
  assert.deepEqual(h.doc.respuestas.s01_alergias, [{ tipo: 'medicamentos', sustancia: 'Penicilina' }, { tipo: 'alimentos', sustancia: 'Camarón' }]);
  assert(h.last.progresoFase1.porcentaje >= porcentaje);
  const cierre = flow.cierreDeterminista(h.doc.respuestas, h.doc.fase1.preguntas);
  assert(cierre.resumenItems.some(s => s.includes('Penicilina') && s.includes('Camarón')));
  assert.equal(flow.datosParaCierre(h.doc.respuestas).s01_alergias.length, 2);
});

test('ninguna alergia conocida omite sustancia y más alergias y deja el registro vacío', async () => {
  const h = harness({ interpret: accepted }); await complete(h, 's01_tipo_alergia');
  await h.send('No tengo alergias conocidas', { valorRespuesta: 'sin_alergias_conocidas' });
  assert.equal(h.last.questionId, 's01_enfermedades_familia'); assert.deepEqual(h.doc.respuestas.s01_alergias, []);
});

test('recargar y fallar al guardar una sustancia conserva el paso pendiente y la lista anterior', async () => {
  const h = harness({ interpret: accepted }); await complete(h, 's01_tipo_alergia');
  await h.send('Medicamentos', { valorRespuesta: 'medicamentos' });
  const resume = await h.send('', { accion: 'reanudar' }); assert.equal(resume.body.data.questionId, 's01_sustancia_alergia');
  h.failWrites(true); const fallo = await h.send('Penicilina'); assert.equal(fallo.statusCode, 500);
  assert.deepEqual(h.doc.respuestas.s01_alergias, []); assert.equal(h.doc.fase1.preguntaId, 's01_sustancia_alergia');
  h.failWrites(false); await h.send('Penicilina', fallo.request);
  assert.equal(h.doc.respuestas.s01_alergias.length, 1); assert.equal(h.last.questionId, 's01_mas_alergias');
});

test('una respuesta ambigua a la sustancia no avanza ni inventa una alergia', async () => {
  const h = harness({ interpret: accepted }); await complete(h, 's01_tipo_alergia');
  await h.send('Medicamentos', { valorRespuesta: 'medicamentos' }); await h.send('Sí');
  assert.equal(h.last.questionId, 's01_sustancia_alergia'); assert.deepEqual(h.doc.respuestas.s01_alergias, []);
});

test('una entrevista con la categoría ya guardada incorpora la pregunta de sustancia sin repetir categoría', async () => {
  const h = harness({ interpret: accepted }); await complete(h, 's01_tipo_alergia');
  const doc = h.doc;
  doc.fase1.preguntas = doc.fase1.preguntas.filter(q => !['s01_sustancia_alergia', 's01_mas_alergias'].includes(q.id));
  delete doc.fase1.preguntas.find(q => q.id === 's01_tipo_alergia').allergyRole;
  const anterior = harness({ doc, interpret: accepted });
  const result = await anterior.send('Medicamentos', { valorRespuesta: 'medicamentos', version: doc.fase1.version, questionId: doc.fase1.preguntaId, requestId: 'detalle-nuevo' });
  assert.equal(result.statusCode, 200); assert.equal(anterior.last.questionId, 's01_sustancia_alergia');
});


test('catálogo CIE10 conserva los 12634 códigos, nombres y descripciones de la fuente sin duplicados', () => {
  assert.equal(datosCIE10.registros.length, 12634);
  assert.equal(new Set(datosCIE10.registros.map(e => e.codigo)).size, 12634);
  assert(datosCIE10.registros.every(e => typeof e.codigo === 'string' && e.codigo && e.nombre && e.descripcion));
  assert.equal(cie10.obtenerCIE10('A000').nombre, 'COLERA DEBIDO A VIBRIO CHOLERAE 01, BIOTIPO CHOLERAE');
  assert.equal(cie10.obtenerCIE10('A000').descripcion, 'COLERA');
  assert.equal(cie10.buscarCIE10('E11.9')[0].codigo, 'E119');
  assert(cie10.buscarCIE10('hipertensión').some(e => e.codigo === 'I10X'));
  assert.equal(cie10.buscarCIE10('zzzzzzzzzzzz').length, 0);
  const h = harness(); assert.equal(h.searchCIE10('diabetes').body.data.length, 15);
  assert.equal(h.searchCIE10(['dato']).statusCode, 400); assert.equal(h.searchCIE10('x'.repeat(101)).statusCode, 400);
});

test('antecedentes familiares es search en s01 con los cuatro parentescos y códigos exactos', async () => {
  const h = harness({ interpret: accepted }); await complete(h, 's01_enfermedades_familia');
  assert.equal(h.last.respuesta, '¿Qué enfermedades conoces en tu familia?'); assert.equal(h.last.tipoOpciones, 'search');
  assert.equal(h.last.busqueda.source, 'cie10'); assert.equal(h.last.busqueda.multiple, true);
  assert.deepEqual(h.last.busqueda.parentescos, [{ codigo: '01', descripcion: 'Padre' }, { codigo: '02', descripcion: 'Hermano' }, { codigo: '03', descripcion: 'Tío' }, { codigo: '04', descripcion: 'Abuelo' }]);
  assert(h.doc.fase1.preguntas.every(q => q.id.startsWith('s01_') || q.id.startsWith('s03_')));
});

test('guarda varias enfermedades por parentesco con los textos del catálogo y evita duplicados', async () => {
  const h = harness({ interpret: accepted }); await complete(h, 's01_enfermedades_familia');
  const calls = h.aiCalls;
  const result = await h.send('Antecedentes seleccionados', { valorRespuesta: { familiares: [
    { parentescoCodigo: '01', descripcion: 'Inventada', codigos: ['I10X', 'E119', 'I10X'] },
    { parentescoCodigo: '04', codigos: ['C509'] },
  ] } });
  assert.equal(result.statusCode, 200); assert.equal(h.aiCalls, calls);
  const r = h.doc.respuestas.s01_enfermedades_familia;
  assert.equal(r.estado, 'registradas'); assert.equal(r.familiares.length, 2);
  assert.deepEqual(r.familiares[0].parentesco, { codigo: '01', descripcion: 'Padre' });
  assert.equal(r.familiares[0].enfermedades.length, 2);
  assert.deepEqual(r.familiares[0].enfermedades[1], clone(cie10.obtenerCIE10('E119')));
  assert.deepEqual(r.familiares[1].parentesco, { codigo: '04', descripcion: 'Abuelo' });
  assert.equal(h.last.questionId, 's01_medicamentos_actuales');
  assert.deepEqual(flow.datosParaCierre(h.doc.respuestas).s01_enfermedades_familia, r);
  assert(flow.cierreDeterminista(h.doc.respuestas, h.doc.fase1.preguntas).resumenItems.some(s => s.includes('Padre') && s.includes('Abuelo')));
});

test('rechaza parentescos no definidos, códigos inventados, registros vacíos y parentescos repetidos', async () => {
  const h = harness({ interpret: accepted }); await complete(h, 's01_enfermedades_familia'); const version = h.doc.fase1.version;
  for (const familiares of [[], [{ parentescoCodigo: '99', codigos: ['I10X'] }], [{ parentescoCodigo: 1, codigos: ['I10X'] }],
    [{ parentescoCodigo: '01', codigos: ['INVENTADO'] }], [{ parentescoCodigo: '01', codigos: [] }],
    [{ parentescoCodigo: '01', codigos: ['I10X'] }, { parentescoCodigo: '01', codigos: ['E119'] }]]) {
    const result = await h.send('Dato', { valorRespuesta: { familiares } });
    assert.equal(result.statusCode, 400); assert.equal(h.doc.fase1.version, version);
    assert.equal(h.doc.respuestas.s01_enfermedades_familia, undefined);
  }
});

test('desconocer antecedentes no inventa códigos y una respuesta perdida se reintenta sin duplicar', async () => {
  const h = harness({ interpret: accepted }); await complete(h, 's01_enfermedades_familia');
  const antes = h.last.progresoFase1.porcentaje;
  const result = await h.send('No conozco enfermedades en mi familia', { valorRespuesta: { sinDatos: true } });
  assert.deepEqual(h.doc.respuestas.s01_enfermedades_familia, { estado: 'no_conoce', familiares: [] });
  assert(h.last.progresoFase1.porcentaje > antes);
  const version = h.doc.fase1.version; await h.send('No conozco enfermedades en mi familia', result.request);
  assert.equal(h.doc.fase1.version, version);
});

test('CUM importa los 100000 registros del Excel y distingue presentaciones con el mismo nombre', () => {
  assert.equal(datosCUM.registros.length, 100000);
  assert.equal(new Set(datosCUM.registros.map(m => m.codigo)).size, 100000);
  assert.equal(cum.obtenerCUM('10045-1').nombre, 'IBUPROFENO 500 MG TABLETAS');
  assert.equal(cum.obtenerCUM('10045-2').nombre, 'IBUPROFENO 500 MG TABLETAS');
  assert.notEqual(cum.obtenerCUM('10045-1').descripcion, cum.obtenerCUM('10045-2').descripcion);
  assert.equal(cum.buscarCUM('10045-2')[0].codigo, '10045-2');
  assert(cum.buscarCUM('flunaricina').some(m => m.codigo === '10042-1'));
  assert.equal(cum.buscarCUM('zzzzzzzzzzzz').length, 0);
  const h = harness(); assert(h.searchCUM('ibuprofeno').body.data.length <= 15);
  assert.deepEqual(h.searchCUM('ib').body.data, []);
  assert.equal(h.searchCUM(['x']).statusCode, 400); assert.equal(h.searchCUM('x'.repeat(101)).statusCode, 400);
});

test('medicamentos: search múltiple en s01 guarda códigos y nombres canónicos, mezcla manual y reintenta sin duplicar', async () => {
  const h = harness({ interpret: accepted }); await complete(h, 's01_medicamentos_actuales');
  assert.equal(h.last.respuesta, '¿Qué medicamentos tomas actualmente?'); assert.equal(h.last.tipoOpciones, 'search');
  assert.equal(h.last.busqueda.multiple, true); assert.equal(h.last.busqueda.unknownLabel, 'No tomo medicamentos');
  const calls = h.aiCalls, antes = h.last.progresoFase1.porcentaje;
  const result = await h.send('Medicamentos', { valorRespuesta: { codigos: ['10045-2', '10042-1', '10045-2'], noEncontrados: ['Nombre aportado'], nombre: 'Inventado' } });
  assert.equal(result.statusCode, 200); assert.equal(h.aiCalls, calls);
  const guardado = h.doc.respuestas.s01_medicamentos_actuales;
  assert.deepEqual(guardado, { estado: 'toma', medicamentos: [
    { codigo: '10045-2', nombre: cum.obtenerCUM('10045-2').nombre }, { codigo: '10042-1', nombre: cum.obtenerCUM('10042-1').nombre },
    { codigo: null, nombre: 'Nombre aportado', origen: 'declarado' }
  ] });
  assert.equal(h.last.questionId, 's03_sintomas_tabla'); assert(h.last.progresoFase1.porcentaje > antes);
  const version = h.doc.fase1.version; await h.send('Medicamentos', result.request); assert.equal(h.doc.fase1.version, version);
  const recarga = harness({ doc: h.doc }); await recarga.send('', { accion: 'reanudar' });
  assert.equal(recarga.last.questionId, 's03_sintomas_tabla'); assert.deepEqual(recarga.doc.respuestas.s01_medicamentos_actuales, guardado);
  assert.deepEqual(flow.datosParaCierre(h.doc.respuestas).s01_medicamentos_actuales, guardado);
  assert(flow.cierreDeterminista(h.doc.respuestas, h.doc.fase1.preguntas).resumenItems.some(s => s.includes('Nombre aportado') && s.includes('FLUNARICINA')));
});

test('medicamentos: rechaza códigos inexistentes, selección vacía y ausencia contradictoria sin avanzar', async () => {
  const h = harness({ interpret: accepted }); await complete(h, 's01_medicamentos_actuales');
  const version = h.doc.fase1.version;
  for (const valorRespuesta of [{}, { codigos: ['INVENTADO'] }, { codigos: [42] }, { codigos: '10045-1' },
    { noEncontrados: [''] }, { noEncontrados: [null] }, { noEncontrados: ['x'.repeat(1001)] }, { sinDatos: true, codigos: ['10045-1'] }]) {
    const result = await h.send('Dato', { valorRespuesta });
    assert.equal(result.statusCode, 400); assert.equal(h.doc.fase1.version, version);
    assert.equal(h.doc.respuestas.s01_medicamentos_actuales, undefined);
  }
  const q = h.doc.fase1.preguntas.find(q => q.id === 's01_medicamentos_actuales');
  assert.equal(flow.normalizarRespuesta(q, 'un medicamento').valido, false);
  assert.equal(flow.normalizarRespuesta(q, { estado: 'no_toma', medicamentos: [{ codigo: '10045-1', nombre: 'X' }] }).valido, false);
});

test('medicamentos: ausencia explícita y nombre manual sin código se guardan y avanzan sin llamar a IA', async () => {
  for (const [valorRespuesta, esperado] of [[{ sinDatos: true }, { estado: 'no_toma', medicamentos: [] }],
    [{ codigos: [], noEncontrados: ['  Mi medicamento  '] }, { estado: 'toma', medicamentos: [{ codigo: null, nombre: 'Mi medicamento', origen: 'declarado' }] }]]) {
    const h = harness({ interpret: accepted }); await complete(h, 's01_medicamentos_actuales');
    const calls = h.aiCalls; await h.send('Respuesta', { valorRespuesta });
    assert.equal(h.last.questionId, 's03_sintomas_tabla'); assert.equal(h.aiCalls, calls);
    assert.deepEqual(h.doc.respuestas.s01_medicamentos_actuales, esperado);
  }
});

test('medicamentos: el intérprete no puede inventar códigos ni responder el catálogo por adelantado', async () => {
  const h = harness({ interpret: input => ({ respuestas: [...accepted(input).respuestas,
    { id: 's01_medicamentos_actuales', valor: { estado: 'toma', medicamentos: [{ codigo: 'INVENTADO', nombre: 'Inventado' }] } }] }) });
  await complete(h, 's01_medicamentos_actuales');
  assert.equal(h.doc.respuestas.s01_medicamentos_actuales, undefined);
  const calls = h.aiCalls;
  const result = await h.send('Tomo un medicamento');
  assert.equal(result.statusCode, 400); assert.equal(h.aiCalls, calls);
  assert.equal(h.last.questionId, 's01_medicamentos_actuales');
});

test('medicamentos: un fallo al guardar conserva el paso y permite reintentar el mismo registro', async () => {
  const h = harness({ interpret: accepted }); await complete(h, 's01_medicamentos_actuales');
  h.failWrites(true);
  const result = await h.send('FLUNARICINA 10 MG', { valorRespuesta: { codigos: ['10042-1'] } });
  assert.equal(result.statusCode, 500); assert.equal(h.doc.respuestas.s01_medicamentos_actuales, undefined);
  h.failWrites(false); await h.send('FLUNARICINA 10 MG', result.request);
  assert.equal(h.last.questionId, 's03_sintomas_tabla');
  assert.equal(h.doc.respuestas.s01_medicamentos_actuales.medicamentos.length, 1);
});

test('medicamentos: actualiza entrevistas en curso una vez, conserva datos y no reabre resúmenes', async () => {
  const h = harness({ interpret: accepted }); await complete(h, 's01_enfermedades_familia');
  const doc = h.doc;
  doc.fase1.preguntas = doc.fase1.preguntas.filter(q => q.id !== 's01_medicamentos_actuales');
  doc.fase1.preguntasProgreso = doc.fase1.preguntasProgreso.filter(id => id !== 's01_medicamentos_actuales');
  const vieja = harness({ doc, interpret: accepted });
  await vieja.send('No conozco', { valorRespuesta: { sinDatos: true }, version: doc.fase1.version, questionId: doc.fase1.preguntaId, requestId: 'migracion-cums' });
  assert.equal(vieja.last.questionId, 's01_medicamentos_actuales');
  assert.equal(vieja.doc.fase1.preguntas.filter(q => q.id === 's01_medicamentos_actuales').length, 1);
  const fin = harness({ interpret: accepted }); await complete(fin);
  const cerrado = fin.doc;
  cerrado.fase1.preguntas = cerrado.fase1.preguntas.filter(q => q.id !== 's01_medicamentos_actuales');
  delete cerrado.respuestas.s01_medicamentos_actuales;
  const anterior = harness({ doc: cerrado });
  const result = await anterior.send('Sí', { accion: 'confirmar', version: cerrado.fase1.version, questionId: null, requestId: 'cierre-antiguo-cums' });
  assert.equal(result.statusCode, 200); assert.equal(anterior.doc.fase1.confirmada, true);
  assert(!anterior.doc.fase1.preguntas.some(q => q.id === 's01_medicamentos_actuales'));
});

}
