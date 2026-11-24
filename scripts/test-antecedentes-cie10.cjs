const test = require('node:test');
const assert = require('node:assert/strict');
const { load, semantic: s, cie10, errors, env } = require('./antecedentes-harness.cjs');
const { harness: fase1, complete, accepted } = require('./test-fase1.cjs');
const { harness: fase2, seleccionar, flow, resetFlow } = require('./test-fase2.cjs');
const clone = structuredClone;
const contexto = { pacienteId: 'synthetic-patient', interrogatorioId: 'a'.repeat(24), questionId: 's05_dx_cardiovascular', referencia: 'paciente', generacion: 0 };
const enfermedad = (codigo = 'I10X', textoOriginal = 'presión alta') => ({ ...cie10.obtenerCIE10(codigo), textoOriginal, estadoCodificacion: 'sugerida', requiereRevisionMedica: true });
const registro = () => ({ estado: 'referidas', textoOriginal: 'Tengo presión alta', aclaraciones: [], enfermedades: [enfermedad()] });
const mencion = (evidencia, clara = true, busquedas = ['hipertensión']) => ({ evidencia, clara, busquedas, pregunta: clara ? '' : '¿Recuerdas qué diagnóstico te dieron?' });
const interpretar = (texto, menciones, elecciones, aclaraciones = []) => s.interpretarAntecedente({ texto, aclaraciones, ambito: 'personal' }, async (prompt, datos) => {
  if (datos.recuperar) return { recuperaciones: datos.recuperar.map(m => ({ indice: m.indice, busquedas: [], referenciasCIE10: [] })) };
  if (datos.menciones) return { elecciones: elecciones || datos.menciones.map(m => ({ indice: m.indice, codigo: m.candidatos.find(c => c.codigo === 'I10X')?.codigo, confianza: 'alta' })) };
  return { estado: 'referidas', menciones };
});

test('proximidad semántica usa el catálogo real, conserva todo el relato y separa varias enfermedades', async () => {
  const r = await interpretar('Tengo presión alta y asma', [mencion('presión alta'), mencion('asma', true, ['asma'])], [
    { indice: 0, codigo: 'I10X', confianza: 'alta' }, { indice: 1, codigo: 'J459', confianza: 'alta' },
  ]);
  assert.deepEqual(clone(r.preguntas), []); assert.equal(r.registro.enfermedades.length, 2);
  assert.equal(r.registro.textoOriginal, 'Tengo presión alta y asma');
  for (const e of r.registro.enfermedades) { assert.equal(e.nombre, cie10.obtenerCIE10(e.codigo).nombre); assert.equal(e.requiereRevisionMedica, true); }
  assert.equal(s.esAntecedenteReferido(r.registro), true);
});
test('un relato ambiguo pregunta; no recordar conserva el texto sin forzar una enfermedad', async () => {
  const inicial = await interpretar('Sufre del corazón', [mencion('Sufre del corazón', false, [])]);
  assert.equal(inicial.preguntas.length, 1); assert.equal(inicial.registro.enfermedades[0].codigo, null);
  const final = await interpretar('Sufre del corazón', [mencion('Sufre del corazón', false, [])], [], ['No lo sé, no recuerdo más información.']);
  assert.equal(final.preguntas.length, 0); assert.equal(final.registro.enfermedades[0].estadoCodificacion, 'pendiente');
  assert.equal(final.registro.textoOriginal, 'Sufre del corazón'); assert.equal(final.registro.aclaraciones.length, 1);
});
test('una aclaración concreta permite sugerir; la duda de la segunda selección vuelve a preguntar', async () => {
  const r = await interpretar('Tengo algo del corazón', [mencion('Me diagnosticaron hipertensión')], undefined, ['Me diagnosticaron hipertensión']);
  assert.equal(r.registro.enfermedades[0].codigo, 'I10X'); assert.equal(r.preguntas.length, 0);
  const dudosa = await interpretar('presión alta', [mencion('presión alta')], [{ indice: 0, codigo: 'I10X', confianza: 'dudosa', pregunta: '¿Te lo diagnosticó un médico?' }]);
  assert.equal(dudosa.registro.enfermedades[0].codigo, null); assert.match(dudosa.preguntas[0], /médico/);
});

