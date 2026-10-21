// Código y esquema reales; almacenamiento simulado, sin MongoDB ni datos de pacientes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const clone = value => value === undefined ? undefined : structuredClone(value);
function load(file, deps = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Date, console,
    require: id => { if (Object.hasOwn(deps, id)) return deps[id]; throw Error('Unexpected dependency: ' + id); } });
  return module.exports;
}
const mapper = load('src/services/medico/registroRDA/fase1RDA.ts');
const errors = load('src/utils/errors.ts');
const rdaFlow = load('src/services/paciente/preguntasRDAFlow.ts', { '../../data/rda_questions.json': require('../src/data/rda_questions.json') });
const id = c => c.repeat(24);
const patientId = id('a'), medicoId = id('b'), citaId = id('c');
const respuestas = {
  s01_identidad_genero: '02', s01_ocupacion: 'Desarrolladores de software',
  s01_ocupacion_ciuo: { codigo: '2512', nombre: 'Desarrolladores de software' },
  s01_tipo_alergia: 'medicamentos', s01_alergias: [{ tipo: 'medicamentos', sustancia: 'Penicilina' }, { tipo: 'alimentos', sustancia: 'Camarón' }],
  s01_enfermedades_familia: { estado: 'registradas', familiares: [
    { parentesco: { codigo: '01', descripcion: 'Padre' }, enfermedades: [{ codigo: 'E119', nombre: 'Diabetes' }, { codigo: 'I10X', nombre: 'Hipertensión' }] },
    { parentesco: { codigo: '04', descripcion: 'Abuelo' }, enfermedades: [{ codigo: 'E119', nombre: 'Diabetes' }] },
  ] },
  s01_medicamentos_actuales: { estado: 'toma', medicamentos: [
    { codigo: '10042-1', nombre: 'FLUNARICINA 10 MG' }, { codigo: null, nombre: 'Nombre declarado', origen: 'declarado' },
  ] },
};
const negativas = { s01_tipo_alergia: 'sin_alergias_conocidas', s01_alergias: [],
  s01_enfermedades_familia: { estado: 'no_conoce', familiares: [] }, s01_medicamentos_actuales: { estado: 'no_toma', medicamentos: [] } };
const source = (extra = {}) => ({ _id: id('d'), pacienteId: patientId, tipo: 'primera_vez', createdAt: new Date('2026-10-01'),
  fase1: { confirmada: true, version: 30 }, respuestas: clone(respuestas), ...extra });
const record = (extra = {}) => ({ _id: id('e'), pacienteId: patientId, medicoId, citaId, estado: 'borrador', activo: true,
  seccionInterrogatorioInicial: {}, seccionConsulta: { codigoPrestador: 'Prestador original' },
  createdAt: new Date('2026-10-10'), updatedAt: new Date('2026-10-10'), ...extra });
