// Controlador, flujo, catálogo y scores reales. Agent/Bedrock y almacenamiento simulados.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const clone = x => x === undefined ? undefined : structuredClone(x);
function load(file, deps = {}, env = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, structuredClone, AbortSignal, AbortController, TextDecoder, TextEncoder, Date, setTimeout, clearTimeout,
    console: { log() {}, warn() {}, info() {}, error() {} }, process: { env, cwd: () => root },
    require: id => { if (Object.hasOwn(deps, id)) return deps[id]; throw Error('Unexpected import '+id); } }, { filename: file });
  return module.exports;
}
const fase1 = load('src/services/ai/fase1Flow.ts');
const rdaFlow = load('src/services/paciente/preguntasRDAFlow.ts', { '../../data/rda_questions.json': require('../src/data/rda_questions.json') });
const flow = load('src/services/ai/fase2Flow.ts', { './fase1Flow': fase1, '../paciente/preguntasRDAFlow': rdaFlow });
const errors = load('src/utils/errors.ts');
const resetFlow = load('src/services/paciente/reinicioFase2Flow.ts');
const orchestrator = load('src/services/ai/anamnesisOrchestratorService.ts', { path, fs, './anamnesisAgentService': {} });
const index = orchestrator.cargarIndex();
const sections = orchestrator.cargarSecciones(index.sections.map(s => s.id));
const informe = { accion: 'generar_s37', progreso: 100, disfunciones_probables: [{ id: 1, nombre: 'Aspecto sintético para revisión médica',
  certeza: 'baja', etapa: 1, evidencia: ['s11_nivel_estres'], productos: [] }], disfunciones_a_descartar_con_paraclinicos: [], orden_abordaje: [], banderas_rojas: [], nota_medico: 'Revisar en consulta' };