test('diabetes + «diria que es tipo 1»: valida fragmentos de ambos turnos y conserva la incertidumbre', async () => {
  const input = { texto: 'diabetes', aclaraciones: ['diria que es tipo 1'], ambito: 'familiar' };
  let llamadas = 0;
  const resolver = async (prompt, datos) => {
    llamadas++;
    assert.deepEqual(clone(datos.fuentes), [{ indice: 0, texto: 'diabetes' }, { indice: 1, texto: 'diria que es tipo 1' }]);
    assert.match(prompt, /no los unas en una cita inventada/);
    return { estado: 'referidas', menciones: [{ evidencias: [{ fuente: 0, texto: 'diabetes' }, { fuente: 1, texto: 'diria que es tipo 1' }],
      busquedas: ['diabetes mellitus tipo 1'], clara: false, pregunta: '¿Recuerdas si te confirmaron el tipo de diabetes? Puedes decir que no lo sabes.' }] };
  };
  const r = await s.interpretarAntecedente(input, resolver);
  assert.equal(llamadas, 1, 'no intenta codificar una aclaración incierta');
  assert.equal(r.registro.textoOriginal, 'diabetes'); assert.deepEqual(clone(r.registro.aclaraciones), input.aclaraciones);
  assert.equal(r.registro.enfermedades[0].textoOriginal, 'diabetes\ndiria que es tipo 1');
  assert.equal(r.registro.enfermedades[0].codigo, null); assert.equal(r.registro.enfermedades[0].estadoCodificacion, 'pendiente');
  assert.equal(r.preguntas.length, 1); assert.equal(s.esAntecedenteReferido(r.registro), true);
});

test('aclaraciones en varias fuentes no permiten citas inventadas ni referencias a otro turno', async () => {
  const input = { texto: 'diabetes', aclaraciones: ['diria que es tipo 1'], ambito: 'familiar' };
  for (const evidencias of [[], [{ fuente: 0, texto: 'diabetes tipo 1' }], [{ fuente: 1, texto: 'diabetes' }],
    [{ fuente: 2, texto: 'diria que es tipo 1' }], [{ fuente: -1, texto: 'diabetes' }], [{ fuente: '0', texto: 'diabetes' }],
    [{ fuente: 0, texto: 'diabetes' }, { fuente: 1, texto: 'tipo 2 confirmado' }]]) {
    await assert.rejects(s.interpretarAntecedente(input, async () => ({ estado: 'referidas', menciones: [
      { evidencias, busquedas: [], clara: false, pregunta: '¿Puedes aclararlo?' },
    ] })), /Mención sin respaldo/);
  }
  // La salida que produjo el fallo original no se acepta como una cita literal.
  await assert.rejects(s.interpretarAntecedente(input, async () => ({ estado: 'referidas', menciones: [
    { evidencia: 'diabetes — aclaración: "diria que es tipo 1"', busquedas: [], clara: false },
  ] })), /Mención sin respaldo/);
});

test('tras una aclaración incierta, «No lo sé» permite guardar todos los turnos sin inventar un código', async () => {
  const input = { texto: 'diabetes', aclaraciones: ['diría que es tipo 1', 'No lo sé, no recuerdo más información.'], ambito: 'familiar' };
  const r = await s.interpretarAntecedente(input, async (prompt, datos) => ({ estado: 'referidas', menciones: [{
    evidencias: datos.fuentes.map(f => ({ fuente: f.indice, texto: f.texto })), busquedas: [], clara: false, pregunta: '¿Recuerdas el tipo?',
  }] }));
  assert.deepEqual(clone(r.preguntas), []); assert.deepEqual(clone(r.registro.aclaraciones), input.aclaraciones);
  assert.equal(r.registro.enfermedades[0].codigo, null);
  assert.match(r.registro.enfermedades[0].textoOriginal, /diría que es tipo 1\nNo lo sé/);
});