const get = (o, k) => k.split('.').reduce((r, key) => r?.[key], o);
function matches(o, query) {
  return o && Object.entries(query).every(([key, value]) => {
    const actual = get(o, key);
    if (Array.isArray(value)) return JSON.stringify(actual) === JSON.stringify(value);
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('$ne' in value) return actual !== value.$ne;
      if ('$exists' in value) return (actual !== undefined) === value.$exists;
      if ('$lte' in value) return actual <= value.$lte;
    }
    return value instanceof Date ? actual?.getTime() === value.getTime() : String(actual) === String(value);
  });
}
function harness({ docs = [], interviews = [source()], validCita = true, beforeUpdate } = {}) {
  let records = clone(docs), writes = 0, reads = 0;
  const document = data => data && Object.assign(clone(data), { toObject: () => clone(data) });
  function query(find) {
    return { sort() { return this; }, lean: async () => clone(find()), then(resolve, reject) { return Promise.resolve(document(find())).then(resolve, reject); } };
  }
  const model = {
    findOne: q => query(() => records.find(r => matches(r, q))),
    find: q => query(() => records.filter(r => matches(r, q))),
    create: async data => { writes++; const r = record(data); records.push(r); return document(r); },
    findOneAndUpdate(q, update) {
      return query(() => {
        if (beforeUpdate) beforeUpdate(records);
        const r = records.find(r => matches(r, q)); if (!r) return null;
        writes++;
        for (const [key, value] of Object.entries(update.$set)) {
          const keys = key.split('.'); const last = keys.pop();
          let target = r; for (const k of keys) target = target[k] ??= {};
          target[last] = clone(value);
        }
        for (const key of Object.keys(update.$unset || {})) {
          const keys = key.split('.'); const last = keys.pop();
          let target = r; for (const k of keys) target = target?.[k];
          if (target) delete target[last];
        }
        r.updatedAt = new Date(r.updatedAt.getTime() + 1000);
        return r;
      });
    },
  };
  const service = load('src/services/medico/registroRDA/registroRDAService.ts', {
    '../../../models/RegistroRDA': model,
    '../../../models/Paciente': { findById: () => query(() => ({ nombre: 'Paciente sintético', apellido: 'Prueba', genero: { codigo: '01' },
      ocupacionCIUO: { codigo: 'ANTERIOR', nombre: 'Ocupación anterior' } })) },
    '../../../models/Interrogatorio': { findOne: q => { reads++; return query(() => interviews.filter(r => matches(r, q)).sort((a,b) => b.createdAt - a.createdAt)[0]); } },
    '../../../models/Cita': { findOne: q => query(() => validCita && matches({ _id: citaId, pacienteId: patientId, medicoId }, q) ? { _id: citaId } : null) },
    '../../../utils/errors': errors, './fase1RDA': mapper, '../../paciente/preguntasRDAFlow': rdaFlow,
  }).default;
  return { service, get docs() { return clone(records); }, get writes() { return writes; }, get reads() { return reads; } };
}

