const test=require('node:test');
const assert=require('node:assert/strict');
const {harness,rdaFlow,load}=require('./test-fase2.cjs');
const questionId='rda_oposicion_donacion';
const body=valorRespuesta=>({questionId,valorRespuesta,requestId:'respuesta-rda-sintetica'});

test('pregunta fija single con el texto y las cuatro opciones, independiente de IA',async()=>{
  const h=harness({rdaPendiente:true});const r=await h.rda();
  assert.equal(r.body.data.completo,false);const p=r.body.data.pregunta;
  assert.equal(p.type,'single');assert.equal(p.text,'¿Has dejado por escrito tu decisión de no donar órganos y tejidos después de fallecer?');
  assert(p.description.includes('Ministerio de Salud'));
  assert.deepEqual(p.options.map(o=>o.label),['Sí, lo he dejado por escrito.','No, no lo he dejado por escrito.','No tengo certeza','Prefiero no responder']);
  assert.equal(h.agentCalls,0);assert.equal(h.interpretCalls,0);
});
for(const [valor,booleano] of [['si_escrita',true],['no_escrita',false],['sin_certeza',null],['prefiero_no_responder',null]]) {
  test(`guarda ${valor} en entrevista y RDA sin inventar fecha del documento`,async()=>{
    const h=harness({rdaPendiente:true});const r=await h.rda('POST',body(valor));
    assert.equal(r.statusCode,200);assert.equal(r.body.data.guardado,true);assert.equal(r.body.data.completo,true);
    assert.equal(h.doc.respuestas[questionId].valor,valor);
    const ip=h.rdaRecord.seccionInterrogatorioPrincipal;
    assert.equal(ip.oposicionOrganos[0].respuesta,valor);assert.equal(ip.oposicionOrganos[0].oposicion,booleano);
    assert.match(ip.oposicionOrganos[0].fecha,/^\d{4}-\d{2}-\d{2}$/);assert.equal(ip.fechaOposicionOrganos,undefined);
    assert.equal(h.doc.respuestas[questionId].fechaRespuesta,ip.oposicionOrganos[0].fecha);
    assert.equal(ip.oposicionOrganos[0].interrogatorioId,h.doc._id);
    const reabrir=await h.rda();assert.equal(reabrir.body.data.pregunta,null);assert.equal(reabrir.body.data.historial.length,6);
    assert.equal(h.agentCalls,0);assert.equal(h.interpretCalls,0);
  });
}
test('no permite avanzar a las preguntas clínicas sin RDA, pero el Agent se prepara en paralelo',async()=>{
  const h=harness({rdaPendiente:true});await h.send({accion:'preparar'});assert.equal(h.agentCalls,1);
  assert.equal((await h.send({accion:'continuar'})).statusCode,409);
  await h.rda('POST',body('prefiero_no_responder'));
  await h.send({accion:'continuar'});assert.equal(h.last.questionId,'s11_nivel_estres');assert.equal(h.agentCalls,1);
});
test('responder mientras la preparación está en curso no cambia su versión ni pierde datos RDA',async()=>{
  let resolver;const espera=new Promise(r=>{resolver=r;});
  const h=harness({rdaPendiente:true,agent:()=>espera});const pendiente=h.send({accion:'preparar'});
  while(!h.agentCalls)await new Promise(r=>setTimeout(r,1));
  assert.equal((await h.rda('POST',body('sin_certeza'))).statusCode,200);
  resolver({accion:'entrevistar',secciones:['s11'],id_pregunta:['s11_nivel_estres'],progreso:35});await pendiente;
  assert.equal(h.doc.respuestas[questionId].valor,'sin_certeza');assert.equal(h.doc.fase2.version,1);
});
test('reintento no duplica historial y una respuesta concurrente diferente no sobrescribe',async()=>{
  const h=harness({rdaPendiente:true});await h.rda('POST',body('no_escrita'));const original=h.doc.respuestas[questionId];await h.rda('POST',body('no_escrita'));
  assert.deepEqual(h.doc.respuestas[questionId],original,'reintentar conserva la fecha original');
  assert.equal(h.doc.respuestas.historialChat.length,2);assert.equal((await h.rda('POST',body('si_escrita'))).statusCode,409);
  assert.equal(h.doc.respuestas[questionId].valor,'no_escrita');
});
test('un informe inmediato del Agent no permite omitir RDA ni exige volver a llamar al Agent al responderlo',async()=>{
  const {informe}=require('./test-fase2.cjs');const h=harness({rdaPendiente:true,decisions:[informe]});
  await h.send({accion:'preparar'});assert.equal((await h.send({accion:'confirmar',mensajeUsuario:'Sí'})).statusCode,409);
  await h.rda('POST',body('no_escrita'));await h.send({accion:'continuar'});assert.equal(h.last.fase2Estado,'resumen');assert.equal(h.agentCalls,1);
});
test('fallo del RDA permite recuperar el guardado al reintentar o recargar sin repetir la pregunta',async()=>{
  const h=harness({rdaPendiente:true});h.failRDASync(true);
  assert.equal((await h.rda('POST',body('sin_certeza'))).statusCode,503);assert.equal(h.doc.respuestas[questionId].valor,'sin_certeza');
  h.failRDASync(false);const r=await h.rda();assert.equal(r.body.data.completo,true);
  assert.equal(h.rdaRecord.seccionInterrogatorioPrincipal.oposicionOrganos[0].respuesta,'sin_certeza');assert.equal(h.doc.respuestas.historialChat.length,2);
});
test('se protegen paciente, fase 1 y entrevista confirmada; no acepta campos o valores inventados',async()=>{
  const h=harness({rdaPendiente:true});assert.equal((await h.rda('GET',{},'otro-paciente')).statusCode,404);
  assert.equal((await h.rda('GET',{},null)).statusCode,401);
  for(const valor of [true,'Sí','',null,{},['si_escrita']])assert.equal((await h.rda('POST',body(valor))).statusCode,400);
  assert.equal((await h.rda('POST',{...body('si_escrita'),questionId:'s01_nombre'})).statusCode,400);
  const doc=h.doc;doc.fase1.confirmada=false;assert.equal((await harness({doc}).rda()).statusCode,409);
  doc.fase1.confirmada=true;doc.estado='completado';const completa=harness({doc});assert.equal((await completa.rda()).body.data.completo,true);
  assert.equal((await completa.rda('POST',body('si_escrita'))).statusCode,409);
});
test('un RDA transmitido, datos del médico y una transmisión concurrente permanecen intactos',async()=>{
  for(const extra of [
    {estado:'transmitido'},
    {seccionInterrogatorioPrincipal:{oposicionDonarOrganos:false,fechaOposicionOrganos:new Date('2026-10-01')}},
  ]){
    const registro={_id:'b'.repeat(24),pacienteId:'synthetic-patient',estado:'borrador',activo:true,seccionInterrogatorioPrincipal:{},...extra};
    const h=harness({rdaPendiente:true,discapacidadPendiente:true,factoresPendientes:true,rdaRecord:registro});await h.rda('POST',body('si_escrita'));assert.deepEqual(h.rdaRecord,registro);
  }
  const h=harness({rdaPendiente:true,beforeRDAUpdate:r=>{r.estado='transmitido';}});await h.rda('POST',body('si_escrita'));
  assert.deepEqual(h.rdaRecord.seccionInterrogatorioPrincipal,{});
});
test('Mongoose conserva incertidumbre y rechazo como estados distintos con booleano null',async()=>{
  const mongoose=require('mongoose');const Model=mongoose.models.RegistroRDA || load('src/models/RegistroRDA.ts',{mongoose}).default;
  for(const estado of ['sin_certeza','prefiero_no_responder']){
    const doc=new Model({pacienteId:'a'.repeat(24),tipoRegistro:'inicial',seccionInterrogatorioPrincipal:rdaFlow.proyectarOposicionRDA({[questionId]:{valor:estado,respondidoEn:'2026-10-18T12:00:00Z'}},'c'.repeat(24))});
    await doc.validate();assert.equal(doc.toObject().seccionInterrogatorioPrincipal.oposicionOrganos[0].oposicion,null);
    assert.equal(doc.toObject().seccionInterrogatorioPrincipal.oposicionOrganos[0].respuesta,estado);
  }
});
test('la fecha YYYY-MM-DD usa Colombia aunque el instante UTC ya pertenezca al día siguiente',()=>{
  assert.equal(rdaFlow.fechaRespuestaRDA('2026-10-19T02:00:00.000Z'),'2026-10-18');
  assert.equal(rdaFlow.fechaRespuestaRDA('2026-10-19T05:00:00.000Z'),'2026-10-19');
});

