// Verificación optativa con Bedrock real y relatos sintéticos. No importa modelos ni accede a pacientes/MongoDB.
// Ejecutar: node scripts/check-antecedentes-equivalencias-bedrock.cjs --live [--casos=presion,tiroides,...]
if (!process.argv.includes('--live')) {
  console.log('Requiere --live: enviará exclusivamente los ejemplos sintéticos de este archivo a Bedrock.');
  process.exit(0);
}
require('dotenv').config({ quiet: true });
require('ts-node/register/transpile-only');
const assert = require('node:assert/strict');
const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
const { interpretarAntecedente } = require('../src/services/ai/antecedentesCIE10.ts');
const client = new BedrockRuntimeClient({ region: (process.env.BEDROCK_TEXT_REGION || process.env.AWS_REGION || 'us-east-1').trim(), maxAttempts: 1 });
const casos = [
  { id: 'presion', texto: 'Diagnóstico confirmado: presión alta.', codigos: ['I10X'] },
  { id: 'tiroides', texto: 'Diagnóstico confirmado: tiroides lenta.', codigos: ['E039'] },
  { id: 'epoc', texto: 'Diagnóstico confirmado: EPOC.', codigos: ['J449'] },
  { id: 'higado', texto: 'Diagnóstico confirmado: hígado graso no alcohólico.', codigos: ['K760'] },
  { id: 'errata', texto: 'Diagnóstico confirmado: hipertencion.', codigos: ['I10X'] },
  { id: 'aclaracion', texto: 'migraña', aclaraciones: ['creo que es sin aura', 'me confirmaron que es migraña sin aura'], codigos: ['G430'] },
  { id: 'diabetes', texto: 'diabetes', aclaraciones: ['diria que tiene diabetes tipo 1', 'es tipo 1'], codigos: ['E109'] },
  { id: 'ambiguo', texto: 'Algo del corazón, pero no sé qué enfermedad es.', codigos: [null], preguntar: true },
  { id: 'varias', texto: 'Diagnósticos confirmados: presión alta, tiroides lenta y EPOC.', codigos: ['I10X', 'E039', 'J449'] },
  { id: 'reformulacion', texto: 'Diagnóstico confirmado: tiroides lenta.', codigos: ['E039'], forzarRecuperacion: true },
];
const filtro = process.argv.find(a => a.startsWith('--casos='))?.slice('--casos='.length).split(',');
const pendientes = casos.filter(c => !filtro || filtro.includes(c.id)).flatMap(c => ['personal', 'familiar'].map(ambito => ({ ...c, ambito })));
if (!pendientes.length) throw Error('No hay casos seleccionados');
let fallos = 0;
async function ejecutar(caso) {
  const trazas = [];
  const input = { texto: caso.texto, aclaraciones: caso.aclaraciones || [], ambito: caso.ambito };
  try {
    const resultado = await interpretarAntecedente(input, async (system, datos) => {
      const etapa = datos.recuperar ? 'recuperacion' : datos.menciones ? 'seleccion' : 'extraccion';
      // Solo en este caso: simular una extracción sin candidatos para ejercitar la recuperación y selección reales.
      if (caso.forzarRecuperacion && etapa === 'extraccion') {
        trazas.push({ etapa: 'extraccion_simulada' });
        return { estado: 'referidas', menciones: [{ evidencias: [{ fuente: 0, texto: caso.texto }], clara: true, busquedas: ['sincoincidencialiteral'], referenciasCIE10: [] }] };
      }
      const res = await client.send(new ConverseCommand({
        modelId: (process.env.BEDROCK_TEXT_BIENVENIDA || 'global.anthropic.claude-sonnet-4-6').trim(),
        system: [{ text: system }], messages: [{ role: 'user', content: [{ text: JSON.stringify(datos) }] }],
        inferenceConfig: { maxTokens: 3500, temperature: 0 },
      }), { abortSignal: AbortSignal.timeout(25000) });
      if (res.stopReason !== 'end_turn') throw Error('Respuesta incompleta');
      const raw = (res.output?.message?.content || []).map(c => c.text || '').join('').trim();
      const respuesta = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''));
      trazas.push({ etapa, respuesta });
      return respuesta;
    });
    const codigos = resultado.registro.enfermedades.map(e => e.codigo);
    assert.deepEqual([...codigos].sort(), [...caso.codigos].sort());
    assert.equal(resultado.preguntas.length > 0, !!caso.preguntar);
    assert.equal(resultado.registro.textoOriginal, input.texto);
    assert.deepEqual(resultado.registro.aclaraciones, input.aclaraciones);
    if (caso.forzarRecuperacion) assert.equal(trazas.filter(t => t.etapa === 'recuperacion').length, 1);
    console.log(JSON.stringify({ caso: caso.id, ambito: caso.ambito, ok: true, codigos, preguntas: resultado.preguntas.length, etapas: trazas.map(t => t.etapa) }));
  } catch (error) {
    fallos++;
    // Solo trazas sintéticas; no imprimir configuración, cabeceras ni credenciales del proveedor.
    console.log(JSON.stringify({ caso: caso.id, ambito: caso.ambito, ok: false, error: error.name, codigo: error.code,
      causa: error.cause?.code, estadoHTTP: error.$metadata?.httpStatusCode, trazas }));
  }
}
(async () => {
  let indice = 0;
  const worker = async () => { while (indice < pendientes.length) await ejecutar(pendientes[indice++]); };
  await Promise.all([worker(), worker()]);
  client.destroy();
  console.log(JSON.stringify({ total: pendientes.length, fallos }));
  process.exitCode = fallos ? 1 : 0;
})().catch(error => { console.error(error.name); client.destroy(); process.exitCode = 1; });