test('proyección conserva CIUO, todas las alergias, enfermedades por parentesco y medicamentos sin código', () => {
  const r = mapper.proyectarFase1RDA(respuestas);
  assert.equal(r.identidadGenero, '02'); assert.equal(r.ocupacionCodigo, '2512');
  assert.equal(r.antecedentesAlergias.length, 2); assert.equal(r.antecedentesAlergias[0].nombreAlergeno, 'Penicilina');
  assert.deepEqual(clone(r.antecedentesFamiliares.map(f => [f.parentesco, f.parentescoNombre, f.codigoCIE10])), [
    ['01', 'Padre', 'E119'], ['01', 'Padre', 'I10X'], ['04', 'Abuelo', 'E119'],
  ]);
  assert.deepEqual(clone(r.antecedentesFarmacologicos), [
    { codigoCUMS: '10042-1', nombre: 'FLUNARICINA 10 MG', origen: 'catalogo' },
    { codigoCUMS: null, nombre: 'Nombre declarado', origen: 'declarado' },
  ]);
});
test('RDA de consulta incorpora las cuatro respuestas y la fecha YYYY-MM-DD desde la misma entrevista',async()=>{
  for(const [valor,esperado] of [['si_escrita',true],['no_escrita',false],['sin_certeza',null],['prefiero_no_responder',null]]){
    const entrevista=source();entrevista.respuestas.rda_oposicion_donacion={valor,respondidoEn:'2026-10-19T02:00:00Z'};
    const h=harness({interviews:[entrevista]});const r=await h.service.crear({pacienteId:patientId,medicoId,citaId});
    const ip=r.seccionInterrogatorioPrincipal;
    assert.equal(ip.oposicionOrganos[0].oposicion,esperado);assert.equal(ip.oposicionOrganos[0].respuesta,valor);
    assert.equal(ip.oposicionOrganos[0].fecha,'2026-10-18');assert.equal(ip.fechaOposicionOrganos,undefined);
    assert.equal(r.completitud.seccion4.donacionOrganos,true);
  }
});
test('consulta existente recupera la respuesta RDA sin cambiar de fuente ni sobrescribir datos médicos',async()=>{
  const entrevista=source();entrevista.respuestas.rda_oposicion_donacion={valor:'si_escrita',respondidoEn:'2026-10-18T12:00:00Z'};
  const actual=record({fuenteFase1:{interrogatorioId:entrevista._id,version:30},seccionInterrogatorioPrincipal:{discapacidades:[{codigo:'01'}]}});
  const h=harness({docs:[actual],interviews:[entrevista]});const r=await h.service.obtenerPorId(actual._id,medicoId);
  assert.equal(r.seccionInterrogatorioPrincipal.oposicionOrganos[0].oposicion,true);assert.deepEqual(r.seccionInterrogatorioPrincipal.discapacidades,[{codigo:'01'}]);
  const manual=harness({docs:[{...actual,seccionInterrogatorioPrincipal:{oposicionDonarOrganos:false}}],interviews:[entrevista]});
  assert.equal((await manual.service.obtenerPorId(actual._id,medicoId)).seccionInterrogatorioPrincipal.oposicionDonarOrganos,false);assert.equal(manual.writes,0);
});
test('sincronizar oposición no sobrescribe una edición médica concurrente',async()=>{
  const entrevista=source();entrevista.respuestas.rda_oposicion_donacion={valor:'si_escrita',respondidoEn:'2026-10-18T12:00:00Z'};
  const actual=record({fuenteFase1:{interrogatorioId:entrevista._id,version:30}});
  const h=harness({docs:[actual],interviews:[entrevista],beforeUpdate:rows=>{rows[0].seccionInterrogatorioPrincipal={oposicionDonarOrganos:false};}});
  const r=await h.service.obtenerPorId(actual._id,medicoId);assert.equal(r.seccionInterrogatorioPrincipal.oposicionDonarOrganos,false);assert.equal(h.writes,0);
});
test('no convierte campos ausentes o inválidos en respuestas negativas ni inventa códigos', () => {
  assert.deepEqual(clone(mapper.proyectarFase1RDA({})), {});
  assert.deepEqual(clone(mapper.proyectarFase1RDA({ s01_alergias: [], s01_enfermedades_familia: { estado: 'registradas', familiares: [] },
    s01_medicamentos_actuales: { estado: 'toma', medicamentos: [{ nombre: 'X', codigo: null }] } })), {});
  const r = mapper.proyectarFase1RDA({ s01_ocupacion: 'Ocupación manual' });
  assert.equal(r.ocupacionCodigo, null); assert.equal(r.ocupacionNombre, 'Ocupación manual');
});
test('crear RDA importa la fase confirmada sobre el perfil antiguo y conserva la fuente', async () => {
  const h = harness(); const r = await h.service.crear({ pacienteId: patientId, medicoId, citaId, fuenteFase1: { interrogatorioId: 'FALSIFICADO' } });
  assert.equal(r.seccionInterrogatorioInicial.ocupacionCodigo, '2512');
  assert.equal(r.seccionInterrogatorioInicial.identidadGenero, '02');
  assert.equal(r.fuenteFase1.interrogatorioId, id('d')); assert.equal(r.fuenteFase1.version, 30);
  assert(r.fuenteFase1.incorporadoEn instanceof Date);
});
test('crear conserva respuestas negativas explícitas y las cuenta como contestadas', async () => {
  const h = harness({ interviews: [source({ respuestas: negativas })] });
  const r = await h.service.crear({ pacienteId: patientId, medicoId, citaId });
  const ii = r.seccionInterrogatorioInicial;
  assert.equal(ii.indicadorAlergia, false); assert.equal(ii.estadoAntecedentesFamiliares, 'no_conoce');
  assert.equal(ii.estadoAntecedentesFarmacologicos, 'no_toma'); assert.equal(ii.antecedentesFarmacologicos.length, 0);
  assert.equal(r.completitud.seccion2.alergias, true); assert.equal(r.completitud.seccion2.antecedentesFamiliares, true);
  assert.equal(r.completitud.seccion2.antecedentesFarmacologicos, true);
});
test('el RDA de consulta queda vinculado al borrador inicial sin permitir sustituir ese vínculo desde el cliente', async () => {
  const inicial = { _id: id('f'), pacienteId: patientId, tipoRegistro: 'inicial', estado: 'borrador',
    fuenteFase1: { interrogatorioId: id('d'), version: 30 } };
  const h = harness({ docs: [inicial] });
  const r = await h.service.crear({ pacienteId: patientId, medicoId, citaId, tipoRegistro: 'inicial', registroInicialId: 'INVENTADO' });
  assert.equal(r.tipoRegistro, 'consulta'); assert.equal(r.registroInicialId, id('f'));
  assert.equal(h.docs[0].estado, 'borrador'); assert.equal(h.docs[0].citaId, undefined);
});
test('no toma entrevistas sin confirmar ni de otros pacientes', async () => {
  const h = harness({ interviews: [source({ fase1: { confirmada: false } }), source({ pacienteId: id('f') })] });
  const r = await h.service.crear({ pacienteId: patientId, medicoId, citaId });
  assert.equal(r.fuenteFase1, undefined); assert.equal(r.seccionInterrogatorioInicial.indicadorAlergia, undefined);
});
test('valida la pertenencia de la cita antes de crear o consultar datos de la fase 1', async () => {
  const h = harness({ validCita: false });
  await assert.rejects(h.service.crear({ pacienteId: patientId, medicoId, citaId }), /no corresponde/);
  assert.equal(h.writes, 0); assert.equal(h.reads, 0);
});
test('si el RDA se crea durante la entrevista, incorpora las respuestas al abrirlo después de confirmar', async () => {
  const entrevista = source({ fase1: { confirmada: false, version: 29 } });
  const h = harness({ interviews: [entrevista] });
  const creado = await h.service.crear({ pacienteId: patientId, medicoId, citaId });
  assert.equal(creado.fuenteFase1, undefined);
  // Campos del perfil ya presentes se conservan; los antecedentes confirmados se incorporan una vez.
  entrevista.fase1 = { confirmada: true, version: 30 };
  const abierto = await h.service.obtenerPorCita(citaId, medicoId);
  assert.equal(abierto.fuenteFase1.version, 30);
  assert.equal(abierto.seccionInterrogatorioInicial.antecedentesFarmacologicos[1].codigoCUMS, null);
});
test('elige la entrevista confirmada más reciente y mantiene la fuente aunque aparezca otra después', async () => {
  const entrevistas = [source({ createdAt: new Date('2026-09-01'), _id: id('1'), respuestas: negativas }), source()];
  const h = harness({ interviews: entrevistas });
  const creado = await h.service.crear({ pacienteId: patientId, medicoId, citaId });
  assert.equal(creado.fuenteFase1.interrogatorioId, id('d'));
  entrevistas.push(source({ _id: id('2'), createdAt: new Date('2026-10-17'), respuestas: negativas }));
  const abierto = await h.service.obtenerPorCita(citaId, medicoId);
  assert.equal(abierto.fuenteFase1.interrogatorioId, id('d'));
  assert.equal(abierto.seccionInterrogatorioInicial.estadoAntecedentesFarmacologicos, 'toma');
});
test('un médico ajeno no lee ni sincroniza el RDA', async () => {
  const h = harness({ docs: [record()] });
  assert.equal(await h.service.obtenerPorId(id('e'), id('f')), null);
  assert.equal(await h.service.obtenerPorCita(citaId, id('f')), null);
  assert.equal(h.writes, 0); assert.equal(h.reads, 0);
});
test('RDA existente se completa una vez al abrir, conserva datos del médico y no mezcla negativas', async () => {
  const actual = record({ seccionInterrogatorioInicial: { indicadorAlergia: false, antecedentesAlergias: [],
    estadoAntecedentesFarmacologicos: 'no_toma', antecedentesFarmacologicos: [], ocupacionCodigo: 'MEDICO', ocupacionNombre: 'Revisada' } });
  const h = harness({ docs: [actual] }); const r = await h.service.obtenerPorCita(citaId, medicoId);
  assert.equal(r.seccionInterrogatorioInicial.ocupacionCodigo, 'MEDICO'); assert.equal(r.seccionInterrogatorioInicial.indicadorAlergia, false);
  assert.equal(r.seccionInterrogatorioInicial.antecedentesAlergias.length, 0);
  assert.equal(r.seccionInterrogatorioInicial.antecedentesFarmacologicos.length, 0);
  assert.equal(r.seccionInterrogatorioInicial.antecedentesFamiliares.length, 3);
  assert.equal(r.seccionConsulta.codigoPrestador, 'Prestador original');
  const writes = h.writes; await h.service.obtenerPorId(actual._id, medicoId);
  await h.service.obtenerPorPaciente(patientId, medicoId); assert.equal(h.writes, writes);
});
test('no modifica ni consulta una nueva fuente para registros transmitidos', async () => {
  const actual = record({ estado: 'transmitido' }); const h = harness({ docs: [actual] });
  await h.service.obtenerPorCita(citaId, medicoId); await h.service.obtenerPorId(actual._id, medicoId);
  await h.service.obtenerPorPaciente(patientId, medicoId);
  assert.equal(h.writes, 0); assert.equal(h.reads, 0); assert.deepEqual(h.docs[0], actual);
  await assert.rejects(h.service.actualizar(actual._id, medicoId, { seccionInterrogatorioInicial: {} }), /ya transmitido/);
  await assert.rejects(h.service.cambiarEstado(actual._id, medicoId, 'borrador'), /ya transmitido/);
  await assert.rejects(h.service.eliminar(actual._id, medicoId), /ya transmitido/);
});
test('filtro atómico protege un RDA transmitido entre lectura y sincronización', async () => {
  const actual = record(); const h = harness({ docs: [actual], beforeUpdate: docs => { docs[0].estado = 'transmitido'; } });
  const r = await h.service.obtenerPorId(actual._id, medicoId);
  assert.equal(r.estado, 'transmitido'); assert.equal(h.writes, 0); assert.equal(h.docs[0].fuenteFase1, undefined);
});
test('filtro atómico preserva una edición concurrente del médico', async () => {
  const actual = record(); const h = harness({ docs: [actual], beforeUpdate: docs => {
    docs[0].seccionInterrogatorioInicial = { identidadGenero: '05' }; docs[0].updatedAt = new Date('2026-10-11');
  } });
  const r = await h.service.obtenerPorId(actual._id, medicoId);
  assert.equal(r.seccionInterrogatorioInicial.identidadGenero, '05'); assert.equal(h.writes, 0);
});
test('un registro histórico no recibe entrevistas iniciadas después de su creación', async () => {
  const h = harness({ docs: [record()], interviews: [source({ createdAt: new Date('2026-10-11') })] });
  const r = await h.service.obtenerPorId(id('e'), medicoId); assert.equal(r.fuenteFase1, undefined); assert.equal(h.writes, 0);
});
test('editar no puede sustituir la fuente ni los vínculos y la transmisión concurrente bloquea escrituras', async () => {
  const actual = record(); const h = harness({ docs: [actual] });
  await h.service.actualizar(actual._id, medicoId, { pacienteId: 'OTRO', citaId: 'OTRA', estado: 'transmitido',
    fuenteFase1: { interrogatorioId: 'INVENTADO' }, seccionConsulta: { codigoPrestador: 'Nuevo' } });
  assert.equal(h.docs[0].pacienteId, patientId); assert.equal(h.docs[0].citaId, citaId);
  assert.equal(h.docs[0].fuenteFase1, undefined); assert.equal(h.docs[0].estado, 'borrador');
  for (const action of ['actualizar', 'cambiarEstado', 'eliminar']) {
    const race = harness({ docs: [actual], beforeUpdate: docs => { docs[0].estado = 'transmitido'; } });
    const arg = action === 'actualizar' ? { seccionCuenta: { primerNombre: 'Otro' } } : 'borrador';
    await assert.rejects(race.service[action](actual._id, medicoId, arg), /cambió|transmitido/);
    assert.equal(race.writes, 0);
  }
});
test('esquema Mongoose conserva null, origen y negativas al serializar y valida enums', async () => {
  const mongoose = require('mongoose');
  const Model = load('src/models/RegistroRDA.ts', { mongoose }).default;
  const registro = new Model({ pacienteId: patientId, medicoId, citaId, seccionInterrogatorioInicial: mapper.proyectarFase1RDA(respuestas),
    fuenteFase1: { interrogatorioId: id('d'), version: 30, incorporadoEn: new Date() } });
  await registro.validate(); const obj = registro.toObject();
  assert.equal(obj.seccionInterrogatorioInicial.antecedentesFarmacologicos[1].codigoCUMS, null);
  assert.equal(obj.seccionInterrogatorioInicial.antecedentesFarmacologicos[1].origen, 'declarado');
  assert.equal(obj.seccionInterrogatorioInicial.antecedentesFamiliares[0].parentesco, '01');
  assert.equal(obj.seccionInterrogatorioInicial.antecedentesFamiliares[0].parentescoNombre, 'Padre');
  const sin = new Model({ pacienteId: patientId, medicoId, citaId, seccionInterrogatorioInicial: mapper.proyectarFase1RDA(negativas) });
  await sin.validate(); assert.equal(sin.toObject().seccionInterrogatorioInicial.estadoAntecedentesFarmacologicos, 'no_toma');
  sin.seccionInterrogatorioInicial.estadoAntecedentesFamiliares = 'INVENTADO';
  await assert.rejects(sin.validate(), /enum/);
});

