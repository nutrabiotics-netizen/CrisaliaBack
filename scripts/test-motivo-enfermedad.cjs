const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const mod = { exports: {} };
const file = path.resolve(__dirname, '../src/services/openai/openaiService.ts');
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
} }).outputText;
new Function('require', 'module', 'exports', code)(id => {
  if (id === 'openai') return class { chat = { completions: { create: () => { throw Error('no llamar servicios reales'); } } }; };
  throw Error('Importación inesperada');
}, mod, mod.exports);
const service = mod.exports.default;

for (const formato of ['actual', 'anterior']) {
  test(`el parser clasifica duración y síntomas en enfermedad actual (${formato})`, () => {
    const tiempo = 'Tiempo de evolución: 4 semanas';
    const sintomas = formato === 'actual' ? 'Síntomas: Dolor bilateral en pies' : 'Síntoma o situación que genera la consulta: Dolor bilateral en pies';
    const texto = ['MOTIVO_CONSULTA:', 'Motivo principal: Consulta por dolor en pies',
      ...(formato === 'anterior' ? [tiempo, sintomas] : []), 'ENFERMEDAD_ACTUAL:',
      ...(formato === 'actual' ? [tiempo, sintomas] : []), 'Inicio: Gradual', 'Síntomas asociados: Inflamación',
      'ANTECEDENTES:', 'Patológicos: No reportado', 'OBJETIVOS:', '- Mejorar función', 'OBSERVACIONES:', 'Ninguna'].join('\n');
    const { historiaClinica: hc } = service.parsearRespuestaIA(texto);
    assert.deepEqual(hc.motivoConsulta, { motivoPrincipal: 'Consulta por dolor en pies' });
    assert.equal(hc.enfermedadActual.tiempoEvolucion, '4 semanas');
    assert.equal(hc.enfermedadActual.sintomas, 'Dolor bilateral en pies');
    assert.equal(hc.enfermedadActual.sintomasAsociados, 'Inflamación');
  });
}

test('el prompt exige un solo motivo y solicita duración y síntomas dentro de enfermedad actual', () => {
  const prompt = service.construirPrompt({ s03_sintomas_tabla: [{ sintoma: 'Dolor', evolucion: '4 semanas' }] });
  const formato = prompt.split('MOTIVO_CONSULTA:\n')[1];
  const motivo = formato.split('ENFERMEDAD_ACTUAL:')[0];
  const enfermedad = formato.split('ENFERMEDAD_ACTUAL:')[1].split('ANTECEDENTES:')[0];
  assert.match(motivo, /Motivo principal:/);
  assert.doesNotMatch(motivo, /Tiempo de evolución:|Síntomas:/);
  assert.match(enfermedad, /Tiempo de evolución:/);
  assert.match(enfermedad, /Síntomas:/);
});

test('el prompt conserva familiares específicos, códigos y enfermedades anidadas sin convertirlos en object Object', () => {
  const parentescos = require('../src/data/anamnesis_sections/s01.json').questions.find(q => q.id === 's01_enfermedades_familia').search.parentescos;
  const dato = { estado: 'registradas', familiares: parentescos.flatMap(p => (p.familiares || []).map(f => ({
    parentesco: { codigo: p.codigo, descripcion: p.descripcion }, familiar: f,
    enfermedades: [{ codigo: 'E119', nombre: 'Diabetes sintética', descripcion: 'Descripción sintética' }],
  }))) };
  const respuestas = { s01_enfermedades_familia: dato, s03_sintomas_tabla: [null, { sintoma: 'Molestia', detalles: { frecuencia: 'diaria' } }],
    s01_medicamentos_actuales: { estado: 'toma', medicamentos: [{ codigo: null, nombre: 'Declaración sintética', origen: 'declarado' }] } };
  const original = structuredClone(respuestas);
  const prompt = service.construirPrompt(respuestas);
  assert.doesNotMatch(prompt, /\[object Object\]/);
  for (const [id, valor] of Object.entries(respuestas)) {
    const linea = prompt.split('\n').find(l => l.startsWith(id + ': '));
    assert.deepEqual(JSON.parse(linea.slice(id.length + 2)), valor);
  }
  assert.deepEqual(respuestas, original);
  assert.match(prompt, /No deduzcas el familiar específico/);
  assert.match(prompt, /desconocimiento, no ausencia de antecedentes/);
});

test('el parser conserva la relación familiar-enfermedad del resumen recibido', () => {
  const familiares = 'Mamá: diabetes. Papá: hipertensión. Abuela paterna: diabetes.';
  const result = service.parsearRespuestaIA(`ANTECEDENTES:\nFamiliares: ${familiares}\nGinecológicos: No reportado\nOBJETIVOS:\n- Revisar antecedentes\nOBSERVACIONES:\nNinguna`);
  assert.equal(result.historiaClinica.antecedentes.familiares, familiares);
});
