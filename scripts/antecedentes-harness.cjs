// Módulos reales con el proveedor bloqueado; nunca usa red, credenciales ni datos reales.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const env = { JWT_SECRET: 'secret-exclusively-for-synthetic-tests' };
function load(file, deps = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, AbortSignal, process: { env }, console: { error() {}, log() {}, warn() {} },
    require(id) { if (Object.hasOwn(deps, id)) return deps[id]; throw Error('Unexpected import ' + id); } }, { filename: file });
  return module.exports;
}
const errors = load('src/utils/errors.ts');
const cie10 = load('src/utils/buscarCIE10.ts', { '../data/cie10_catalogo.json': require('../src/data/cie10_catalogo.json') });
const semantic = load('src/services/ai/antecedentesCIE10.ts', {
  '@aws-sdk/client-bedrock-runtime': { BedrockRuntimeClient: class { send() { throw Error('Network forbidden'); } }, ConverseCommand: class {} },
  jsonwebtoken: require('jsonwebtoken'), '../../utils/buscarCIE10': cie10, '../../utils/errors': errors,
});
const cum = load('src/utils/buscarCUM.ts', { '../data/cums_catalogo.json': require('../src/data/cums_catalogo.json') });
const medicamentos = load('src/services/ai/medicamentosReferidos.ts', {
  './antecedentesCIE10': semantic, '../../utils/buscarCUM': cum, '../../utils/errors': errors, jsonwebtoken: require('jsonwebtoken'),
});
module.exports = { load, semantic, cie10, cum, medicamentos, errors, env };
