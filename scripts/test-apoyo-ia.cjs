// Ruta y servicio reales; base de datos y Bedrock simulados, sin datos de pacientes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, deps, globals = {}) {
  const mod = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  new Function('require', 'module', 'exports', ...Object.keys(globals), compiled.outputText)(id => {
    if (Object.hasOwn(deps, id)) return deps[id];
    throw Error('Importación inesperada: ' + id);
  }, mod, mod.exports, ...Object.values(globals));
  return mod.exports;
}
const citaId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
function setup({ encontrada = true, salida = 'Respuesta de apoyo sintética', falla = false, timeout = false } = {}) {
  const calls = [], db = [];
  let handler, timer, roles, middleware;
  const service = load('src/services/ai/apoyoConsultaService.ts', {
    './bedrockTextService': { invokeBedrockText: async (prompt, options) => {
      calls.push({ prompt, options });
      if (timeout) timer();
      if (falla || options.signal.aborted) throw Error('Fallo simulado del proveedor');
      return salida;
    } },
  });
  const query = value => ({ select() { return this; }, sort() { return this; }, lean: async () => value });
  const authenticate = () => {};
  load('src/routes/medico/apoyo-ia.ts', {
    express: { Router: () => ({ post(_path, ...handlers) { middleware = handlers; handler = handlers.at(-1); } }) },
    '../../middleware/auth': { authenticate, authorize: (...args) => { roles = args; return () => {}; } },
    '../../types': { UserRole: { MEDICO: 'medico' } },
    '../../models/Cita': { findOne(filter) { db.push(['cita', filter]); return query(encontrada ? { pacienteId: 'paciente-de-la-cita' } : null); } },
    '../../models/Paciente': { findById(id) { db.push(['paciente', id]); return query({ sexoBiologico: 'femenino' }); } },
    '../../models/Interrogatorio': { findOne(filter) { db.push(['preconsulta', filter]); return query({ historiaClinica: { antecedentes: { alergicos: 'Alergia de prueba' } } }); } },
    '../../services/ai/apoyoConsultaService': service,
  }, { setTimeout: cb => { timer = cb; return 1; }, clearTimeout() {} });
  const run = async (body = { citaId, pregunta: 'Puntos por aclarar', contexto: 'Historia actual de prueba' }) => {
    const response = { code: 200, on() {}, off() {}, status(code) { this.code = code; return this; }, json(data) { this.body = data; return this; } };
    await handler({ userId: 'medico-autenticado', body }, response);
    return response;
  };
  return { run, calls, db, roles, middleware, authenticate };
}
test('apoyo responde directamente con historia y preconsulta, protegido por rol y propietario', async () => {
  const h = setup();
  const res = await h.run({ citaId, pacienteId: 'paciente-ajeno', pregunta: 'Puntos por aclarar', contexto: 'Historia actual de prueba' });
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { respuesta: 'Respuesta de apoyo sintética' });
  assert.equal(h.middleware[0], h.authenticate);
  assert.deepEqual(h.roles, ['medico']);
  assert.deepEqual(h.db, [['cita', { _id: citaId, medicoId: 'medico-autenticado' }], ['paciente', 'paciente-de-la-cita'], ['preconsulta', { pacienteId: 'paciente-de-la-cita' }]]);
  assert.match(h.calls[0].prompt, /Historia actual de prueba/);
  assert.match(h.calls[0].prompt, /Alergia de prueba/);
  assert.match(h.calls[0].prompt, /PREGUNTA DEL MÉDICO:\nPuntos por aclarar/);
  assert.match(h.calls[0].options.system, /No modifiques la historia clínica ni la fórmula/);
  assert.equal(h.calls[0].options.signal.aborted, false);
});
test('rechaza citas ajenas antes de leer datos del paciente o invocar IA', async () => {
  const h = setup({ encontrada: false });
  assert.equal((await h.run()).code, 404);
  assert.equal(h.db.length, 1);
  assert.equal(h.calls.length, 0);
});
test('valida datos vacíos, tipos y límites antes de acceder a datos clínicos', async () => {
  const h = setup();
  for (const body of [{}, { citaId, pregunta: ' ' }, { citaId: 'inválida', pregunta: 'Resumen' },
    { citaId, pregunta: 42 }, { citaId, pregunta: 'x'.repeat(2001) }, { citaId, pregunta: 'Resumen', contexto: {} },
    { citaId, pregunta: 'Resumen', contexto: 'x'.repeat(100001) }]) {
    assert.equal((await h.run(body)).code, 400);
  }
  assert.equal(h.db.length, 0);
  assert.equal(h.calls.length, 0);
});
test('respuesta vacía o fallo del proveedor devuelven error visible, no éxito vacío', async () => {
  for (const options of [{ salida: '  ' }, { falla: true }]) {
    const res = await setup(options).run();
    assert.equal(res.code, 502);
    assert.match(res.body.message, /Inténtalo de nuevo/);
  }
});
test('tiempo de espera cancela la petición al proveedor y devuelve 504', async () => {
  const h = setup({ timeout: true });
  const res = await h.run();
  assert.equal(res.code, 504);
  assert.equal(h.calls[0].options.signal.aborted, true);
});