test('consulta crea y recupera discapacidad con código y nombre sin cambiar datos médicos',async()=>{
  const entrevista=source();entrevista.respuestas.rda_discapacidad={valor:'08',etiqueta:'Texto manipulado',respondidoEn:'2026-10-18T12:00:00Z'};
  const h=harness({interviews:[entrevista]});const nuevo=await h.service.crear({pacienteId:patientId,medicoId,citaId});
  assert.deepEqual(nuevo.seccionInterrogatorioPrincipal.discapacidades,[{codigo:'08',nombre:'Sin discapacidad'}]);assert.equal(nuevo.completitud.seccion4.discapacidades,true);
  const actual=record({fuenteFase1:{interrogatorioId:entrevista._id,version:30}});const t=harness({docs:[actual],interviews:[entrevista]});
  const r=await t.service.obtenerPorId(actual._id,medicoId);assert.deepEqual(r.seccionInterrogatorioPrincipal.discapacidades,[{codigo:'08',nombre:'Sin discapacidad'}]);
  const manual={...actual,seccionInterrogatorioPrincipal:{discapacidades:[{codigo:'01',descripcion:'Valor médico'}]}};const m=harness({docs:[manual],interviews:[entrevista]});
  assert.deepEqual((await m.service.obtenerPorId(actual._id,medicoId)).seccionInterrogatorioPrincipal.discapacidades,manual.seccionInterrogatorioPrincipal.discapacidades);
});

