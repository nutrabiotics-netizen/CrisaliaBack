// Flujo real con un stream simulado: no invoca AWS ni utiliza datos de pacientes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function harness(events, streamError) {
  const logs = [], commands = [];
  const mod = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../src/services/ai/crisaliaAgentService.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics.length, 0);
  const sdk = {
    InvokeAgentCommand: class { constructor(input) { this.input = input; } },
    BedrockAgentRuntimeClient: class {
      async send(command) {
        commands.push(command.input);
        return {
          $metadata: { requestId: 'request-test' },
          completion: (async function* () {
            yield* events;
            if (streamError) throw streamError;
          })(),
        };
      }
    },
  };
  const logger = Object.fromEntries(['log', 'warn', 'error'].map(level => [level, (...args) => logs.push(args)]));
  new Function('require', 'module', 'exports', 'console', 'process', compiled.outputText)(id => {
    assert.equal(id, '@aws-sdk/client-bedrock-agent-runtime');
    return sdk;
  }, mod, mod.exports, logger, { env: {} });
  return { service: mod.exports, logs, commands };
}

const privateText = 'CONTENIDO_CLINICO_SINTETICO_NO_REGISTRAR';
const trace = orchestrationTrace => ({ trace: {
  agentId: 'agent-test', agentAliasId: 'alias-test', agentVersion: '17',
  eventTime: new Date('2026-11-25T19:56:30Z'), trace: { orchestrationTrace },
} });
const chunk = text => ({ chunk: { bytes: Buffer.from(text) } });
const traceLogs = logs => logs.filter(([line]) => line.startsWith('[CrisaliaAgent] trace '))
  .map(([line]) => JSON.parse(line.slice('[CrisaliaAgent] trace '.length)));

test('recomendaciones activa trazas, conserva la respuesta y registra solo métricas correlacionadas', async () => {
  const result = { medicamentos: [], suplementos: [], habitos: [{ recomendacion: privateText }], laboratorios: [] };
  const response = JSON.stringify(result);
  const { service, commands, logs } = harness([
    trace({ modelInvocationInput: { traceId: 'step-model', foundationModel: 'model-test', text: privateText } }),
    trace({ rationale: { traceId: 'step-rationale', text: privateText } }),
    trace({ modelInvocationOutput: { traceId: 'step-model', rawResponse: { content: privateText },
      reasoningContent: { reasoningText: { text: privateText } },
      metadata: { totalTimeMs: 1234, usage: { inputTokens: 200, outputTokens: 30 } } } }),
    trace({ invocationInput: { traceId: 'step-action', invocationType: 'ACTION_GROUP',
      actionGroupInvocationInput: { actionGroupName: 'AgenteTerapeutico', parameters: [{ value: privateText }], requestBody: privateText } } }),
    trace({ observation: { traceId: 'step-action', type: 'ACTION_GROUP', actionGroupInvocationOutput: {
      text: privateText, metadata: { clientRequestId: 'lambda-request-test', totalTimeMs: 2500 } } } }),
    chunk(response.slice(0, 20)),
    trace({ invocationInput: { traceId: 'step-kb', invocationType: 'KNOWLEDGE_BASE',
      knowledgeBaseLookupInput: { knowledgeBaseId: 'kb-test', text: privateText } } }),
    trace({ observation: { traceId: 'step-kb', type: 'KNOWLEDGE_BASE', knowledgeBaseLookupOutput: {
      retrievedReferences: [{ content: { text: privateText }, metadata: { patient: privateText } }], metadata: { totalTimeMs: 150 } } } }),
    trace({ observation: { traceId: 'step-final', type: 'FINISH', finalResponse: {
      text: privateText, metadata: { operationTotalTimeMs: 4000 } } } }),
    chunk(response.slice(20)),
  ]);
  assert.deepEqual(await service.recomendarMedicamentosConsulta({ pacienteNombre: privateText }), result);
  assert.equal(commands[0].enableTrace, true);
  const recorded = traceLogs(logs);
  assert.equal(recorded.length, 7);
  assert.equal(new Set(recorded.map(item => item.invocationId)).size, 1);
  assert.ok(recorded.every(item => item.sessionId === commands[0].sessionId && item.requestId === 'request-test'));
  assert.equal(recorded[1].durationMs, 1234);
  assert.equal(recorded[1].inputTokens, 200);
  assert.equal(recorded[2].actionGroupName, 'AgenteTerapeutico');
  assert.equal(recorded[3].clientRequestId, 'lambda-request-test');
  assert.equal(recorded[4].knowledgeBaseId, 'kb-test');
  assert.equal(recorded[5].retrievedReferences, 1);
  assert.equal(recorded[6].operationTotalTimeMs, 4000);
  assert.equal(JSON.stringify(logs).includes(privateText), false);
});

test('las otras llamadas conservan las trazas desactivadas y no mezclan eventos con el texto', async () => {
  const { service, commands, logs } = harness([trace({ invocationInput: { traceId: 'step' } }), chunk('Respuesta de prueba.')]);
  assert.equal(await service.invokeCrisaliaAgent('Entrada de prueba'), 'Respuesta de prueba.');
  assert.equal(commands[0].enableTrace, false);
  assert.equal(traceLogs(logs).length, 0);
});

test('si falla el stream conserva las métricas recibidas y propaga el error', async () => {
  const error = new Error('Fallo de transporte simulado');
  const { service, logs } = harness([trace({ invocationInput: { traceId: 'step-action', invocationType: 'ACTION_GROUP' } })], error);
  await assert.rejects(service.invokeCrisaliaAgent('Entrada de prueba', { enableTrace: true }), error);
  const recorded = traceLogs(logs);
  assert.equal(recorded.length, 1);
  const failure = logs.find(([line]) => line.includes('error invocando agente'))[1];
  assert.equal(failure.invocationId, recorded[0].invocationId);
  assert.equal(failure.traceEvents, 1);
});

test('los fallos no registran su texto y los eventos desconocidos se omiten', () => {
  const { service } = harness([]);
  assert.equal(service.resumirTrazaBedrock({ trace: { $unknown: ['future', privateText] } }), undefined);
  const failure = service.resumirTrazaBedrock({ trace: { failureTrace: {
    traceId: 'failure-test', failureCode: 424, failureReason: privateText,
  } } });
  assert.equal(failure.failureCode, 424);
  assert.equal(JSON.stringify(failure).includes(privateText), false);
});
