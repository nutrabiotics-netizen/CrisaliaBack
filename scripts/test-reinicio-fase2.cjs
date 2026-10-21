const test=require('node:test');
const assert=require('node:assert/strict');
const {harness,seleccionar,informe,load,resetFlow}=require('./test-fase2.cjs');
function fixture(extra={}) {
  const d=harness().doc;
  d.fase1={confirmada:true,version:40,estado:'resumen',preguntaId:null,preguntas:[],turnos:[{id:'fase1-cache'}],historial:[{rol:'ia',texto:'Pregunta de fase 1'},{rol:'usuario',texto:'Respuesta original'}]};
  Object.assign(d.respuestas,{s01_edad:35,s01_ocupacion_ciuo:{codigo:'2512',nombre:'Desarrolladora'},s03_objetivo_a:'Mi objetivo',zonasDolor:['espalda'],
    causas:[{titulo:'Causa de fase 1'}],cierreFase1:{resumen:['Resumen original']},mensajeFinal:'Confirmado',
    s02_sintoma:3,s11_nivel_estres:8,s36_otro:2,examenes_paraclinicos:[{archivo:'Archivo anterior'}],aclaraciones_fase2:[{texto:'Aclaración anterior'}],relatoAlertaFase2:'Relato anterior'});
  d.fase2={version:12,estado:'confirmada',preguntaId:null,preguntas:[],ronda:3,respondidas:['s11_nivel_estres'],historial:[{rol:'usuario',texto:'Respuesta fase 2'}],turnos:[{id:'turno-viejo'}],decision:informe,progreso:100};
  Object.assign(d,{estado:'completado',progreso:100,analisisIA:'Informe anterior',historiaClinica:{motivo:'Anterior'},analisisFisiologicoIA:[{nombre:'Anterior'}],
    recomendacionAutomatica:{llamadoAccion:'Anterior'},alertaMedica:{motivo:'Anterior'},objetivos:['Anterior'],observacionesIA:['Anterior'],perfilRadar:{json:{anterior:true}}},extra);
  return d;
}
test('reiniciar limpia fase 2 y devuelve a RDA y exámenes; fase 1 conserva respuestas, resumen, historial y versión',async()=>{
  const doc=fixture();const h=harness({doc});const r=await h.reset();assert.equal(r.statusCode,200);const d=h.doc;
  assert.deepEqual(d.fase1,doc.fase1);assert.equal(d.estado,'en_proceso');assert.equal(d.progreso,10);assert.equal(d.fase2Generacion,1);
  for(const k of ['fase2','fase2Operacion','analisisIA','historiaClinica','analisisFisiologicoIA','recomendacionAutomatica','alertaMedica','objetivos','observacionesIA','perfilRadar'])assert.equal(d[k],undefined,k);
  for(const k of ['s01_edad','s01_ocupacion_ciuo','s03_sintoma_principal','s03_objetivo_a','zonasDolor','causas','cierreFase1','mensajeFinal'])assert.deepEqual(d.respuestas[k],doc.respuestas[k],k);
  assert.deepEqual(d.respuestas.historialChat,doc.fase1.historial);
  for(const k of ['s02_sintoma','s11_nivel_estres','s36_otro','examenes_paraclinicos','aclaraciones_fase2','relatoAlertaFase2','rda_oposicion_donacion'])assert.equal(d.respuestas[k],undefined,k);
  assert.equal((await h.rda()).body.data.completo,false);assert.equal(h.agentCalls,0);
});
test('limpia solo oposición RDA de este intento en el borrador y permite guardar una respuesta nueva',async()=>{
  const doc=fixture();const rdaRecord={_id:'b'.repeat(24),pacienteId:doc.pacienteId,tipoRegistro:'inicial',estado:'borrador',activo:true,
    fuenteFase1:{interrogatorioId:doc._id},seccionCuenta:{primerNombre:'Prueba'},seccionInterrogatorioInicial:{indicadorAlergia:false},
    seccionInterrogatorioPrincipal:{respuestaOposicionOrganos:'no_escrita',oposicionDonarOrganos:false,fechaRespuestaOposicionOrganos:'2026-10-17',interrogatorioOposicionOrganosId:doc._id,discapacidades:[{codigo:'01'}]}};
  const h=harness({doc,rdaRecord});await h.reset();
  assert.deepEqual(h.rdaRecord.seccionCuenta,rdaRecord.seccionCuenta);assert.deepEqual(h.rdaRecord.seccionInterrogatorioInicial,rdaRecord.seccionInterrogatorioInicial);
  assert.deepEqual(h.rdaRecord.seccionInterrogatorioPrincipal,{discapacidades:[{codigo:'01'}]});
  await h.rda('POST',{questionId:'rda_oposicion_donacion',valorRespuesta:'si_escrita'});
  assert.equal(h.rdaRecord.seccionInterrogatorioPrincipal.oposicionOrganos[0].oposicion,true);assert.match(h.rdaRecord.seccionInterrogatorioPrincipal.oposicionOrganos[0].fecha,/^\d{4}-\d{2}-\d{2}$/);
  await h.send({accion:'preparar'});assert.equal(h.last.examenesPendientes,true);assert.equal(h.last.questionId,'s11_nivel_estres');
  assert(!h.agentInputs[0].resumenRespuestas.includes('Archivo anterior'));assert(!h.agentInputs[0].resumenRespuestas.includes('s11_nivel_estres'));
});
test('un reintento por respuesta perdida no vuelve a borrar respuestas nuevas ni incrementa dos veces',async()=>{
  const h=harness({doc:fixture()});const r=await h.reset();await h.rda('POST',{questionId:'rda_oposicion_donacion',valorRespuesta:'sin_certeza'});
  const antes=h.doc;assert.equal((await h.reset(r.request)).statusCode,200);assert.deepEqual(h.doc,antes);
});
test('dos reinicios simultáneos no se ejecutan dos veces',async()=>{
  const h=harness({doc:fixture()});const r=await Promise.all([h.reset({requestId:'uno',generacion:0}),h.reset({requestId:'dos',generacion:0})]);
  assert.deepEqual(r.map(x=>x.statusCode).sort(),[200,409]);assert.equal(h.doc.fase2Generacion,1);
});
test('solicitudes de una pestaña anterior no guardan preguntas, RDA ni OCR después de reiniciar',async()=>{
  const h=harness({doc:fixture()});await h.reset();
  assert.equal((await h.send({accion:'preparar',generacion:0})).statusCode,409);
  assert.equal((await h.rda('POST',{questionId:'rda_oposicion_donacion',valorRespuesta:'si_escrita',generacion:0})).statusCode,409);
  assert.equal((await h.ocr({generacion:0,paraclinicos:[{nombre:'Viejo',ocrValores:[{nombre:'Dato',valor:'1'}]}]})).statusCode,409);
  assert.equal((await h.reset({generacion:0,requestId:'viejo'})).statusCode,409);assert.equal(h.agentCalls,0);assert.equal(h.doc.respuestas.rda_oposicion_donacion,undefined);
});
test('una preparación tardía no pisa el intento nuevo; el Agent recibe otra sesión al volver a empezar',async()=>{
  let resolver;const espera=new Promise(r=>{resolver=r;});const h=harness({agent:(_input,n)=>n===1?espera:seleccionar('s11_nivel_estres')});
  const vieja=h.send({accion:'preparar'});while(!h.agentCalls)await new Promise(r=>setTimeout(r,1));
  assert.equal((await h.reset()).statusCode,200);await h.rda('POST',{questionId:'rda_oposicion_donacion',valorRespuesta:'no_escrita'});
  await h.send({accion:'preparar',version:undefined,questionId:null});const d=h.doc;
  resolver(seleccionar('s13_horas_sueno'));assert.equal((await vieja).statusCode,409);assert.deepEqual(h.doc,d);assert.notEqual(h.agentOptions[0].sessionId,h.agentOptions[1].sessionId);
});
test('fallos al limpiar RDA o finalizar se recuperan sin perder fase 1 ni iniciar un intento extra',async()=>{
  for(const fallo of ['rda','interrogatorio']){
    const doc=fixture();const h=harness({doc});fallo==='rda'?h.failRDASync(true):h.failReset(true);
    const r=await h.reset();assert.notEqual(r.statusCode,200);assert.equal(h.doc.fase2Reinicio.pendiente,true);assert.deepEqual(h.doc.fase1,doc.fase1);
    assert.equal((await h.send({accion:'preparar'})).statusCode,409);assert.equal((await h.rda()).statusCode,409);
    h.failRDASync(false);h.failReset(false);assert.equal((await h.reset(r.request)).statusCode,200);assert.equal(h.doc.fase2Generacion,1);assert.equal(h.doc.fase2Reinicio.pendiente,false);
  }
});
test('reinicio disponible solo fuera de producción, para el dueño y con fase 1 confirmada',async()=>{
  const h=harness({doc:fixture()});assert.equal((await h.reset({},null)).statusCode,401);assert.equal((await h.reset({},'otro')).statusCode,404);
  const doc=fixture();doc.fase1.confirmada=false;assert.equal((await harness({doc}).reset()).statusCode,409);
  const produccion=harness({doc:fixture(),env:{NODE_ENV:'production'}});const antes=produccion.doc;assert.equal((await produccion.reset()).statusCode,403);assert.deepEqual(produccion.doc,antes);
});
test('registros de consulta y transmitidos no se modifican ni permiten reiniciar la entrevista vinculada',async()=>{
  for(const extra of [{estado:'transmitido'},{estado:'listo'},{tipoRegistro:'consulta'}]){
    const doc=fixture();const rdaRecord={_id:'b'.repeat(24),pacienteId:doc.pacienteId,tipoRegistro:'inicial',estado:'borrador',fuenteFase1:{interrogatorioId:doc._id},...extra};
    const h=harness({doc,rdaRecord});assert.equal((await h.reset()).statusCode,409);assert.deepEqual(h.doc,doc);assert.deepEqual(h.rdaRecord,rdaRecord);
  }
});
test('una transmisión concurrente impide limpiar el RDA y conserva las respuestas de la entrevista',async()=>{
  const doc=fixture();const h=harness({doc,beforeRDAUpdate:r=>{r.estado='transmitido';}});assert.equal((await h.reset()).statusCode,409);
  assert.equal(h.rdaRecord.estado,'transmitido');assert.deepEqual(h.doc.respuestas,doc.respuestas);assert.deepEqual(h.doc.fase1,doc.fase1);
});
test('un análisis de fondo del intento anterior no reaparece después del reinicio',async()=>{
  const h=harness({doc:fixture()});let resolver,terminar;const espera=new Promise(r=>{resolver=r;});const terminado=new Promise(r=>{terminar=r;});
  const original=h.model.findOneAndUpdate;h.model.findOneAndUpdate=(q,u,...args)=>{
    const resultado=original(q,u,...args);if(!u.$set?.analisisIA)return resultado;
    return{then(resolve,reject){return resultado.then(x=>{terminar();resolve(x);},reject);}};
  };
  const service=load('src/services/paciente/interrogatorio/interrogatorioService.ts',{
    '../../../models/Interrogatorio':h.model,'../../openai/openaiService':{analizarInterrogatorio:()=>espera},'../../ai/AIService':{},'../../notifications/medicoNotificacionService':{},'../reinicioFase2Flow':resetFlow,
  }).default;
  await service.completarInterrogatorio(h.doc._id,h.doc.pacienteId);await h.reset();resolver({analisisIA:'Análisis viejo',objetivos:['Viejo']});await terminado;
  assert.equal(h.doc.analisisIA,undefined);assert.equal(h.doc.fase2Generacion,1);assert.equal(h.doc.estado,'en_proceso');
});