test('consulta incorpora factores codificados y también incertidumbre explícita, conservando datos médicos',async()=>{
  for(const seleccion of [['sin_certeza'],['01','03']]){
    const entrevista=source();entrevista.respuestas.rda_factores_riesgo={valor:seleccion,respondidoEn:'2026-10-18T12:00:00Z'};
    entrevista.respuestas.rda_factor_detalle_01={valor:'Limpieza',respondidoEn:'2026-10-18T12:00:00Z'};entrevista.respuestas.rda_factor_detalle_03={valor:'Postura prolongada',respondidoEn:'2026-10-18T12:00:00Z'};
    const h=harness({interviews:[entrevista]});const r=await h.service.crear({pacienteId:patientId,medicoId,citaId});
    const esperado=seleccion[0]==='sin_certeza'?[]:[{codigo:'01',tipo:'Químico',nombre:'Limpieza'},{codigo:'03',tipo:'Biomecánicos',nombre:'Postura prolongada'}];
    assert.deepEqual(r.seccionInterrogatorioPrincipal.factoresRiesgo,esperado);assert.equal(r.completitud.seccion4.factoresRiesgo,true);
    const actual=record({fuenteFase1:{interrogatorioId:entrevista._id,version:30}});const t=harness({docs:[actual],interviews:[entrevista]});assert.deepEqual((await t.service.obtenerPorId(actual._id,medicoId)).seccionInterrogatorioPrincipal.factoresRiesgo,esperado);
  }
});