test('array conserva otras entrevistas, añade una sola entrada y reintentar no duplica',async()=>{
  const previo={fecha:'2026-10-01',interrogatorioId:'d'.repeat(24),respuesta:'sin_certeza',oposicion:null};
  const registro={_id:'b'.repeat(24),pacienteId:'synthetic-patient',estado:'borrador',activo:true,seccionInterrogatorioPrincipal:{oposicionOrganos:[previo]}};
  const h=harness({rdaPendiente:true,rdaRecord:registro});
  await h.rda('POST',body('no_escrita'));await h.rda('POST',body('no_escrita'));await h.rda();
  const datos=h.rdaRecord.seccionInterrogatorioPrincipal.oposicionOrganos;
  assert.equal(datos.length,2);assert.deepEqual(datos[0],previo);assert.equal(datos[1].interrogatorioId,h.doc._id);assert.equal(datos[1].oposicion,false);
});

test('respuesta antigua con origen pasa al array sin perder fecha ni alterar transmitidos',async()=>{
  const doc=harness().doc;
  const original={_id:'b'.repeat(24),pacienteId:doc.pacienteId,estado:'borrador',activo:true,seccionInterrogatorioPrincipal:{
    respuestaOposicionOrganos:'sin_certeza',oposicionDonarOrganos:null,fechaRespuestaOposicionOrganos:'2026-10-01',interrogatorioOposicionOrganosId:doc._id}};
  const h=harness({doc,rdaRecord:original});await h.rda();
  assert.deepEqual(h.rdaRecord.seccionInterrogatorioPrincipal,{oposicionOrganos:[{fecha:'2026-10-01',interrogatorioId:doc._id,respuesta:'sin_certeza',oposicion:null}],discapacidades:[{codigo:'08',nombre:'Sin discapacidad'}],interrogatorioDiscapacidadId:doc._id,factoresRiesgo:[],estadoFactoresRiesgo:'sin_certeza',interrogatorioFactoresRiesgoId:doc._id});
  await h.rda();assert.equal(h.rdaRecord.seccionInterrogatorioPrincipal.oposicionOrganos.length,1);
  const transmitido={...original,estado:'transmitido'};const t=harness({doc,rdaRecord:transmitido});await t.rda();assert.deepEqual(t.rdaRecord,transmitido);
});