const seleccionar = (...ids) => ({ accion: 'entrevistar', secciones: [...new Set(ids.map(id => id.slice(0,3)))], id_pregunta: ids, progreso: 35 });
function valorEn(o, key) { return key.split('.').reduce((v,k) => v?.[k],o); }
function matches(o, query) {
  return Object.entries(query).every(([key,v]) => {
    if (key === '$or') return v.some(q => matches(o,q));
    const actual = valorEn(o,key);
    if (Array.isArray(v)) return JSON.stringify(actual) === JSON.stringify(v);
    if (v instanceof Date) return actual instanceof Date && actual.getTime() === v.getTime();
    if (v && typeof v === 'object') {
      if ('$exists' in v) return (actual !== undefined) === v.$exists;
      if ('$ne' in v) return actual !== v.$ne;
      if ('$lt' in v) return actual < v.$lt;
    }
    return actual === v;
  });
}
function setPath(o,key,v) { const keys=key.split('.'); const last=keys.pop(); for (const k of keys) o=o[k] ??= {}; o[last]=clone(v); }
function unsetPath(o,key) { const keys=key.split('.'); const last=keys.pop(); for (const k of keys) { if(!o[k]) return; o=o[k]; } delete o[last]; }
function harness(options = {}) {
  let doc=clone(options.doc || { _id: 'a'.repeat(24), pacienteId: 'synthetic-patient', tipo: 'primera_vez', estado: 'en_proceso', progreso: 10,
    fase1: { confirmada: true }, respuestas: { s01_sexo: 'femenino', s03_sintoma_principal: 'Motivo sintético', historialChat: [],
      ...(!options.factoresPendientes ? { rda_factores_riesgo: { valor: ['sin_certeza'], etiqueta: 'No tengo certeza', respondidoEn: '2026-10-18T12:00:00Z' } } : {}),
      ...(!options.discapacidadPendiente ? { rda_discapacidad: { valor: '08', etiqueta: 'Sin discapacidad', respondidoEn: '2026-10-18T12:00:00Z' } } : {}),
      ...(!options.rdaPendiente ? { rda_oposicion_donacion: { valor: 'no_escrita', respondidoEn: '2026-10-18T12:00:00Z' } } : {}) } });
  let rdaRecord=clone(options.rdaRecord || {_id:'b'.repeat(24),pacienteId:doc.pacienteId,tipoRegistro:'inicial',fuenteFase1:{interrogatorioId:doc._id},estado:'borrador',activo:true,seccionInterrogatorioPrincipal:{}}),failRDASync=false,failResetCommit=false;
  let last=doc.fase2?.ultimaRespuesta, seq=0, agentCalls=0, interpretCalls=0, failCommit=false, breakCAS=false;
  const agentInputs=[], interpretInputs=[], agentOptions=[], redactInputs=[];
  let decisions = options.decisions || [seleccionar('s11_nivel_estres'), informe];
  function query(run) { return { lean: async () => clone(await run()), then(resolve,reject) { return Promise.resolve().then(run).then(clone).then(resolve,reject); } }; }
  const model = {
    findOne: q => query(() => matches(doc,q) ? doc : null),
    findOneAndUpdate: (q,update) => query(() => {
      if (failResetCommit && update.$set?.fase2Generacion !== undefined) throw Error('Fallo de reinicio sintético');
      if (update.$set?.fase2 && failCommit) throw Error('fallo de almacenamiento');
      if (update.$set?.fase2 && breakCAS) return null;
      if (!matches(doc,q)) return null;
      for (const [key,value] of Object.entries(update.$set || {})) setPath(doc,key,value);
      for (const key of Object.keys(update.$unset || {})) unsetPath(doc,key);
      for (const [key,value] of Object.entries(update.$push || {})) setPath(doc,key,[...(valorEn(doc,key)||[]),...value.$each]);
      return doc;
    }),
    updateOne: async (q,update) => { if (matches(doc,q)) for(const key of Object.keys(update.$unset||{})) unsetPath(doc,key); },
  };
  const controller = load('src/controllers/paciente/fase2Controller.ts', {
    crypto: require('node:crypto'), '../../models/Interrogatorio': model, '../../utils/errors': errors,
    '../../models/Cita': { findOne: () => ({ sort() { return this; }, lean: async () => null }) }, '../../utils/notificacionHelper': { crearNotificacionMedico: async () => {} },
    '../../utils/auditoriaHelper': { registrarAccion: async () => {} },
    '../../services/ai/fase2Flow': flow,
    '../../services/paciente/preguntasRDAFlow': rdaFlow,
    '../../services/paciente/reinicioFase2Flow': resetFlow,
    '../../services/ai/fase2Interpreter': { redactarPreguntasFase2: async (preguntas,respuestas,signal) => {
      redactInputs.push(clone({preguntas,respuestas}));
      return options.redact ? options.redact(preguntas,respuestas,signal) : preguntas.map(q=>({id:q.id,texto:q.text}));
    }, resumirInformeFase2: async () => { if(options.failSummary) throw Error('fallo'); return ['Resumen sintético basado en la entrevista', 'El médico revisará el informe del Agent']; }, interpretarRespuestaFase2: async input => {
      interpretCalls++; interpretInputs.push(clone(input));
      return options.interpret ? options.interpret(input) : { respuestas: input.pregunta ? [{ id: input.pregunta.id, valor: input.mensaje }] : [] };
    } },
    '../../services/ai/anamnesisOrchestratorService': { ...orchestrator, consultarSiguientePaso: async (input,opts) => {
      agentCalls++; agentInputs.push(clone(input)); agentOptions.push(opts);
      if (options.agent) return options.agent(input,agentCalls,opts);
      return clone(decisions[Math.min(agentCalls-1,decisions.length-1)]);
    } },
    '../../services/paciente/interrogatorio/interrogatorioService': { completarInterrogatorio: async () => {} },
  });
  const rdaModel={find:q=>query(()=>matches(rdaRecord,q)?[rdaRecord]:[]),findOneAndUpdate:(q,update)=>query(()=>{
    if(failRDASync) throw Error('Fallo RDA sintético');
    options.beforeRDAUpdate?.(rdaRecord);
    if(!matches(rdaRecord,q))return null;
    for(const [key,value] of Object.entries(update.$set||{}))setPath(rdaRecord,key,value);
    for(const key of Object.keys(update.$unset||{}))unsetPath(rdaRecord,key);
    return rdaRecord;
  })};
  const rdaController=load('src/controllers/paciente/preguntasRDAController.ts', {
    '../../models/Interrogatorio':model,'../../utils/errors':errors,'../../services/paciente/preguntasRDAFlow':rdaFlow,
    '../../services/ai/fase1Flow':fase1,
    '../../services/paciente/registroRDAInicialService':{guardarRDAInicial:async()=>clone(rdaRecord)},
    '../../models/RegistroRDA':rdaModel,'../../services/paciente/reinicioFase2Flow':resetFlow,'./fase2Controller':controller,
  });
  const resetController=load('src/controllers/paciente/reiniciarFase2Controller.ts',{
    crypto:require('node:crypto'),'../../models/Interrogatorio':model,'../../models/RegistroRDA':rdaModel,
    '../../utils/errors':errors,'./fase2Controller':controller,'../../services/paciente/reinicioFase2Flow':resetFlow,
  },options.env||{});
  return { model, get doc() { return clone(doc); }, get last() { return clone(last); }, get agentCalls() { return agentCalls; },
    get interpretCalls() { return interpretCalls; }, agentInputs, interpretInputs, agentOptions, redactInputs,
    failWrites(v) { failCommit=v; }, breakCAS(v) { breakCAS=v; }, decisions(v) { decisions=v; },
    get rdaRecord(){return clone(rdaRecord);},failRDASync(v){failRDASync=v;},failReset(v){failResetCommit=v;},
    async reset(body={},userId=options.userId||'synthetic-patient'){
      const req={userId,params:{interrogatorioId:doc._id},body:{generacion:doc.fase2Generacion||0,requestId:'reset-'+(++seq),...body}};
      const res={statusCode:200,status(c){this.statusCode=c;return this;},json(v){this.body=clone(v);}};
      await resetController.reiniciarFase2(req,res);return{...res,request:req.body};
    },
    async rda(method='GET',body={},userId=options.userId||'synthetic-patient') {
      const req={userId,params:{interrogatorioId:doc._id},body:{generacion:doc.fase2Generacion||0,requestId:'rda-'+(++seq),...body}};
      const res={statusCode:200,status(c){this.statusCode=c;return this;},json(v){this.body=clone(v);}};
      await rdaController[method==='GET'?'obtenerPreguntasRDA':'responderPreguntaRDA'](req,res);return res;
    },
    async radar(body={},userId=options.userId||'synthetic-patient') {
      const c=load('src/controllers/paciente/interrogatorio/interrogatorioController.ts', {
        '../../../services/paciente/interrogatorio/interrogatorioService':{}, '../../../utils/auditoriaHelper':{}, '../../../models/Interrogatorio':model,
        '../../../services/ai/AIService':{}, '../../../services/ai/fase1Flow':{}, '../../../services/paciente/registroRDAInicialService':{}, '../fase2Controller':controller,
        '../../../services/paciente/reinicioFase2Flow':resetFlow,
        '../../../services/ai/crisaliaAgentService':{generarPerfilRadar:async input=>options.radar?options.radar(input):{
          textoAnalisis:'Perfil sintético de prueba',perfilRadar:{ejes:['Sueño'],series:[{nombre:'Actual',puntajes:[2]}]},
        }},
      });
      const res={statusCode:200,status(c){this.statusCode=c;return this;},json(v){this.body=clone(v);}};
      await c.generarPerfilRadarInterrogatorio({userId,params:{interrogatorioId:doc._id},body},res);return res;
    },
    async ocr(body) {
      const c=load('src/controllers/paciente/interrogatorio/interrogatorioController.ts', {
        '../../../services/paciente/interrogatorio/interrogatorioService':{}, '../../../utils/auditoriaHelper':{}, '../../../models/Interrogatorio':model,
        '../../../services/ai/AIService':{}, '../../../services/ai/fase1Flow':{}, '../../../services/paciente/registroRDAInicialService':{}, '../fase2Controller':controller,
        '../../../services/paciente/reinicioFase2Flow':resetFlow,
      });
      const res={statusCode:200,status(c){this.statusCode=c;return this;},json(v){this.body=clone(v);}};
      await c.agregarParaclinicosOcr({userId:'synthetic-patient',params:{interrogatorioId:doc._id},body:{generacion:doc.fase2Generacion||0,...body}},res);return res;
    },
    async send(body = {}) {
      const request = { interrogatorioId: doc._id, generacion:doc.fase2Generacion||0, requestId: 'phase2-'+(++seq), version: last?.fase2Version, questionId: last?.questionId ?? null, ...body };
      const res = { statusCode: 200, status(c) { this.statusCode=c; return this; }, json(v) { this.body=clone(v); } };
      await controller.responderFase2({ userId: options.userId || 'synthetic-patient', body: request },res);
      if (res.body?.success) last=res.body.data;
      return { ...res, request };
    },
  };
}
module.exports={ harness, seleccionar, informe, flow, sections, orchestrator, load, rdaFlow, resetFlow };
if (require.main === module) {
test('preparar anticipa el Agent, conserva la subida al recargar y reutiliza su decisión sin otra llamada', async () => {
  const h=harness();await h.send({accion:'preparar'});
  assert.equal(h.agentCalls,1);assert.equal(h.last.examenesPendientes,true);assert.equal(h.doc.fase2.historial.length,0);
  await h.send({accion:'preparar'});assert.equal(h.agentCalls,1);assert.equal(h.last.examenesPendientes,true);
  assert.equal((await h.send({accion:'responder',mensajeUsuario:'5',valorRespuesta:5})).statusCode,409);
  await h.send({accion:'continuar'});assert.equal(h.agentCalls,1);assert.equal(h.last.examenesPendientes,false);
  assert.equal(h.last.questionId,'s11_nivel_estres');assert.equal(h.doc.fase2.historial.length,1);
});
test('resultados nuevos invalidan la preparación y el Agent reevalúa con OCR antes de continuar', async () => {
  const h=harness({decisions:[informe,seleccionar('s11_nivel_estres')]});await h.send({accion:'preparar'});
  const anterior=h.last.fase2Version;
  const body={paraclinicos:[{nombre:'Prueba',ocrValores:[{nombre:'Resultado sintético',valor:'1'}]}]};
  const r=await h.ocr(body);assert.equal(r.statusCode,200);assert.equal(r.body.data.fase2Version,anterior+1);
  assert.equal(h.doc.analisisFisiologicoIA,undefined);assert.equal(h.doc.fase2.decision,undefined);
  assert.equal(h.doc.fase2.estado,'decidiendo');assert.equal(h.doc.fase2.examenesPendientes,true);
  const repetido=await h.ocr(body);assert.equal(repetido.body.data.fase2Version,r.body.data.fase2Version);
  await h.send({accion:'continuar',version:r.body.data.fase2Version,questionId:null});
  assert.equal(h.agentCalls,2);assert(h.agentInputs[1].resumenRespuestas.includes('Resultado sintético'));
  assert.equal(h.last.questionId,'s11_nivel_estres');assert.equal(h.last.examenesPendientes,false);
});
test('OCR cancela la preparación sin esperarla: nuevas preguntas e informe usan resultados y una respuesta tardía no los pisa', async () => {
  let resolver;let termino=false;const agent=new Promise(r=>{resolver=r;});
  const h=harness({agent:(_input,n)=>n===1 ? agent : n===2 ? seleccionar('s06_toma_medicamentos') : informe});
  const pendiente=h.send({accion:'preparar'});
  pendiente.then(()=>{termino=true;});
  while (!h.agentCalls) await new Promise(r=>setTimeout(r,1));
  const r=await h.ocr({paraclinicos:[{nombre:'Prueba',ocrValores:[{nombre:'Dato',valor:'1'}]}]});assert.equal(r.statusCode,200);
  assert.equal(h.agentOptions[0].abortSignal.aborted,true);assert.equal(termino,false);
  await h.send({accion:'continuar',version:r.body.data.fase2Version,questionId:null});
  assert.equal(termino,false);assert.equal(h.last.questionId,'s06_toma_medicamentos');assert(h.agentInputs[1].resumenRespuestas.includes('Dato'));
  assert.notEqual(h.agentOptions[0].sessionId,h.agentOptions[1].sessionId,'sesiones aisladas incluso si la cancelación remota tarda');
  await h.send({mensajeUsuario:'No',valorRespuesta:'no'});await h.send({accion:'continuar'});
  assert.equal(h.last.fase2Estado,'resumen');assert(h.agentInputs[2].resumenRespuestas.includes('Dato'));
  const version=h.doc.fase2.version;resolver(seleccionar('s11_nivel_estres'));assert.equal((await pendiente).statusCode,409);
  assert.equal(h.doc.fase2.version,version);assert.equal(h.doc.fase2.decision.accion,'generar_s37');
});
test('OCR llegado antes de la reserva inicial establece una versión que impide preparar con contexto viejo', async () => {
  const h=harness();const r=await h.ocr({reemplazarPreparacion:true,paraclinicos:[{nombre:'Prueba',ocrValores:[{nombre:'Dato temprano',valor:'1'}]}]});
  assert.equal(r.statusCode,200);assert.equal(h.doc.fase2.estado,'decidiendo');
  assert.equal((await h.send({accion:'preparar',version:undefined})).statusCode,409);assert.equal(h.agentCalls,0);
  await h.send({accion:'continuar',version:r.body.data.fase2Version,questionId:null});assert.equal(h.agentCalls,1);assert(h.agentInputs[0].resumenRespuestas.includes('Dato temprano'));
});
test('los resultados no cancelan una ronda normal que ya está decidiendo con las respuestas del paciente', async () => {
  let resolver;const agent=new Promise(r=>{resolver=r;});const h=harness({agent:()=>agent});const pendiente=h.send();
  while(!h.agentCalls) await new Promise(r=>setTimeout(r,1));
  const r=await h.ocr({paraclinicos:[{nombre:'Prueba',ocrValores:[{nombre:'Dato',valor:'1'}]}]});assert.equal(r.statusCode,409);
  resolver(seleccionar('s11_nivel_estres'));assert.equal((await pendiente).statusCode,200);
});
test('el Agent elige preguntas y puede pedir otra ronda después de respuestas válidas', async () => {
  const h=harness({ decisions:[seleccionar('s11_nivel_estres'), seleccionar('s06_toma_medicamentos'), informe] });
  await h.send(); assert.equal(h.last.questionId,'s11_nivel_estres'); assert.equal(h.last.tipoOpciones,'scale'); assert.equal(h.last.scaleData.max,10);
  await h.send({ mensajeUsuario:'5', valorRespuesta:5 }); assert.equal(h.last.fase2Estado,'decidiendo'); assert.equal(h.agentCalls,1);
  await h.send({ accion:'continuar' }); assert.equal(h.last.questionId,'s06_toma_medicamentos'); assert.equal(h.agentCalls,2);
  await h.send({ mensajeUsuario:'No', valorRespuesta:'no' }); await h.send({ accion:'continuar' });
  assert.equal(h.last.fase2Estado,'resumen'); assert.equal(h.last.progreso,99);
  assert.equal(h.doc.estado,'en_proceso'); assert.equal(h.doc.fase2.decision.accion,'generar_s37');
  await h.send({ accion:'confirmar', mensajeUsuario:'Sí' }); assert.equal(h.doc.estado,'completado'); assert.equal(h.last.progreso,100);
});
test('el Agent puede generar el informe sin exigir preguntas ni todas las secciones', async () => {
  const h=harness({ decisions:[informe] }); await h.send();
  assert.equal(h.last.fase2Estado,'resumen'); assert.equal(h.doc.fase2.preguntas.length,0); assert.equal(h.agentCalls,1);
});
test('reanudar conserva exactamente pregunta, escala y versión sin invocar de nuevo al Agent', async () => {
  const h=harness(); await h.send(); const first=h.last;
  const recovered=harness({ doc:h.doc }); await recovered.send({ accion:'reanudar' });
  assert.equal(recovered.agentCalls,0); assert.equal(recovered.last.questionId,first.questionId);
  assert.deepEqual(recovered.last.scaleData,first.scaleData); assert.equal(recovered.last.fase2Version,first.fase2Version);
  assert(recovered.last.historial.length);
});
test('reintento del mismo requestId devuelve el mismo widget sin duplicar historial ni interpretar', async () => {
  const h=harness({ decisions:[seleccionar('s06_toma_medicamentos','s11_nivel_estres')] }); await h.send();
  const result=await h.send({ mensajeUsuario:'No', valorRespuesta:'no' }); const n=h.doc.fase2.historial.length;
  const retry=await h.send(result.request); assert.deepEqual(retry.body.data,result.body.data);
  assert.equal(h.doc.fase2.historial.length,n); assert.equal(h.interpretCalls,0);
});
test('dos pestañas no pueden responder a la misma versión y pregunta', async () => {
  const h=harness(); await h.send(); const a={ mensajeUsuario:'2', valorRespuesta:2, version:h.last.fase2Version, questionId:h.last.questionId };
  const r=await Promise.all([h.send({...a,requestId:'one'}),h.send({...a,requestId:'two'})]);
  assert.deepEqual(r.map(x=>x.statusCode).sort(),[200,409]); assert.equal(h.doc.respuestas.s11_nivel_estres,2);
});
test('un fallo de persistencia conserva la pregunta, libera reserva y permite repetir el mismo turno', async () => {
  const h=harness(); await h.send(); h.failWrites(true);
  const failed=await h.send({ mensajeUsuario:'4',valorRespuesta:4 }); assert.equal(failed.statusCode,500);
  assert.equal(h.doc.respuestas.s11_nivel_estres,undefined); assert.equal(h.doc.fase2Operacion,undefined);
  h.failWrites(false); const retry=await h.send(failed.request); assert.equal(retry.statusCode,200); assert.equal(h.doc.respuestas.s11_nivel_estres,4);
});
test('respuestas mal tipadas o fuera de rango no se guardan y el cliente no cambia el catálogo activo', async () => {
  const h=harness(); await h.send(); const v=h.doc.fase2.version;
  for(const value of [99,-1,'5',{},null]) { const r=await h.send({ mensajeUsuario:'valor',valorRespuesta:value,
    seccionesActivas:{ falsa:{questions:[{id:'s01_identidad_genero',type:'text'}]} }, idsPreguntaActivos:['s01_identidad_genero'] }); assert.equal(r.statusCode,400); }
  assert.equal(h.doc.fase2.version,v); assert.equal(h.doc.respuestas.s01_identidad_genero,undefined);
});
test('un intérprete no puede escribir otras preguntas, saltar rondas ni introducir respuestas inválidas', async () => {
  const h=harness({ interpret:() => ({ respuestas:[{id:'s01_identidad_genero',valor:'inventado'},{id:'s11_nivel_estres',valor:100}],finRonda:true }) });
  await h.send(); await h.send({mensajeUsuario:'Respuesta ambigua'});
  assert.equal(h.last.questionId,'s11_nivel_estres'); assert.equal(h.last.finRonda,false); assert.equal(h.doc.respuestas.s01_identidad_genero,undefined);
});
test('no se interpreta ni guarda ninguna respuesta al arrancar una ronda', async () => {
  const h=harness(); await h.send(); assert.equal(h.interpretCalls,0); assert.equal(h.doc.respuestas.s11_nivel_estres,undefined);
});
test('editar respuestas guardadas invalida el informe y vuelve a preguntar al Agent qué hacer', async () => {
  const h=harness({ interpret:()=>({ respuestas:[{id:'s11_nivel_estres',valor:2},{id:'s01_identidad_genero',valor:'05'}] }) });
  await h.send(); await h.send({mensajeUsuario:'5',valorRespuesta:5}); await h.send({accion:'continuar'});
  assert.equal(h.last.fase2Estado,'resumen'); await h.send({accion:'editar',mensajeUsuario:'Corrige mi estrés a dos'});
  assert.equal(h.doc.respuestas.s11_nivel_estres,2); assert.equal(h.doc.respuestas.s01_identidad_genero,undefined);
  assert.equal(h.last.fase2Estado,'decidiendo'); assert.equal(h.doc.analisisFisiologicoIA,undefined);
  h.decisions([seleccionar('s06_toma_medicamentos')]); await h.send({accion:'continuar'});
  assert.equal(h.last.questionId,'s06_toma_medicamentos');
});
test('el progreso del Agent conserva su carácter estimado y nunca marca 100 antes de confirmar', async () => {
  const h=harness({decisions:[{...seleccionar('s11_nivel_estres'),progreso:100}]}); await h.send();
  assert.equal(h.last.progreso,95); assert.equal(h.last.fase2Estado,'preguntando');
  assert.equal((await h.send({accion:'confirmar',mensajeUsuario:'Sí'})).statusCode,409);
});
test('una sección no aplicable se devuelve al Agent para que corrija su selección', async () => {
  const doc=harness().doc; doc.respuestas.s01_sexo='masculino';
  const h=harness({doc,decisions:[seleccionar('s07_embarazos'),seleccionar('s11_nivel_estres')]}); await h.send();
  assert.equal(h.last.questionId,'s11_nivel_estres'); assert.equal(h.agentCalls,2); assert(h.agentInputs[1].errorDecision);
});
test('una decisión inválida no crea ronda vacía ni simula éxito', async () => {
  const h=harness({decisions:[seleccionar('s99_inventada')]}); const r=await h.send();
  assert.equal(r.statusCode,503); assert.equal(h.doc.fase2,undefined); assert.equal(h.doc.fase2Operacion,undefined);
});
test('si el Agent elige solo preguntas ya respondidas, puede corregir y decidir generar informe', async () => {
  const doc=harness().doc; doc.respuestas.s11_nivel_estres=3;
  const h=harness({doc,decisions:[seleccionar('s11_nivel_estres'),informe]}); await h.send();
  assert.equal(h.last.fase2Estado,'resumen'); assert.equal(h.agentCalls,2);
});
test('las tablas de síntomas requieren cada ítem elegido y aceptan ceros explícitos', () => {
  const q={id:'q',seccionId:'s11',type:'symptom_table',text:'Prueba',items:[{id:'i1',label:'A'},{id:'i2',label:'B'}]};
  assert.equal(flow.validarRespuestaFase2(q,{i1:0,i2:0}).valido,true);
  for(const value of [{i1:0},{i1:0,i2:4},{i1:0,i2:'0'},{i1:0,i2:0,i3:1}]) assert.equal(flow.validarRespuestaFase2(q,value).valido,false);
});
test('checkbox excluye ninguno combinado, single canonicaliza y table acepta ausencia explícita', () => {
  const q=flow.catalogoFase2(sections,{s01_sexo:'femenino'});
  const checkbox=q.find(q=>q.type==='checkbox'&&q.options.some(o=>o.value==='ninguno'));
  const other=checkbox.options.find(o=>o.value!=='ninguno').value;
  assert.equal(flow.validarRespuestaFase2(checkbox,['ninguno',other]).valido,false);
  const single=q.find(q=>q.id==='s06_toma_medicamentos'); assert.equal(flow.validarRespuestaFase2(single,'No').valor,'no');
  assert.equal(flow.validarRespuestaFase2(q.find(q=>q.type==='table'),[]).valido,true);
});
test('los scores ignoran valores inválidos en lugar de superar el 100%', () => {
  const q=flow.catalogoFase2(sections,{s01_sexo:'femenino'}).find(q=>q.items?.length);
  const item=q.items[0].id;
  for(const v of [99,-3,'3',{},true,NaN]) assert.equal(orchestrator.calcularScores({[item]:v},index.sections).porSeccion[q.seccionId],undefined);
});
test('no se modifica una entrevista confirmada y el reintento de confirmación es idempotente', async () => {
  const h=harness({decisions:[informe]}); await h.send(); const result=await h.send({accion:'confirmar',mensajeUsuario:'Sí'});
  const version=h.last.fase2Version; await h.send(result.request); assert.equal(h.last.fase2Version,version);
  assert.equal((await h.send({mensajeUsuario:'Otro',valorRespuesta:2})).statusCode,409);
  await h.send({accion:'reanudar'}); assert.equal(h.last.fase2Estado,'confirmada'); assert.equal(h.last.progreso,100);
});
test('se protege la pertenencia del paciente y la confirmación previa de fase 1', async () => {
  const h=harness({userId:'other'}); assert.equal((await h.send()).statusCode,404);
  const doc=harness().doc; doc.fase1.confirmada=false; const unconfirmed=harness({doc}); assert.equal((await unconfirmed.send()).statusCode,409);
});
test('la medicación, antecedentes, ceros y negativas llegan al contexto del Agent sin truncar objetos', async () => {
  const doc=harness().doc; doc.respuestas.s01_medicamentos_actuales={estado:'no_toma',medicamentos:[]}; doc.respuestas.s06_detalle_tabla=[];
  doc.respuestas.s01_enfermedades_familia={estado:'no_conoce',familiares:[]}; doc.respuestas.s11_nivel_estres=0;
  doc.respuestas.examenes_paraclinicos=[{archivo:'Sintético',valores:[{nombre:'Resultado sintético',valor:'1'}]}];
  const h=harness({doc,decisions:[informe]}); await h.send();
  assert(h.agentInputs[0].medicacionActual.includes('no_toma')); assert(h.agentInputs[0].resumenRespuestas.includes('no_conoce'));
  assert(h.agentInputs[0].resumenRespuestas.includes('Resultado sintético')); assert(h.agentInputs[0].preguntasContestadas.includes('s11_nivel_estres'));
});
test('síntesis enviada por cliente no sustituye el informe de una decisión del Agent', async () => {
  const h=harness({decisions:[informe]}); await h.send({sintesisAgent:{disfunciones_probables:[{nombre:'Inventada'}]}});
  assert.equal(h.doc.analisisFisiologicoIA[0].nombre,informe.disfunciones_probables[0].nombre);
});
test('la ruta generar-sintesis solo recupera el informe guardado y rechaza uno del cliente', async () => {
  const h=harness();
  const controller=load('src/controllers/paciente/interrogatorio/interrogatorioController.ts', {
    '../../../services/paciente/interrogatorio/interrogatorioService':{}, '../../../utils/auditoriaHelper':{}, '../../../models/Interrogatorio':h.model,
    '../../../services/ai/AIService':{}, '../../../services/ai/fase1Flow':{}, '../../../services/paciente/registroRDAInicialService':{}, '../fase2Controller':{},
    '../../../services/paciente/reinicioFase2Flow':resetFlow,
  });
  const response=()=>({statusCode:200,status(c){this.statusCode=c;return this;},json(v){this.body=clone(v);}});
  const invalid=response(); await controller.generarSintesis({userId:'synthetic-patient',params:{interrogatorioId:h.doc._id},body:{sintesisAgent:informe}},invalid);
  assert.equal(invalid.statusCode,409); assert.equal(h.doc.analisisFisiologicoIA,undefined);
  h.decisions([informe]); await h.send(); const valid=response();
  await controller.generarSintesis({userId:'synthetic-patient',params:{interrogatorioId:h.doc._id},body:{sintesisAgent:{}}},valid);
  assert.equal(valid.statusCode,200); assert.equal(valid.body.data.analisisFisiologicoIA[0].nombre,informe.disfunciones_probables[0].nombre);
});
test('un relato urgente vuelve al Agent, cuya alerta se persiste y se recupera sin cerrar la entrevista', async () => {
  const h=harness({decisions:[seleccionar('s11_nivel_estres'),{accion:'alerta_medica',progreso:30,motivo:'Alerta sintética',instruccion:'Instrucción sintética',banderas_rojas:[]}],
    interpret:()=>({respuestas:[],alertaUrgente:true})});
  await h.send(); await h.send({mensajeUsuario:'Relato sintético de alerta'}); await h.send({accion:'continuar'});
  assert.equal(h.last.fase2Estado,'alerta'); assert.equal(h.doc.alertaMedica.motivo,'Alerta sintética'); assert.equal(h.doc.estado,'en_proceso');
  assert.equal(h.agentInputs[1].relatoAlerta,'Relato sintético de alerta');
  const calls=h.agentCalls; await h.send({accion:'reanudar'}); assert.equal(h.agentCalls,calls);
});
test('una aclaración nueva se guarda literalmente y el Agent recibe el contexto antes de decidir otras preguntas', async () => {
  const h=harness({decisions:[informe,seleccionar('s11_nivel_estres')]});await h.send();
  await h.send({accion:'aclarar',mensajeUsuario:'Quiero agregar un antecedente sintético que aún no se preguntó'});
  assert.equal(h.last.fase2Estado,'decidiendo');assert.equal(h.doc.analisisFisiologicoIA,undefined);
  await h.send({accion:'continuar'});assert(h.agentInputs[1].resumenRespuestas.includes('antecedente sintético'));
  assert.equal(h.last.questionId,'s11_nivel_estres');
});
test('el informe del Agent se conserva si falla la redacción del resumen y no se regenera al recargar', async () => {
  const h=harness({decisions:[informe],failSummary:true});await h.send();
  assert.equal(h.last.fase2Estado,'resumen');assert.equal(h.doc.analisisFisiologicoIA[0].nombre,informe.disfunciones_probables[0].nombre);
  await h.send({accion:'reanudar'});assert.equal(h.agentCalls,1);assert(h.last.resumenItems.length);
});
test('OCR se guarda antes de consultar al Agent sin sustituir las demás respuestas', async () => {
  const h=harness();const res=await h.ocr({paraclinicos:[{nombre:'archivo-sintetico.pdf',ocrValores:[{nombre:'Resultado sintético',valor:'1'}]}]});
  assert.equal(res.statusCode,200);await h.send();assert(h.agentInputs[0].resumenRespuestas.includes('Resultado sintético'));
  assert.equal(h.doc.respuestas.s03_sintoma_principal,'Motivo sintético');
});
test('OCR no puede alterar un informe preparado o una entrevista confirmada', async () => {
  const h=harness({decisions:[informe]});await h.send();
  const result=await h.ocr({paraclinicos:[{nombre:'Archivo',ocrValores:[{nombre:'Valor',valor:'1'}]}]});
  assert.equal(result.statusCode,409);assert.equal(h.doc.respuestas.examenes_paraclinicos,undefined);
});
test('reserva vigente bloquea nuevas decisiones y reserva vencida puede recuperarse', async () => {
  const doc=harness().doc;doc.fase2Operacion={token:'otro',requestId:'otra',venceEn:new Date(Date.now()+60000)};
  const bloqueada=harness({doc});assert.equal((await bloqueada.send()).statusCode,409);assert.equal(bloqueada.agentCalls,0);
  doc.fase2Operacion.venceEn=new Date(Date.now()-1000);const recuperada=harness({doc});assert.equal((await recuperada.send()).statusCode,200);
});
test('no se devuelve éxito si se pierde el control de la operación antes de guardar', async () => {
  const h=harness();await h.send();h.breakCAS(true);const res=await h.send({mensajeUsuario:'2',valorRespuesta:2});
  assert.equal(res.statusCode,409);assert.equal(h.doc.respuestas.s11_nivel_estres,undefined);
});
test('las tablas parciales seleccionadas por el Agent conservan los ítems previos y solo preguntan los pendientes', async () => {
  const q=flow.catalogoFase2(sections,{s01_sexo:'femenino'}).find(q=>q.items?.length>1);
  const doc=harness().doc;doc.respuestas[q.items[0].id]=2;
  const h=harness({doc,decisions:[seleccionar(q.items[0].id,q.items[1].id)]});await h.send();
  assert.deepEqual(h.last.tablaItems.map(i=>i.id),[q.items[1].id]);
  await h.send({mensajeUsuario:'Nunca',valorRespuesta:{[q.items[1].id]:0}});
  assert.equal(h.doc.respuestas[q.items[0].id],2);assert.equal(h.doc.respuestas[q.items[1].id],0);
});
test('el proveedor de interpretación rechaza JSON truncado y max_tokens, usa timeout y no dirige el flujo', async () => {
  let response,options;const sdk={BedrockRuntimeClient:class{async send(_cmd,opts){options=opts;return response;}},ConverseCommand:class{constructor(input){this.input=input;}}};
  const interpreter=load('src/services/ai/fase2Interpreter.ts',{'@aws-sdk/client-bedrock-runtime':sdk});
  const input={mensaje:'Cinco',pregunta:{id:'s11_nivel_estres',text:'Estrés',type:'scale',min:0,max:10,seccionId:'s11'},preguntas:[],respuestas:{},editando:false};
  response={stopReason:'end_turn',output:{message:{content:[{text:'{"respuestas":[{"id":"s11_nivel_estres","valor":5}]}'}]}}};
  assert.equal((await interpreter.interpretarRespuestaFase2(input)).respuestas[0].valor,5);assert(options.abortSignal);
  response.stopReason='max_tokens';await assert.rejects(interpreter.interpretarRespuestaFase2(input));
  response.stopReason='end_turn';response.output.message.content[0].text='{"respuestas":[';await assert.rejects(interpreter.interpretarRespuestaFase2(input));
});
test('el parser del Agent tolera llaves dentro de texto y sigue validando la acción', async () => {
  let text='Prefijo '+JSON.stringify({...informe,nota_medico:'Texto con } y { dentro, y "comillas"'});
  const sdk={BedrockAgentRuntimeClient:class{async send(){return{completion:(async function*(){yield{chunk:{bytes:new TextEncoder().encode(text)}};})()};}},InvokeAgentCommand:class{}};
  const agent=load('src/services/ai/anamnesisAgentService.ts',{'@aws-sdk/client-bedrock-agent-runtime':sdk,'../../utils/errors':errors});
  const d=await agent.invokeAnamnesisAgent('Caso de prueba');assert.equal(d.accion,'generar_s37');assert(d.nota_medico.includes('} y {'));
  text='{"accion":"inventada"}';await assert.rejects(agent.invokeAnamnesisAgent('Prueba'));
});
test('la cancelación externa llega al SDK de Bedrock y descarta incluso un chunk que llegue tarde', async () => {
  let opciones, resolver, iniciado;
  const pendiente=new Promise(r=>{resolver=r;});const inicio=new Promise(r=>{iniciado=r;});
  const sdk={BedrockAgentRuntimeClient:class{async send(_cmd,opts){opciones=opts;iniciado();return{completion:(async function*(){await pendiente;yield{chunk:{bytes:new TextEncoder().encode(JSON.stringify(informe))}};})()};}},InvokeAgentCommand:class{}};
  const agent=load('src/services/ai/anamnesisAgentService.ts',{'@aws-sdk/client-bedrock-agent-runtime':sdk,'../../utils/errors':errors});
  const cancelar=new AbortController();const respuesta=agent.invokeAnamnesisAgent('Caso sintético',{abortSignal:cancelar.signal});
  await inicio;cancelar.abort();assert.equal(opciones.abortSignal.aborted,true);
  resolver();await assert.rejects(respuesta);
  await assert.rejects(agent.invokeAnamnesisAgent('Ya cancelado',{abortSignal:cancelar.signal}));
});
test('el prompt real del Agent incluye preguntas disponibles, contestadas, negativas y relato adicional', async () => {
  let prompt='';const service=load('src/services/ai/anamnesisOrchestratorService.ts',{path,fs,'./anamnesisAgentService':{invokeAnamnesisAgent:async p=>{prompt=p;return informe;}}});
  await service.consultarSiguientePaso({sintomaInicial:'Prueba',seccionesCompletadas:['s11'],scores:{seccRojas:[],seccAmarillas:[],itemsCriticos:[]},
    preguntasContestadas:['s11_nivel_estres'],preguntasDisponibles:[{id:'s06_toma_medicamentos',seccion:'s06'}],resumenRespuestas:'no_toma',historialReciente:[{rol:'usuario',texto:'Aclaración sintética'}]});
  for(const esperado of ['s11_nivel_estres','s06_toma_medicamentos','no_toma','Aclaración sintética'])assert(prompt.includes(esperado));
});
test('cuando el Agent selecciona secciones sin IDs se conserva su orden de prioridad', () => {
  const catalogo=flow.catalogoFase2(sections,{s01_sexo:'femenino'});
  const preguntas=flow.elegirPreguntasAgent({accion:'entrevistar',secciones:['s13','s11']},catalogo,{});
  assert.equal(preguntas[0].seccionId,'s13');assert(preguntas.findIndex(q=>q.seccionId==='s11')>0);
});
test('el cierre antiguo no permite marcar primera_vez completada sin informe confirmado', async () => {
  const doc=harness().doc;
  const service=load('src/services/paciente/interrogatorio/interrogatorioService.ts', {
    '../../../models/Interrogatorio':{findOne:async()=>doc},'../../openai/openaiService':{},'../../ai/AIService':{},'../../notifications/medicoNotificacionService':{},
    '../reinicioFase2Flow':resetFlow,
  }).default;
  await assert.rejects(service.completarInterrogatorio(doc._id,'synthetic-patient'),/informe.*confirmado/);
  assert.equal(doc.estado,'en_proceso');
});
test('la ruta de completar controles conserva su flujo independiente de fase 2', async () => {
  let calls=0;const doc={...harness().doc,tipo:'control'};
  const controller=load('src/controllers/paciente/interrogatorio/interrogatorioController.ts', {
    '../../../services/paciente/interrogatorio/interrogatorioService':{completarInterrogatorio:async()=>{calls++;return {...doc,estado:'completado'};}},
    '../../../utils/auditoriaHelper':{},'../../../models/Interrogatorio':{findOne:()=>({lean:async()=>doc})},
    '../../../services/ai/AIService':{},'../../../services/ai/fase1Flow':{},'../../../services/paciente/registroRDAInicialService':{},'../fase2Controller':{},
    '../../../services/paciente/reinicioFase2Flow':resetFlow,
  });
  const res={statusCode:200,status(c){this.statusCode=c;return this;},json(v){this.body=clone(v);}};
  await controller.completarInterrogatorio({userId:'synthetic-patient',params:{interrogatorioId:doc._id},body:{}},res);
  assert.equal(res.statusCode,200);assert.equal(calls,1);assert.equal(res.body.data.estado,'completado');
});

test('Claude reformula una ronda del Agent sin cambiar preguntas, opciones, orden ni tipos; se reutiliza al responder y reanudar',async()=>{
  const ids=['s05_dx_metabolicas','s05_dx_inmunologicas','s34_polineuropatia'];
  const textos=['¿Te han diagnosticado alguna de estas enfermedades? Puedes marcar varias.','De esta lista, ¿cuáles enfermedades te han confirmado?','¿Con qué frecuencia tienes cada una de estas molestias?'];
  const h=harness({decisions:[seleccionar(...ids)],redact:qs=>qs.map((q,i)=>({id:q.id,texto:textos[i]}))});
  await h.send({accion:'preparar'});assert.equal(h.agentCalls,1);assert.equal(h.redactInputs.length,1);assert.deepEqual(h.redactInputs[0].preguntas.map(q=>q.id),ids);
  await h.send({accion:'continuar'});assert.equal(h.last.respuesta,textos[0]);assert.equal(h.last.questionType,'checkbox');
  const cat=flow.catalogoFase2(sections,h.doc.respuestas);for(const q of h.doc.fase2.preguntas){const {textoPaciente,...original}=q;assert.deepEqual(clone(original),clone(cat.find(p=>p.id===q.id)));}
  await h.send({mensajeUsuario:'Diabetes mellitus tipo 1',valorRespuesta:['dm1']});
  assert.equal(h.last.respuesta,textos[1]);assert.equal(h.agentCalls,1);assert.equal(h.redactInputs.length,1);
  await h.send({accion:'reanudar'});assert.equal(h.last.respuesta,textos[1]);assert.equal(h.redactInputs.length,1);
  await h.send({mensajeUsuario:'Ninguna',valorRespuesta:['ninguna']});assert.equal(h.last.respuesta,textos[2]);assert.equal(h.last.questionType,'symptom_table');assert.equal(h.last.tablaEscala,'frecuencia');
  assert.deepEqual(h.last.tablaItems,clone(cat.find(q=>q.id===ids[2]).items));assert.equal(h.agentCalls,1);
});
test('una entrevista anterior recupera la redacción Claude sin repetir el Agent ni duplicar la pregunta pendiente',async()=>{
  const a=harness({decisions:[seleccionar('s05_dx_metabolicas')]});await a.send();const doc=a.doc;
  doc.fase2.preguntas.forEach(q=>delete q.textoPaciente);doc.fase2.ultimaRespuesta.respuesta=doc.fase2.preguntas[0].text;
  const h=harness({doc,redact:qs=>qs.map(q=>({id:q.id,texto:'¿Te han confirmado alguna de estas enfermedades?'}))});const n=doc.fase2.historial.length;
  await h.send({accion:'reanudar',requestId:'retomar-con-redaccion'});assert.equal(h.last.respuesta,'¿Te han confirmado alguna de estas enfermedades?');assert.equal(h.agentCalls,0);assert.equal(h.redactInputs.length,1);assert.equal(h.doc.fase2.historial.length,n);
  assert.equal(h.doc.fase2.historial.at(-1).texto,h.last.respuesta);await h.send({accion:'reanudar'});assert.equal(h.redactInputs.length,1);
});
test('un fallo de Claude conserva la decisión del Agent y usa una pregunta clara de respaldo',async()=>{
  const h=harness({decisions:[seleccionar('s05_dx_metabolicas','s34_polineuropatia')],redact:()=>{throw Error('proveedor no disponible');}});await h.send();
  assert.equal(h.last.respuesta,'¿Un profesional de salud te ha diagnosticado alguna de estas enfermedades? Puedes marcar varias opciones.');assert.equal(h.agentCalls,1);assert.equal(h.doc.fase2.preguntas[1].textoPaciente.includes('¿Con qué frecuencia'),true);
  await h.send({accion:'reanudar'});assert.equal(h.agentCalls,1);assert.equal(h.redactInputs.length,1);
});
test('redactor Claude valida todos los IDs, el orden, texto y terminación, sin aceptar opciones ni decisiones nuevas',async()=>{
  let response,command,signal;const sdk={BedrockRuntimeClient:class{async send(cmd,opts){command=cmd.input;signal=opts.abortSignal;return response;}},ConverseCommand:class{constructor(input){this.input=input;}}};
  const service=load('src/services/ai/fase2Interpreter.ts',{'@aws-sdk/client-bedrock-runtime':sdk});
  const qs=flow.catalogoFase2(sections,{}).filter(q=>['s05_dx_metabolicas','s34_polineuropatia'].includes(q.id));
  const valores=qs.map(q=>({id:q.id,texto:'¿Con qué frecuencia te ocurre cada situación?'}));
  const set=data=>response={stopReason:'end_turn',output:{message:{content:[{text:JSON.stringify(data)}]}}};set({preguntas:valores});
  assert.equal((await service.redactarPreguntasFase2(qs,{})).length,2);assert(signal);assert(command.system[0].text.includes('No selecciones, omitas, añadas ni unas preguntas'));
  for(const data of [{preguntas:[]},{preguntas:valores.slice().reverse()},{preguntas:[{...valores[0],id:'inventado'},valores[1]]},{preguntas:[{...valores[0],options:[]},valores[1]]},{preguntas:valores,accion:'generar_s37'},{preguntas:[{...valores[0],texto:'Título técnico'},valores[1]]}]){
    set(data);await assert.rejects(service.redactarPreguntasFase2(qs,{}));
  }
  set({preguntas:valores});response.stopReason='max_tokens';await assert.rejects(service.redactarPreguntasFase2(qs,{}));
  response.stopReason='end_turn';response.output.message.content[0].text='{';await assert.rejects(service.redactarPreguntasFase2(qs,{}));
});


test('el Agent recibe discapacidad y exposición con descripciones canónicas, sin códigos ni metadatos RDA',async()=>{
  const doc=harness().doc;const fecha='2026-10-18T12:00:00Z';
  Object.assign(doc.respuestas,{rda_discapacidad:{valor:'03',etiqueta:'Etiqueta manipulada',respondidoEn:fecha,requestId:'no-enviar'},
    rda_factores_riesgo:{valor:['05','01'],etiqueta:'No usar ejemplos como hechos',respondidoEn:fecha},
    rda_factor_detalle_01:{valor:'Manipulo productos de limpieza',respondidoEn:fecha},rda_factor_detalle_05:{valor:'Contacto con material biológico',respondidoEn:fecha},
    rda_factor_detalle_02:{valor:'Detalle no seleccionado',respondidoEn:fecha}});
  const h=harness({doc,decisions:[informe]});assert.equal((await h.send()).statusCode,200);
  const c=JSON.parse(h.agentInputs[0].resumenRespuestas);assert.equal(c.discapacidadDeclarada,'Discapacidad auditiva');
  assert.deepEqual(c.exposicionDeclarada,{estado:'Factores declarados por el paciente',factores:[{tipo:'Químico',descripcion:'Manipulo productos de limpieza'},{tipo:'Biológicos',descripcion:'Contacto con material biológico'}]});
  assert(!Object.keys(c).some(k=>k.startsWith('rda_')));const rda=JSON.stringify({discapacidad:c.discapacidadDeclarada,exposicion:c.exposicionDeclarada});
  for(const excluido of ['codigo','01','03','05','requestId','respondidoEn','no-enviar','Etiqueta manipulada','Detalle no seleccionado','Por ejemplo'])assert(!rda.includes(excluido),excluido);
  assert.equal(h.last.fase2Estado,'resumen');
});
test('Sin discapacidad y No tengo certeza se envían como declaraciones, sin convertir incertidumbre en ausencia de exposición',()=>{
  const c=flow.contextoClinicoFase2(harness().doc.respuestas);assert.equal(c.discapacidadDeclarada,'Sin discapacidad');assert.deepEqual(clone(c.exposicionDeclarada),{estado:'No tengo certeza'});
  const vacio=flow.contextoClinicoFase2({rda_discapacidad:{valor:'99',respondidoEn:'2026-10-18T12:00:00Z'},rda_factores_riesgo:{valor:['01','sin_certeza'],respondidoEn:'2026-10-18T12:00:00Z'}});
  assert.equal(vacio.discapacidadDeclarada,undefined);assert.equal(vacio.exposicionDeclarada,undefined);
});
test('RDA nuevo cancela la preparación antigua sin esperar su respuesta; la nueva usa las descripciones y la tardía no sobrescribe',async()=>{
  let resolver;const antigua=new Promise(r=>{resolver=r;});
  const h=harness({discapacidadPendiente:true,factoresPendientes:true,agent:(_i,n)=>n===1?antigua:seleccionar('s11_nivel_estres')});const pendiente=h.send({accion:'preparar'});
  while(!h.agentCalls)await new Promise(r=>setTimeout(r,1));
  await h.rda('POST',{questionId:'rda_discapacidad',valorRespuesta:'02'});await h.rda('POST',{questionId:'rda_factores_riesgo',valorRespuesta:['01']});
  const final=await h.rda('POST',{questionId:'rda_factor_detalle_01',valorRespuesta:'Uso solventes'});assert.equal(final.statusCode,200);assert(final.body.data.preparacionRDA);assert.equal(h.agentOptions[0].abortSignal.aborted,true);
  const version=final.body.data.preparacionRDA.version;const recuperar=await h.rda();assert.equal(recuperar.body.data.preparacionRDA.version,version,'recuperar respuesta perdida no invalida otra vez');
  assert.equal((await h.send({accion:'preparar',version})).statusCode,200);assert.equal(h.agentCalls,2,'la segunda consulta comienza con la primera aún pendiente');
  const datos=JSON.parse(h.agentInputs[1].resumenRespuestas);assert.equal(datos.discapacidadDeclarada,'Discapacidad visual');assert.equal(datos.exposicionDeclarada.factores[0].descripcion,'Uso solventes');
  assert.equal((await h.send({accion:'continuar'})).statusCode,200);const guardado=h.doc;
  resolver(informe);assert.equal((await pendiente).statusCode,409);assert.deepEqual(h.doc,guardado);assert.equal(h.agentCalls,2);
});
test('un informe preparado antes del RDA se descarta antes de mostrarlo y se decide con el contexto completo',async()=>{
  const h=harness({discapacidadPendiente:true,decisions:[informe,seleccionar('s11_nivel_estres')]});await h.send({accion:'preparar'});assert.equal(h.doc.fase2.estado,'resumen');
  const r=await h.rda('POST',{questionId:'rda_discapacidad',valorRespuesta:'04'});assert(r.body.data.preparacionRDA);assert.equal(h.doc.analisisFisiologicoIA,undefined);
  await h.send({accion:'preparar',version:r.body.data.preparacionRDA.version});assert.equal((await h.send({accion:'continuar'})).statusCode,200);
  assert.equal(h.last.fase2Estado,'preguntando');assert.equal(JSON.parse(h.agentInputs[1].resumenRespuestas).discapacidadDeclarada,'Discapacidad intelectual');assert.equal(h.agentCalls,2);
});

function agenteSintetico(send) {
  const llamadas = []; let config;
  const sdk = {
    BedrockAgentRuntimeClient: class {
      constructor(c) { config = c; }
      async send(cmd, opts) { llamadas.push({ input: cmd.input, opts }); return send(llamadas.length, opts); }
    },
    InvokeAgentCommand: class { constructor(input) { this.input = input; } },
  };
  const agente = load('src/services/ai/anamnesisAgentService.ts', {
    '@aws-sdk/client-bedrock-agent-runtime': sdk, '../../utils/errors': errors,
  });
  return { ...agente, llamadas, config };
}
function respuestaAgent(texto = JSON.stringify(informe)) {
  return { completion: (async function*() { yield { chunk: { bytes: new TextEncoder().encode(texto) } }; })() };
}
function errorAWS(name = 'InternalServerException', status = 500) {
  return Object.assign(new Error('Fallo AWS sintético'), { name, $metadata: { httpStatusCode: status } });
}
test('Bedrock recupera el InternalServerException reportado y conserva sesión y contexto en todos los intentos', async () => {
  const a = agenteSintetico(n => { if (n < 3) throw errorAWS(); return respuestaAgent(); });
  const prompt = 'Contexto clínico sintético completo '.repeat(1400);
  assert.equal((await a.invokeAnamnesisAgent(prompt, { sessionId: 'fase2-sintetica-g4' })).accion, 'generar_s37');
  assert.equal(a.llamadas.length, 3); assert.equal(a.config.maxAttempts, 1);
  for (const c of a.llamadas) { assert.equal(c.input.inputText, prompt); assert.equal(c.input.sessionId, 'fase2-sintetica-g4'); }
});
test('Bedrock descarta texto parcial cuando falla el stream y reintenta también excepciones como eventos', async () => {
  const a = agenteSintetico(n => n === 3 ? respuestaAgent() : {
    completion: (async function*() {
      yield { chunk: { bytes: new TextEncoder().encode('{"accion":"incorrecta",') } };
      if (n === 1) throw errorAWS();
      yield { internalServerException: { message: 'Modelo temporalmente no disponible' } };
    })(),
  });
  assert.equal((await a.invokeAnamnesisAgent('Prueba de stream')).accion, 'generar_s37');
  assert.equal(a.llamadas.length, 3);
});
test('Bedrock limita intentos y devuelve un 503 operativo si sigue sin estar disponible', async () => {
  const original = Object.assign(errorAWS(), { reason: 'BEDROCK_MODEL_INVOCATION_SERVICE_UNAVAILABLE' });
  original.$metadata.requestId = 'solicitud-sintetica';
  const a = agenteSintetico(() => { throw original; });
  await assert.rejects(a.invokeAnamnesisAgent('Prueba de agotamiento'), e =>
    e instanceof errors.AppError && e.statusCode === 503 && /reintentar/.test(e.message)
    && e.name === 'AnamnesisAgentUnavailableError' && e.cause === original);
  assert.equal(a.llamadas.length, 3);
});
test('Bedrock reintenta únicamente errores transitorios de servicio, saturación o modelo no preparado', async () => {
  for (const [name, status] of [['BadGatewayException',502],['ThrottlingException',429],['ServiceUnavailableException',503],['ModelNotReadyException',424]]) {
    const a = agenteSintetico(n => { if (n === 1) throw errorAWS(name,status); return respuestaAgent(); });
    await a.invokeAnamnesisAgent('Prueba sintética'); assert.equal(a.llamadas.length, 2, name);
  }
  for (const [name, status] of [['AccessDeniedException',403],['ValidationException',400],['ResourceNotFoundException',404],['DependencyFailedException',424],['ServiceQuotaExceededException',400]]) {
    const original = errorAWS(name,status); const a = agenteSintetico(() => { throw original; });
    await assert.rejects(a.invokeAnamnesisAgent('Prueba sintética'), e => e === original); assert.equal(a.llamadas.length,1,name);
  }
});
test('cancelar durante la espera de reintento impide otra llamada y conserva la cancelación', async () => {
  const c = new AbortController(); const a = agenteSintetico(() => { setTimeout(() => c.abort(),20); throw errorAWS(); });
  await assert.rejects(a.invokeAnamnesisAgent('Prueba cancelada',{abortSignal:c.signal}), e => e.name === 'AbortError');
  assert.equal(a.llamadas.length,1);
  await assert.rejects(a.invokeAnamnesisAgent('Cancelada antes del envío',{abortSignal:c.signal})); assert.equal(a.llamadas.length,1);
});
test('el plazo es global y se interrumpe incluso durante la espera entre intentos', async () => {
  const a = agenteSintetico(() => { throw errorAWS(); }); const inicio = Date.now();
  await assert.rejects(a.invokeAnamnesisAgent('Prueba de plazo',{timeoutMs:30}),e => e.statusCode === 503 && /tardó/.test(e.message));
  assert.equal(a.llamadas.length,1); assert(Date.now()-inicio < 1000);
});
test('una respuesta JSON inválida no provoca más invocaciones clínicas', async () => {
  const a = agenteSintetico(() => respuestaAgent('{"accion":"inventada"}'));
  await assert.rejects(a.invokeAnamnesisAgent('Prueba de validación')); assert.equal(a.llamadas.length,1);
});
test('un 503 real del servicio libera el turno y permite reintentarlo sin perder ni duplicar respuestas', async () => {
  let disponible = false;
  const a = agenteSintetico(() => { if (!disponible) throw errorAWS(); return respuestaAgent(); });
  const h = harness({ agent: (_input,n,opts) => n === 1 ? seleccionar('s11_nivel_estres') : a.invokeAnamnesisAgent('Contexto sintético',opts) });
  await h.send(); await h.send({mensajeUsuario:'4',valorRespuesta:4});
  const antes = h.doc; const fallido = await h.send({accion:'continuar'});
  assert.equal(fallido.statusCode,503); assert.match(fallido.body.message,/reintentar/);
  assert.equal(h.doc.fase2Operacion,undefined); assert.deepEqual(h.doc.respuestas,antes.respuestas);
  assert.deepEqual(h.doc.fase2.historial,antes.fase2.historial);
  disponible = true; const ok = await h.send(fallido.request); assert.equal(ok.statusCode,200);
  assert.equal(h.doc.respuestas.s11_nivel_estres,4);
  const cantidad = h.doc.fase2.historial.length; const repetido = await h.send(fallido.request);
  assert.equal(repetido.statusCode,200); assert.equal(h.doc.fase2.historial.length,cantidad); assert.equal(h.agentCalls,3);
});

test('el error del stream conserva reason y el requestId HTTP aunque el evento no tenga metadata', async () => {
  const a = agenteSintetico(() => ({
    $metadata: { requestId: 'request-del-stream', httpStatusCode: 200 },
    completion: (async function*() { yield { internalServerException: {
      message: 'Servicio del modelo no disponible', reason: 'BEDROCK_MODEL_INVOCATION_SERVICE_UNAVAILABLE',
    } }; })(),
  }));
  await assert.rejects(a.invokeAnamnesisAgent('Caso sintético'), e => e.statusCode === 503
    && e.cause.name === 'InternalServerException'
    && e.cause.reason === 'BEDROCK_MODEL_INVOCATION_SERVICE_UNAVAILABLE'
    && e.cause.$metadata.requestId === 'request-del-stream');
});

test('el pronóstico se genera tras confirmar con todas las respuestas y mantiene el informe de anamnesis',async()=>{
  let entrada;const h=harness({decisions:[seleccionar('s11_nivel_estres'),informe],radar:async input=>{
    entrada=clone(input);return{textoAnalisis:'Pronóstico sintético',perfilRadar:{ejes:['Sueño'],series:[{nombre:'Actual',puntajes:[2]}]}};
  }});
  await h.send();await h.send({mensajeUsuario:'3',valorRespuesta:3});await h.send({accion:'continuar'});
  const sinConfirmar=await h.radar({generacion:0});assert.equal(sinConfirmar.statusCode,409);assert.equal(entrada,undefined);
  await h.send({accion:'confirmar',mensajeUsuario:'Sí'});const antes=h.doc.analisisFisiologicoIA;
  assert.equal((await h.radar({generacion:0})).statusCode,200);
  assert.equal(entrada.respuestasS01.s01_sexo,h.doc.respuestas.s01_sexo);
  assert.equal(entrada.respuestasS03.s03_sintoma_principal,h.doc.respuestas.s03_sintoma_principal);
  assert.equal(entrada.respuestasCompletas.s11_nivel_estres,3);
  assert.equal(h.doc.perfilRadar.textoAnalisis,'Pronóstico sintético');assert.deepEqual(h.doc.analisisFisiologicoIA,antes);
});
test('un pronóstico antiguo o de otro usuario no se inicia ni se guarda después de reiniciar fase 2',async()=>{
  let resolver,iniciado,veces=0;const pendiente=new Promise(r=>{resolver=r;});const inicio=new Promise(r=>{iniciado=r;});
  const h=harness({decisions:[informe],radar:async()=>{veces++;iniciado();return pendiente;}});
  await h.send();await h.send({accion:'confirmar',mensajeUsuario:'Sí'});
  const generando=h.radar({generacion:0});await inicio;await h.reset();
  resolver({textoAnalisis:'Viejo',perfilRadar:{ejes:['Viejo']}});await generando;
  assert.equal(h.doc.perfilRadar,undefined);
  assert.equal((await h.radar({generacion:0})).statusCode,409);assert.equal(veces,1);
  assert.equal((await h.radar({generacion:1},'otro-paciente')).statusCode,404);assert.equal(veces,1);
});
test('la ruta anterior de radar sigue admitiendo la fase 1 sin generar una segunda fase',async()=>{
  const h=harness();const antes=h.doc.respuestas;assert.equal((await h.radar()).statusCode,200);
  assert(h.doc.perfilRadar);assert.equal(h.doc.fase2,undefined);assert.deepEqual(h.doc.respuestas,antes);
});

test('fase 2 conserva las opciones respondidas en selección única, reintentos y reanudación',async()=>{
  const h=harness({decisions:[seleccionar('s06_toma_medicamentos','s11_nivel_estres')]});await h.send();
  const invalid=await h.send({mensajeUsuario:'Inventada',valorRespuesta:'inventada'});assert.equal(invalid.statusCode,400);
  assert(!h.doc.fase2.historial.some(m=>m.opcionesRespondidas));
  const ok=await h.send({mensajeUsuario:'No',valorRespuesta:'no'});const snapshot=ok.body.data.opcionesRespuestaAnterior;
  assert.deepEqual(snapshot.seleccionadas,['No']);assert(snapshot.opciones.length>1);
  const history=h.doc.fase2.historial;await h.send(ok.request);assert.deepEqual(h.doc.fase2.historial,history);
  const reload=harness({doc:h.doc});const resumed=await reload.send({accion:'reanudar'});
  assert.deepEqual(resumed.body.data.historial.find(m=>m.opcionesRespondidas).opcionesRespondidas,snapshot);assert.equal(reload.agentCalls,0);
});
test('fase 2 conserva todas las opciones del checkbox y solo marca la selección válida',async()=>{
  const h=harness({decisions:[seleccionar('s06_digestivos','s13_hora_acostarse')]});await h.send();
  const q=h.doc.fase2.preguntas[0];const elegidas=q.options.filter(o=>o.value!=='ninguno').slice(0,2);
  const ok=await h.send({mensajeUsuario:elegidas.map(o=>o.label).join(', '),valorRespuesta:elegidas.map(o=>o.value)});
  assert.equal(ok.statusCode,200);assert.deepEqual(ok.body.data.opcionesRespuestaAnterior.seleccionadas,elegidas.map(o=>o.label));
  assert.deepEqual(ok.body.data.opcionesRespuestaAnterior.opciones,q.options.map(o=>o.label));
  assert.deepEqual(h.doc.fase2.historial[0].opcionesRespondidas,ok.body.data.opcionesRespuestaAnterior);
});

}
