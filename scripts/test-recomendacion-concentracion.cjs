// Servicio y ruta reales con IA simulada: no envía datos ni consulta servicios externos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const silent = { log() {}, warn() {}, error() {} };
function load(file, deps) {
  const mod = { exports: {} };
  const result = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, reportDiagnostics: true,
  });
  assert.equal((result.diagnostics || []).length, 0);
  new Function('require', 'module', 'exports', 'console', 'process', result.outputText)(id => {
    if (Object.hasOwn(deps, id)) return deps[id];
    throw Error('Importación inesperada: ' + id);
  }, mod, mod.exports, silent, { env: {} });
  return mod.exports;
}
const respuesta = {
  medicamentos: [{ nombre: 'Producto sintético', concentracion: '2.5', unidadMedida: 'mg/mL', dosis: 'Cantidad por toma de prueba' }],
  suplementos: [
    { nombre: 'Suplemento sintético', concentracion: '100', unidadMedida: 'mcg', dosis: 'Cantidad por toma de prueba' },
    { nombre: 'Mezcla sintética', concentracion: '', unidadMedida: '', componentes: 'Componentes declarados sin concentración verificada', indicacion: 'Verificar concentración' },
  ], habitos: [], laboratorios: [],
};
let promptPrincipal;
const servicio = load('src/services/ai/crisaliaAgentService.ts', {
  '@aws-sdk/client-bedrock-agent-runtime': {
    InvokeAgentCommand: class { constructor(input) { this.input = input; } },
    BedrockAgentRuntimeClient: class {
      async send(command) {
        promptPrincipal = command.input.inputText;
        return { completion: (async function* () { yield { chunk: { bytes: Buffer.from(JSON.stringify(respuesta)) } }; })() };
      }
    },
  },
});
function validarFormato(prompt, inicioFormato) {
  assert.ok(prompt.includes(servicio.INSTRUCCIONES_CONCENTRACION_RECOMENDACIONES));
  const formato = prompt.slice(prompt.indexOf(inicioFormato));
  const schema = JSON.parse(formato.slice(formato.indexOf('{'), formato.lastIndexOf('}') + 1));
  for (const tipo of ['medicamentos', 'suplementos']) {
    assert.equal(typeof schema[tipo][0].concentracion, 'string');
    assert.equal(typeof schema[tipo][0].unidadMedida, 'string');
    assert.equal(typeof schema[tipo][0].dosis, 'string');
  }
}
test('el agente recibe concentración y unidad separadas de la dosis y preserva la respuesta', async () => {
  const result = await servicio.recomendarMedicamentosConsulta({ transcripcion: 'Transcripción sintética de prueba.' });
  validarFormato(promptPrincipal, 'Devuelve EXCLUSIVAMENTE');
  assert.match(promptPrincipal, /No deduzcas la concentración únicamente a partir de la dosis/);
  assert.match(promptPrincipal, /devuelve ambos campos como ""/);
  assert.deepEqual(result, respuesta);
});
test('el fallback pide los mismos campos y la API conserva unidades compuestas y datos vacíos', async () => {
  let handler, system, result;
  load('src/routes/medico/recomendacion-ia.ts', {
    express: { Router: () => ({ post(_ruta, ...handlers) { handler = handlers.at(-1); } }) },
    '../../middleware/auth': { authenticate() {}, authorize: () => () => {} },
    '../../types': { UserRole: { MEDICO: 'medico' } },
    '../../services/ai/crisaliaAgentService': { ...servicio, recomendarMedicamentosConsulta: async () => { throw Error('Fallo simulado'); } },
    '../../services/ai/bedrockTextService': { invokeBedrockText: async (_prompt, options) => { system = options.system; return JSON.stringify(respuesta); } },
    '../../models/Interrogatorio': {}, '../../models/Paciente': {}, '../../models/Cups2026': {},
  });
  await handler({ body: { transcripcion: 'Transcripción sintética de prueba.' } }, {
    json(body) { result = body; return this; }, status(code) { throw Error('Estado inesperado: ' + code); },
  });
  validarFormato(system, 'Devuelve SOLO JSON');
  assert.deepEqual(result, respuesta);
});