const categoriasDiscapacidad=[['01','Discapacidad física'],['02','Discapacidad visual'],['03','Discapacidad auditiva'],['04','Discapacidad intelectual'],['05','Discapacidad sicosocial (mental)'],['06','Sordoceguera'],['07','Discapacidad múltiple'],['08','Sin discapacidad']];
const respuestaDiscapacidad=codigo=>({questionId:'rda_discapacidad',valorRespuesta:codigo,requestId:'discapacidad-sintetica'});
for(const [codigo,nombre] of categoriasDiscapacidad){
  test(`discapacidad ${codigo}: pregunta fija guarda código y nombre canónicos, conserva fecha y reanuda sin duplicar`,async()=>{
    const h=harness({discapacidadPendiente:true});const p=(await h.rda()).body.data.pregunta;
    assert.equal(p.id,'rda_discapacidad');assert.equal(p.type,'single');assert.equal(p.text,'¿Con cuál de estas categorías de discapacidad te identificas?');
    assert.deepEqual(p.options.map(o=>[o.value,o.label]),categoriasDiscapacidad);
    assert.equal((await h.send({accion:'continuar'})).statusCode,409);
    const r=await h.rda('POST',respuestaDiscapacidad(codigo));assert.equal(r.statusCode,200);assert.equal(r.body.data.completo,true);
    const guardada=h.doc.respuestas.rda_discapacidad;assert.equal(guardada.valor,codigo);assert.equal(guardada.etiqueta,nombre);assert.match(guardada.fechaRespuesta,/^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(h.rdaRecord.seccionInterrogatorioPrincipal.discapacidades,[{codigo,nombre}]);
    assert.equal(h.rdaRecord.seccionInterrogatorioPrincipal.interrogatorioDiscapacidadId,h.doc._id);
    await h.rda('POST',respuestaDiscapacidad(codigo));assert.equal((await h.rda()).body.data.pregunta,null);assert.deepEqual(h.doc.respuestas.rda_discapacidad,guardada);assert.equal(h.doc.respuestas.historialChat.length,2);
    assert.equal((await h.rda('POST',respuestaDiscapacidad(codigo==='01'?'08':'01'))).statusCode,409);assert.equal(h.agentCalls,0);assert.equal(h.interpretCalls,0);
  });
}
test('secuencia fija: donación seguida de discapacidad; guardado parcial, reanudación y preparación paralela',async()=>{
  const h=harness({rdaPendiente:true,discapacidadPendiente:true});await h.send({accion:'preparar'});
  assert.equal((await h.rda('POST',respuestaDiscapacidad('08'))).statusCode,409,'no salta la primera pregunta');
  const r=await h.rda('POST',body('no_escrita'));assert.equal(r.body.data.completo,false);assert.equal(r.body.data.pregunta.id,'rda_discapacidad');
  assert.equal(h.rdaRecord.seccionInterrogatorioPrincipal.oposicionOrganos[0].oposicion,false,'primera respuesta guardada antes de contestar la segunda');
  assert.equal((await h.rda()).body.data.pregunta.id,'rda_discapacidad');assert.equal((await h.send({accion:'continuar'})).statusCode,409);
  for(const codigo of ['1','09','Discapacidad física',null,true,{},['01']])assert.equal((await h.rda('POST',respuestaDiscapacidad(codigo))).statusCode,400);
  await h.rda('POST',respuestaDiscapacidad('08'));await h.send({accion:'continuar'});assert.equal(h.agentCalls,1);assert.equal(h.last.questionId,'s11_nivel_estres');
});
test('discapacidad se recupera tras fallo de sincronización y no modifica RDA transmitidos ni datos médicos',async()=>{
  const h=harness({discapacidadPendiente:true});h.failRDASync(true);assert.equal((await h.rda('POST',respuestaDiscapacidad('03'))).statusCode,503);
  assert.equal(h.doc.respuestas.rda_discapacidad.valor,'03');h.failRDASync(false);assert.equal((await h.rda()).body.data.completo,true);assert.equal(h.rdaRecord.seccionInterrogatorioPrincipal.discapacidades[0].codigo,'03');
  for(const extra of [{estado:'transmitido'},{seccionInterrogatorioPrincipal:{discapacidades:[{codigo:'02',descripcion:'Registro del médico'}]}}]){
    const registro={_id:'b'.repeat(24),pacienteId:'synthetic-patient',estado:'borrador',activo:true,seccionInterrogatorioPrincipal:{},...extra};
    const t=harness({discapacidadPendiente:true,rdaRecord:registro});await t.rda('POST',respuestaDiscapacidad('08'));
    assert.deepEqual(t.rdaRecord.seccionInterrogatorioPrincipal.discapacidades,registro.seccionInterrogatorioPrincipal.discapacidades);
    if(registro.estado==='transmitido')assert.deepEqual(t.rdaRecord,registro);
  }
  const t=harness({discapacidadPendiente:true,beforeRDAUpdate:r=>{r.estado='transmitido';}});await t.rda('POST',respuestaDiscapacidad('08'));assert.deepEqual(t.rdaRecord.seccionInterrogatorioPrincipal,{});
});
test('Mongoose conserva codigo y nombre de discapacidad, incluido 08',async()=>{
  const mongoose=require('mongoose');const Model=mongoose.models.RegistroRDA || load('src/models/RegistroRDA.ts',{mongoose}).default;
  for(const [codigo,nombre] of categoriasDiscapacidad){const d=new Model({pacienteId:'a'.repeat(24),tipoRegistro:'inicial',seccionInterrogatorioPrincipal:{discapacidades:[{codigo,nombre}]}});await d.validate();assert.equal(d.toObject().seccionInterrogatorioPrincipal.discapacidades[0].codigo,codigo);assert.equal(d.toObject().seccionInterrogatorioPrincipal.discapacidades[0].nombre,nombre);}
});

const respuestaFactores=valorRespuesta=>({questionId:'rda_factores_riesgo',valorRespuesta,requestId:'factores-sinteticos'});
const detalleFactor=(codigo,valorRespuesta)=>({questionId:`rda_factor_detalle_${codigo}`,valorRespuesta,requestId:`detalle-${codigo}`});
test('factores: checkbox fijo con seis códigos y selección exclusiva de incertidumbre',async()=>{
  const h=harness({factoresPendientes:true});const r=await h.rda();const p=r.body.data.pregunta;
  assert.equal(p.id,'rda_factores_riesgo');assert.equal(p.type,'checkbox');assert.equal(p.text,'En tu trabajo o en tus actividades diarias, ¿a qué tipo de factor estás expuesto?');
  assert.deepEqual(p.options.map(o=>[o.value,o.nombre]),[['01','Químico'],['02','Físicos'],['03','Biomecánicos'],['04','Psicosociales'],['05','Biológicos'],['06','Otro'],['sin_certeza',undefined]]);
  for(const valor of [[],['01','sin_certeza'],['01','01'],['07'],['1'],'01',null,{},[true]])assert.equal((await h.rda('POST',respuestaFactores(valor))).statusCode,400);
  const guardada=await h.rda('POST',respuestaFactores(['sin_certeza']));assert.equal(guardada.body.data.completo,true);assert.equal(guardada.body.data.pregunta,null);
  assert.equal(h.rdaRecord.seccionInterrogatorioPrincipal.estadoFactoresRiesgo,'sin_certeza');assert.deepEqual(h.rdaRecord.seccionInterrogatorioPrincipal.factoresRiesgo,[]);
  assert.equal(h.agentCalls,0);assert.equal(h.interpretCalls,0);assert.equal((await h.rda('POST',detalleFactor('01','Falso detalle'))).statusCode,400);
});
test('factores: cada tipo seleccionado genera su detalle, conserva códigos, nombres y ceros en texto',async()=>{
  const h=harness({factoresPendientes:true});const primero=await h.rda('POST',respuestaFactores(['06','05','04','03','02','01']));assert.equal(primero.body.data.pregunta.id,'rda_factor_detalle_01');
  assert.deepEqual(h.doc.respuestas.rda_factores_riesgo.valor,['01','02','03','04','05','06']);
  const tipos=['químico','físico','biomecánico','psicosocial','biológico','de otro tipo'];
  for(let i=1;i<=6;i++){
    const codigo=String(i).padStart(2,'0');const p=(await h.rda()).body.data.pregunta;
    assert.equal(p.type,'text');assert.equal(p.text,`¿A qué factor ${tipos[i-1]} estás expuesto?`);assert.equal(p.description,'Cuéntalo con tus palabras. No necesitas conocer el término técnico');
    assert.equal((await h.send({accion:'continuar'})).statusCode,409);
    const r=await h.rda('POST',detalleFactor(codigo,`  Mi exposición ${i===1?'0':i}  `));assert.equal(r.statusCode,200);assert.equal(r.body.data.completo,i===6);
    assert.equal(h.doc.respuestas[p.id].valor,`Mi exposición ${i===1?'0':i}`);
  }
  const campos=h.rdaRecord.seccionInterrogatorioPrincipal;assert.equal(campos.estadoFactoresRiesgo,'registrados');assert.equal(campos.interrogatorioFactoresRiesgoId,h.doc._id);
  assert.deepEqual(campos.factoresRiesgo.map(r=>[r.codigo,r.tipo,r.nombre]),[['01','Químico','Mi exposición 0'],['02','Físicos','Mi exposición 2'],['03','Biomecánicos','Mi exposición 3'],['04','Psicosociales','Mi exposición 4'],['05','Biológicos','Mi exposición 5'],['06','Otro','Mi exposición 6']]);
  assert.equal(h.agentCalls,0);assert.equal(h.interpretCalls,0);
});
test('factores: reanuda en el detalle faltante, no acepta campos no seleccionados ni salta preguntas y reintentar es idempotente',async()=>{
  const h=harness({factoresPendientes:true});await h.rda('POST',respuestaFactores(['03','01']));
  assert.equal((await h.rda('POST',detalleFactor('02','No seleccionado'))).statusCode,400);assert.equal((await h.rda('POST',detalleFactor('03','Adelantado'))).statusCode,409);
  for(const valor of ['', '   ',null,{},['texto'],'a'.repeat(2001)])assert.equal((await h.rda('POST',detalleFactor('01',valor))).statusCode,400);
  await h.rda('POST',detalleFactor('01','Productos de limpieza'));const original=h.doc.respuestas.rda_factor_detalle_01;
  const reabrir=harness({doc:h.doc,rdaRecord:h.rdaRecord});assert.equal((await reabrir.rda()).body.data.pregunta.id,'rda_factor_detalle_03');
  await reabrir.rda('POST',respuestaFactores(['01','03']));await reabrir.rda('POST',detalleFactor('01','Productos de limpieza'));
  assert.deepEqual(reabrir.doc.respuestas.rda_factor_detalle_01,original);assert.equal(reabrir.doc.respuestas.historialChat.length,4);
  await reabrir.rda('POST',detalleFactor('03','Postura prolongada'));assert.equal((await reabrir.rda()).body.data.completo,true);assert.equal(reabrir.rdaRecord.seccionInterrogatorioPrincipal.factoresRiesgo.length,2);
});
test('factores: fallo de RDA se recupera después de guardar el detalle, sin repetirlo',async()=>{
  const h=harness({factoresPendientes:true});await h.rda('POST',respuestaFactores(['01']));h.failRDASync(true);
  assert.equal((await h.rda('POST',detalleFactor('01','Limpieza'))).statusCode,503);assert.equal(h.doc.respuestas.rda_factor_detalle_01.valor,'Limpieza');
  h.failRDASync(false);assert.equal((await h.rda()).body.data.completo,true);assert.deepEqual(h.rdaRecord.seccionInterrogatorioPrincipal.factoresRiesgo,[{codigo:'01',tipo:'Químico',nombre:'Limpieza'}]);
  await h.rda('POST',detalleFactor('01','Limpieza'));assert.equal(h.doc.respuestas.historialChat.length,4);
});
test('factores: datos médicos y RDA transmitidos permanecen intactos',async()=>{
  for(const extra of [{estado:'transmitido'},{seccionInterrogatorioPrincipal:{factoresRiesgo:[{tipo:'Físicos',nombre:'Dato médico'}]}}]){
    const registro={_id:'b'.repeat(24),pacienteId:'synthetic-patient',estado:'borrador',activo:true,seccionInterrogatorioPrincipal:{},...extra};const h=harness({factoresPendientes:true,rdaRecord:registro});
    await h.rda('POST',respuestaFactores(['01']));await h.rda('POST',detalleFactor('01','Limpieza'));
    assert.deepEqual(h.rdaRecord.seccionInterrogatorioPrincipal.factoresRiesgo,registro.seccionInterrogatorioPrincipal.factoresRiesgo);if(extra.estado)assert.deepEqual(h.rdaRecord,registro);
  }
  const h=harness({factoresPendientes:true,beforeRDAUpdate:r=>{r.estado='transmitido';}});await h.rda('POST',respuestaFactores(['sin_certeza']));assert.deepEqual(h.rdaRecord.seccionInterrogatorioPrincipal,{});
});
test('factores nuevos sustituyen la preparación antigua y la siguiente decisión usa el contexto actualizado',async()=>{
  let resolver;const espera=new Promise(r=>{resolver=r;});const h=harness({factoresPendientes:true,agent:()=>espera});const preparacion=h.send({accion:'preparar'});
  while(!h.agentCalls)await new Promise(r=>setTimeout(r,1));await h.rda('POST',respuestaFactores(['04']));await h.rda('POST',detalleFactor('04','Presión en el trabajo'));
  resolver({accion:'entrevistar',secciones:['s11'],id_pregunta:['s11_nivel_estres'],progreso:35});assert.equal((await preparacion).statusCode,409);
  assert.equal((await h.send({accion:'continuar',version:h.doc.fase2.version})).statusCode,200);
  assert.equal(h.agentCalls,2);assert.equal(h.doc.respuestas.rda_factor_detalle_04.valor,'Presión en el trabajo');assert.equal(h.rdaRecord.seccionInterrogatorioPrincipal.factoresRiesgo[0].codigo,'04');
});
test('esquema Mongoose conserva código de factor y estado de incertidumbre',async()=>{
  const mongoose=require('mongoose');const Model=mongoose.models.RegistroRDA || load('src/models/RegistroRDA.ts',{mongoose}).default;
  const d=new Model({pacienteId:'a'.repeat(24),tipoRegistro:'inicial',seccionInterrogatorioPrincipal:{factoresRiesgo:[{codigo:'01',tipo:'Químico',nombre:'Limpieza'}],estadoFactoresRiesgo:'registrados',interrogatorioFactoresRiesgoId:'c'.repeat(24)}});await d.validate();assert.equal(d.toObject().seccionInterrogatorioPrincipal.factoresRiesgo[0].codigo,'01');
});


test('historial RDA conserva las opciones y selección única o múltiple al responder y recargar',async()=>{
  const h=harness({rdaPendiente:true,factoresPendientes:true});
  const single=await h.rda('POST',body('sin_certeza'));assert.equal(single.statusCode,200);
  const snap=single.body.data.historial[0].opcionesRespondidas;assert.equal(snap.tipo,'single');assert.deepEqual(snap.seleccionadas,['No tengo certeza']);assert.equal(snap.opciones.length,4);
  const multi=await h.rda('POST',{questionId:'rda_factores_riesgo',valorRespuesta:['01','02'],requestId:'factores-opciones-historial'});assert.equal(multi.statusCode,200);
  const mark=multi.body.data.historial.find(m=>m.opcionesRespondidas?.tipo==='checkbox').opcionesRespondidas;
  assert.equal(mark.seleccionadas.length,2);assert.equal(mark.opciones.length,7);
  const reload=await h.rda();assert.deepEqual(reload.body.data.historial,multi.body.data.historial);
  assert.deepEqual(h.doc.respuestas.rda_factores_riesgo.opcionesRespondidas,mark);
});