test('reiniciar conserva entradas de otros interrogatorios en el array',async()=>{
  const doc=fixture();const otro={fecha:'2026-10-01',interrogatorioId:'e'.repeat(24),respuesta:'si_escrita',oposicion:true};
  const rdaRecord={_id:'b'.repeat(24),pacienteId:doc.pacienteId,tipoRegistro:'inicial',estado:'borrador',activo:true,fuenteFase1:{interrogatorioId:doc._id},
    seccionInterrogatorioPrincipal:{oposicionOrganos:[otro,{fecha:'2026-10-18',interrogatorioId:doc._id,respuesta:'no_escrita',oposicion:false}]}};
  const h=harness({doc,rdaRecord});assert.equal((await h.reset()).statusCode,200);
  assert.deepEqual(h.rdaRecord.seccionInterrogatorioPrincipal.oposicionOrganos,[otro]);
  assert.equal((await h.rda('POST',{questionId:'rda_oposicion_donacion',valorRespuesta:'sin_certeza'})).statusCode,200);
  assert.equal(h.rdaRecord.seccionInterrogatorioPrincipal.oposicionOrganos.length,2);
});

test('reinicio borra solo discapacidad importada desde este interrogatorio y vuelve a preguntarla',async()=>{
  const doc=fixture();doc.respuestas.rda_discapacidad={valor:'03',etiqueta:'Discapacidad auditiva',respondidoEn:'2026-10-18T12:00:00Z'};
  for(const propietario of [doc._id,'e'.repeat(24)]){
    const rdaRecord={_id:'b'.repeat(24),pacienteId:doc.pacienteId,tipoRegistro:'inicial',estado:'borrador',activo:true,fuenteFase1:{interrogatorioId:doc._id},
      seccionInterrogatorioPrincipal:{discapacidades:[{codigo:'03',nombre:'Discapacidad auditiva'}],interrogatorioDiscapacidadId:propietario}};
    const h=harness({doc,rdaRecord});assert.equal((await h.reset()).statusCode,200);assert.equal(h.doc.respuestas.rda_discapacidad,undefined);
    if(propietario===doc._id)assert.equal(h.rdaRecord.seccionInterrogatorioPrincipal.discapacidades,undefined);
    else assert.deepEqual(h.rdaRecord.seccionInterrogatorioPrincipal.discapacidades,rdaRecord.seccionInterrogatorioPrincipal.discapacidades);
    const r=await h.rda('POST',{questionId:'rda_oposicion_donacion',valorRespuesta:'no_escrita'});assert.equal(r.body.data.pregunta.id,'rda_discapacidad');
    await h.rda('POST',{questionId:'rda_discapacidad',valorRespuesta:'08'});
    assert.equal(h.rdaRecord.seccionInterrogatorioPrincipal.discapacidades[0].codigo,propietario===doc._id?'08':'03');
  }
});

