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