test('recuperación general cubre las 12634 entradas sin listas de equivalencias por enfermedad', () => {
  const entradas = require('../src/data/cie10_catalogo.json').registros;
  const categorias = [...new Set(entradas.map(e => e.codigo.slice(0, 3)))];
  const recuperadas = new Map;
  for (const categoria of categorias) {
    for (const e of cie10.buscarCandidatosCIE10([], [categoria])) {
      assert(e.codigo.startsWith(categoria)); assert.deepEqual(e, cie10.obtenerCIE10(e.codigo));
      recuperadas.set(e.codigo, e);
    }
  }
  assert.equal(recuperadas.size, entradas.length);
  assert(cie10.buscarCandidatosCIE10([], [' e10.9 ']).some(e => e.codigo === 'E109'));
  assert.equal(cie10.buscarCandidatosCIE10([], ['Z99.99', 'INVENTADO', '__proto__']).length, 0);
  const candidatos = cie10.buscarCandidatosCIE10(['enfermedad', 'migraña sin aura'], ['G43']);
  assert(candidatos.some(e => e.codigo === 'G430')); assert.equal(new Set(candidatos.map(e => e.codigo)).size, candidatos.length);
  assert(candidatos.length <= 80);
});

test('confirmación posterior de diabetes llega al selector y guarda E109, conservando la primera duda y el parentesco RDA', async () => {
  const input = { texto: 'diabetes', aclaraciones: ['diria que tiene diabetes tipo 1', 'es tipo 1'], ambito: 'familiar' };
  let llamadas = 0;
  const result = await s.interpretarAntecedente(input, async (prompt, datos) => {
    llamadas++;
    if (!datos.menciones) {
      assert.match(prompt, /una confirmación o corrección posterior explícita sustituye la duda anterior/);
      return { estado: 'referidas', menciones: [{ evidencias: datos.fuentes.map(f => ({ fuente: f.indice, texto: f.texto })),
        busquedas: ['diabetes tipo 1', 'diabetes mellitus tipo 1'], referenciasCIE10: ['E10'], clara: true, pregunta: null }] };
    }
    assert.match(prompt, /confirmación o corrección posterior explícita reemplaza la duda anterior/);
    assert.match(prompt, /SIN MENCION DE COMPLICACION/);
    assert(datos.menciones[0].candidatos.some(e => e.codigo === 'E109'));
    assert(datos.menciones[0].candidatos.every(e => e.codigo.startsWith('E10')));
    return { elecciones: [{ indice: 0, codigo: 'E109', confianza: 'alta', pregunta: null }] };
  });
  assert.equal(llamadas, 2); assert.deepEqual(clone(result.preguntas), []);
  assert.equal(result.registro.enfermedades[0].codigo, 'E109'); assert.equal(result.registro.enfermedades[0].estadoCodificacion, 'sugerida');
  assert.deepEqual(clone(result.registro.aclaraciones), input.aclaraciones);
  const h = fase1({ interpret: accepted }); await complete(h, 's01_enfermedades_familia');
  const ctx = { ...contexto, questionId: h.last.questionId, referencia: '01:madre' };
  const ok = await h.send('Mamá: diabetes tipo 1', { valorRespuesta: { familiares: [{ parentescoCodigo: '01', familiarId: 'madre', comprobante: s.firmarSugerencia(ctx, result.registro) }] } });
  assert.equal(ok.statusCode, 200);
  const familiar = h.doc.respuestas.s01_enfermedades_familia.familiares[0];
  assert.equal(familiar.parentesco.codigo, '01'); assert.equal(familiar.familiar.id, 'madre');
  assert.equal(familiar.enfermedades[0].codigo, 'E109'); assert.deepEqual(familiar.aclaraciones, input.aclaraciones);
});