test('reinicio elimina selección y detalles de factores del intento y conserva datos RDA de otros orígenes',async()=>{
  const doc=fixture();doc.respuestas.rda_factores_riesgo={valor:['01'],respondidoEn:'2026-10-18T12:00:00Z'};doc.respuestas.rda_factor_detalle_01={valor:'Limpieza',respondidoEn:'2026-10-18T12:00:00Z'};
  for(const origen of [doc._id,'e'.repeat(24)]){
    const registro={_id:'b'.repeat(24),pacienteId:doc.pacienteId,tipoRegistro:'inicial',estado:'borrador',activo:true,fuenteFase1:{interrogatorioId:doc._id},
      seccionInterrogatorioPrincipal:{factoresRiesgo:[{codigo:'01',tipo:'Químico',nombre:'Limpieza'}],estadoFactoresRiesgo:'registrados',interrogatorioFactoresRiesgoId:origen}};
    const h=harness({doc,rdaRecord:registro});assert.equal((await h.reset()).statusCode,200);assert.equal(h.doc.respuestas.rda_factores_riesgo,undefined);assert.equal(h.doc.respuestas.rda_factor_detalle_01,undefined);
    if(origen===doc._id)assert.equal(h.rdaRecord.seccionInterrogatorioPrincipal.factoresRiesgo,undefined);
    else assert.deepEqual(h.rdaRecord.seccionInterrogatorioPrincipal.factoresRiesgo,registro.seccionInterrogatorioPrincipal.factoresRiesgo);
    await h.rda('POST',{questionId:'rda_oposicion_donacion',valorRespuesta:'no_escrita'});const r=await h.rda('POST',{questionId:'rda_discapacidad',valorRespuesta:'08'});assert.equal(r.body.data.pregunta.id,'rda_factores_riesgo');
  }
});