test('equivalencias de búsqueda no convierten una duda vigente en un código ni añaden complicaciones', async () => {
  const incierto = await interpretar('diabetes tipo 1', [mencion('diabetes tipo 1', false, ['diabetes tipo 1'])], [], ['no estoy seguro del tipo']);
  assert.equal(incierto.registro.enfermedades[0].codigo, null); assert.equal(incierto.preguntas.length, 1);
  const renal = await interpretar('diabetes tipo 1 con complicaciones renales', [mencion('diabetes tipo 1 con complicaciones renales', true, ['diabetes mellitus insulinodependiente con complicaciones renales'])],
    [{ indice: 0, codigo: 'E102', confianza: 'alta' }]);
  assert.equal(renal.registro.enfermedades[0].codigo, 'E102'); assert.equal(renal.preguntas.length, 0);
  // Una entrada sin mención de complicación no está entre los candidatos compatibles con la complicación referida.
  await assert.rejects(interpretar('diabetes tipo 1 con complicaciones renales', [mencion('diabetes tipo 1 con complicaciones renales', true, ['diabetes mellitus insulinodependiente con complicaciones renales'])],
    [{ indice: 0, codigo: 'E109', confianza: 'alta' }]), /candidatos/);
});
test('no hay coincidencia: queda pendiente; dos aclaraciones no producen un bucle', async () => {
  const r = await interpretar('algo raro', [mencion('algo raro', true, ['zzzzsincoincidencia'])], [], ['No recuerdo el nombre exacto', 'No tengo el informe']);
  assert.equal(r.preguntas.length, 0); assert.equal(r.registro.enfermedades[0].codigo, null);
});
test('ausencia y desconocimiento permanecen distintos; las negaciones se conservan literalmente', async () => {
  for (const [texto, estado] of [['No tengo ninguna enfermedad', 'ninguna'], ['No sé qué enfermedades tengo', 'no_sabe']]) {
    const r = await s.interpretarAntecedente({ texto, aclaraciones: [], ambito: 'personal' }, async prompt => {
      assert.match(prompt, /Excluye de menciones las enfermedades negadas/); return { estado, menciones: [] };
    });
    assert.equal(r.registro.estado, estado); assert.equal(r.registro.textoOriginal, texto); assert.equal(r.registro.enfermedades.length, 0);
  }
});
test('rechaza evidencia inventada, código inexistente, código ajeno a candidatos y salida incompleta', async () => {
  await assert.rejects(interpretar('asma', [mencion('diabetes')]), /respaldo/);
  for (const codigo of ['INVENTADO', 'E119']) await assert.rejects(interpretar('presión alta', [mencion('presión alta')], [{ indice: 0, codigo, confianza: 'alta' }]), /candidatos/);
  await assert.rejects(s.interpretarAntecedente({ texto: 'prueba', aclaraciones: [], ambito: 'personal' }, async () => ({})), /inválida/);
});
test('sinónimos del mismo código no duplican el antecedente ni pierden las expresiones originales', async () => {
  const r = await interpretar('presión alta, hipertensión', [mencion('presión alta'), mencion('hipertensión')]);
  assert.equal(r.registro.enfermedades.length, 1); assert.match(r.registro.enfermedades[0].textoOriginal, /presión alta; hipertensión/);
});
test('comprobante vinculado a paciente, entrevista, pregunta, familiar y generación; rechaza manipulación y caducidad', () => {
  const token = s.firmarSugerencia(contexto, registro());
  assert.deepEqual(clone(s.leerSugerencia(token, contexto)), registro());
  for (const [k, v] of Object.entries({ pacienteId: 'otro', interrogatorioId: 'b'.repeat(24), questionId: 's05_dx_otras', referencia: '01:madre', generacion: 1 }))
    assert.throws(() => s.leerSugerencia(token, { ...contexto, [k]: v }), /cambió o venció/);
  assert.throws(() => s.leerSugerencia(token.slice(0, -5) + 'xxxxx', contexto));
  const expired = require('jsonwebtoken').sign({ proposito: 'antecedente_referido', ...contexto, registro: registro() }, env.JWT_SECRET, { expiresIn: -1 });
  assert.throws(() => s.leerSugerencia(expired, contexto));
  assert.throws(() => s.leerSugerencia({ registro: registro() }, contexto));
});
test('endpoint valida propiedad de entrevista y pregunta vigente antes de llamar IA; entrega token solo tras aclarar', async () => {
  let doc = { estado: 'en_proceso', fase2: { estado: 'preguntando', preguntaId: contexto.questionId } }, llamadas = 0;
  const c = load('src/controllers/paciente/antecedentesController.ts', {
    '../../models/Interrogatorio': { findOne: q => ({ select: () => ({ lean: async () => q.pacienteId === contexto.pacienteId ? doc : null }) }) },
    '../../utils/errors': errors, '../../services/ai/anamnesisOrchestratorService': {},
    '../../services/ai/antecedentesCIE10': { ...s, interpretarAntecedente: async input => { llamadas++; return interpretar(input.texto, [mencion(input.texto, false, [])], [], input.aclaraciones); } },
  });
  const send = async (userId = contexto.pacienteId, body = {}) => {
    const res = { code: 200, status(n) { this.code = n; return this; }, setHeader() {}, json(v) { this.body = v; } };
    await c.interpretarAntecedentes({ userId, body: { interrogatorioId: contexto.interrogatorioId, questionId: contexto.questionId, texto: 'algo del corazón', ...body } }, res); return res;
  };
  assert.equal((await send('otro')).code, 404); assert.equal(llamadas, 0);
  assert.equal((await send(undefined, { texto: 'x'.repeat(1201) })).code, 400); assert.equal(llamadas, 0);
  const duda = await send(); assert.equal(duda.code, 200); assert.equal(duda.body.data.comprobante, undefined);
  const final = await send(undefined, { aclaraciones: ['No lo sé'] }); assert.equal(final.code, 200); assert.ok(final.body.data.comprobante);
  doc.fase2.preguntaId = 's05_dx_otras'; assert.equal((await send()).code, 409); assert.equal(llamadas, 2);
});
test('fase 1 guarda seis familiares distintos con sus códigos RDA y relato; rechaza comprobante de otro familiar', async () => {
  const h = fase1({ interpret: accepted }); await complete(h, 's01_enfermedades_familia');
  const ids = [['01', 'madre'], ['01', 'padre'], ['04', 'abuelo_materno'], ['04', 'abuelo_paterno'], ['04', 'abuela_materna'], ['04', 'abuela_paterna']];
  const familiares = ids.map(([parentescoCodigo, familiarId]) => ({ parentescoCodigo, familiarId,
    comprobante: s.firmarSugerencia({ ...contexto, questionId: h.last.questionId, referencia: `${parentescoCodigo}:${familiarId}` }, registro()) }));
  const bad = await h.send('Relato', { valorRespuesta: { familiares: [{ ...familiares[0], familiarId: 'padre' }] } });
  assert.equal(bad.statusCode, 409); assert.equal(h.doc.respuestas.s01_enfermedades_familia, undefined);
  const ok = await h.send('Relatos de familiares', { valorRespuesta: { familiares } }); assert.equal(ok.statusCode, 200);
  const guardada = h.doc.respuestas.s01_enfermedades_familia;
  assert.deepEqual(guardada.familiares.map(f => [f.parentesco.codigo, f.familiar.id]), ids);
  assert(guardada.familiares.every(f => f.textoOriginal === registro().textoOriginal && !f.comprobante));
  const projection = load('src/services/medico/registroRDA/fase1RDA.ts');
  const rda = projection.proyectarFase1RDA(h.doc.respuestas).antecedentesFamiliares;
  assert.deepEqual(clone(rda.map(f => [f.parentesco, f.familiarId])), ids);
  assert(rda.every(f => f.codigoCIE10 === 'I10X' && f.estadoCodificacion === 'sugerida'));
});
test('fase 2 presenta texto abierto, guarda el registro firmado y permite volver a corregir sin códigos del intérprete', async () => {
  const h = fase2({ decisions: [seleccionar(contexto.questionId)], interpret: () => ({ respuestas: [{ id: contexto.questionId, valor: { codigo: 'INVENTADO' } }] }) });
  await h.send(); assert.equal(h.last.busqueda.semantica, true); assert.deepEqual(h.last.opciones, []);
  const token = s.firmarSugerencia(contexto, registro());
  assert.equal((await h.send({ mensajeUsuario: 'texto', valorRespuesta: { ...registro() } })).statusCode, 409);
  const ok = await h.send({ mensajeUsuario: registro().textoOriginal, valorRespuesta: { comprobante: token } });
  assert.equal(ok.statusCode, 200); assert.deepEqual(h.doc.respuestas[contexto.questionId], registro());
  // Editar se ofrece desde la revisión final; simular ese estado guardado sin llamar a una IA real.
  const doc = h.doc; doc.fase2.estado = 'resumen';
  const ed = fase2({ doc, interpret: () => ({ respuestas: [{ id: contexto.questionId, valor: { codigo: 'INVENTADO' } }] }) });
  const corregir = await ed.send({ accion: 'editar', requestId: 'corregir-antecedente', mensajeUsuario: 'Quiero corregir la presión' });
  assert.equal(corregir.statusCode, 200); assert.equal(ed.last.questionId, contexto.questionId); assert.equal(ed.last.busqueda.semantica, true);
  assert.deepEqual(ed.doc.respuestas[contexto.questionId], registro());
  assert.equal((await ed.send({ mensajeUsuario: 'No tengo enfermedades' })).statusCode, 400);
  const negativa = { estado: 'ninguna', textoOriginal: 'No tengo enfermedades', aclaraciones: [], enfermedades: [] };
  assert.equal((await ed.send({ requestId: 'guardar-correccion', mensajeUsuario: negativa.textoOriginal, valorRespuesta: { comprobante: s.firmarSugerencia(contexto, negativa) } })).statusCode, 200);
  assert.deepEqual(ed.doc.respuestas[contexto.questionId], negativa);
});
test('RDA preserva códigos sugeridos, no toca diagnósticos confirmados y protege cambios del médico', async () => {
  let rda = { _id: 'rda', estado: 'borrador', activo: true, pacienteId: contexto.pacienteId, updatedAt: 'v1', seccionInterrogatorioPrincipal: { diagnosticos: ['diagnóstico del médico'] } }, actualizaciones = 0;
  const service = load('src/services/paciente/antecedentesRDAService.ts', {
    '../../models/RegistroRDA': { findOneAndUpdate: (q, update) => ({ lean: async () => { actualizaciones++;
      rda.seccionInterrogatorioPrincipal.antecedentesPersonalesReferidos = clone(update.$set['seccionInterrogatorioPrincipal.antecedentesPersonalesReferidos']);
      rda.fuenteAntecedentesPersonales = clone(update.$set.fuenteAntecedentesPersonales); return rda; } }) },
    './registroRDAInicialService': { guardarRDAInicial: async () => rda }, '../ai/antecedentesCIE10': s, '../../utils/errors': errors,
  });
  const doc = { _id: contexto.interrogatorioId, pacienteId: contexto.pacienteId, tipo: 'primera_vez', fase1: {}, fase2: { version: 1 }, respuestas: { [contexto.questionId]: registro() } };
  await service.guardarAntecedentesPersonalesRDA(doc); assert.equal(actualizaciones, 1);
  assert.equal(rda.seccionInterrogatorioPrincipal.antecedentesPersonalesReferidos[0].sugerencias[0].codigoCIE10, 'I10X');
  assert.deepEqual(rda.seccionInterrogatorioPrincipal.diagnosticos, ['diagnóstico del médico']);
  await service.guardarAntecedentesPersonalesRDA(doc); assert.equal(actualizaciones, 1);
  doc.fase2.version = 2; await service.guardarAntecedentesPersonalesRDA(doc); assert.equal(actualizaciones, 2);
  assert.equal(rda.fuenteAntecedentesPersonales.version, 2);
  const clear = resetFlow.limpiarAntecedentesPersonalesReinicio(rda, doc._id); assert.equal(clear['seccionInterrogatorioPrincipal.antecedentesPersonalesReferidos'], 1);
  rda.seccionInterrogatorioPrincipal.antecedentesPersonalesReferidos[0].textoOriginal = 'Revisado por el médico';
  doc.fase2.version = 3; await service.guardarAntecedentesPersonalesRDA(doc); assert.equal(actualizaciones, 2);
  assert.equal(resetFlow.limpiarAntecedentesPersonalesReinicio(rda, doc._id)['seccionInterrogatorioPrincipal.antecedentesPersonalesReferidos'], undefined);
});
