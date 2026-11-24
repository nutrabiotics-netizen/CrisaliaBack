const test = require('node:test');
const assert = require('node:assert/strict');
const { medicamentos: s, cum, load, errors, env } = require('./antecedentes-harness.cjs');
const { harness, complete, accepted } = require('./test-fase1.cjs');
const flow = load('src/services/ai/fase1Flow.ts');
const clone = structuredClone;
const contexto = { pacienteId: 'synthetic-patient', interrogatorioId: 'a'.repeat(24), questionId: 's01_medicamentos_actuales', referencia: 'paciente', generacion: 0 };
const cita = (texto, fuente = 0) => ({ fuente, texto });
const mencion = (texto, busquedas = ['flunaricina 10 mg'], detalles = {}) => ({ evidencias: [cita(texto)], busquedas, clara: true, detalles, pregunta: null });
const interpretar = (texto, menciones, elecciones, aclaraciones = []) => s.interpretarMedicamentos({ texto, aclaraciones }, async (_prompt, datos) => {
  if (datos.recuperar) return { recuperaciones: datos.recuperar.map(m => ({ indice: m.indice, busquedas: [] })) };
  if (datos.menciones) return { elecciones };
  return { estado: 'toma', menciones };
});
const caso = async () => interpretar('flunaricina 10 mg, caja de 20 tabletas, una por la noche', [mencion('flunaricina 10 mg, caja de 20 tabletas, una por la noche', ['flunaricina 10 mg'],
  { concentracion: cita('10 mg'), presentacion: cita('caja de 20 tabletas'), dosis: cita('una'), frecuencia: cita('por la noche') })], [{ indice: 0, codigo: '10042-1', confianza: 'alta' }]);

test('sugiere solo CUM real y preserva concentración, presentación, dosis y frecuencia literales', async () => {
  const { registro, preguntas } = await caso(); const m = registro.medicamentos[0];
  assert.equal(m.codigo, '10042-1'); assert.equal(m.nombre, cum.obtenerCUM('10042-1').nombre); assert.equal(m.estadoCodificacion, 'sugerida');
  assert.equal(m.concentracion, '10 mg'); assert.equal(m.presentacion, 'caja de 20 tabletas'); assert.equal(m.dosis, 'una'); assert.equal(m.frecuencia, 'por la noche');
  assert.equal(preguntas.length, 0); assert(s.esMedicacionReferida(registro));
});
test('recuperación general usa equivalencias y conserva productos sin coincidencia', async () => {
  const texto = 'flunarizina y suplemento de nombre desconocido'; let llamadas = 0;
  const r = await s.interpretarMedicamentos({ texto, aclaraciones: ['No lo sé, no recuerdo más información.'] }, async (_prompt, datos) => {
    llamadas++;
    if (datos.recuperar) return { recuperaciones: [{ indice: 0, busquedas: ['flunaricina'] }] };
    if (datos.menciones) { assert(datos.menciones[0].candidatos.some(c => c.codigo === '10042-1')); return { elecciones: [{ indice: 0, codigo: null, confianza: 'dudosa', pregunta: '¿Qué concentración figura en el envase?' }] }; }
    return { estado: 'toma', menciones: [mencion('flunarizina', ['sincoincidencia']), { ...mencion('suplemento de nombre desconocido', []), clara: false }] };
  });
  assert.equal(llamadas, 3); assert.equal(r.registro.medicamentos.length, 2); assert(r.registro.medicamentos.every(m => m.codigo === null)); assert.equal(r.preguntas.length, 0);
});
test('seis medicamentos desconocidos no se reducen a dos ni se convierten en ausencia', async () => {
  const nombres = ['producto uno', 'producto dos', 'producto tres', 'producto cuatro', 'producto cinco', 'producto seis'];
  const r = await interpretar(nombres.join(', '), nombres.map(n => ({ ...mencion(n, []), clara: false })), [], ['No lo sé']);
  assert.equal(r.registro.medicamentos.length, 6); assert.equal(r.registro.estado, 'toma'); assert.equal(r.preguntas.length, 0);
  assert.deepEqual(clone(r.registro.medicamentos.map(m => m.nombre)), nombres);
});
test('aclaraciones cronológicas conservan evidencia y sustituyen la concentración corregida', async () => {
  const r = await interpretar('flunaricina', [{ ...mencion('flunaricina'), evidencias: [cita('flunaricina'), cita('creo que de 5 mg', 1), cita('es de 10 mg, caja de 20 tabletas', 2)],
    detalles: { concentracion: cita('10 mg', 2), presentacion: cita('caja de 20 tabletas', 2) } }], [{ indice: 0, codigo: '10042-1', confianza: 'alta' }], ['creo que de 5 mg', 'es de 10 mg, caja de 20 tabletas']);
  assert.equal(r.registro.medicamentos[0].codigo, '10042-1'); assert.equal(r.registro.medicamentos[0].concentracion, '10 mg'); assert.equal(r.registro.aclaraciones.length, 2);
});
test('no asigna una concentración incompatible, ni una presentación arbitraria del mismo nombre', async () => {
  for (const detalles of [{}, { presentacion: cita('caja de 20 tabletas') }, { concentracion: cita('10 mg') }]) {
    const r = await interpretar('flunaricina 10 mg, caja de 20 tabletas', [mencion('flunaricina 10 mg, caja de 20 tabletas', ['flunaricina'], detalles)], [{ indice: 0, codigo: '10042-1', confianza: 'alta' }]);
    assert.equal(r.registro.medicamentos[0].codigo, null, 'Un candidato único no completa los detalles faltantes');
  }
  for (const concentracion of ['5 mg', '10 ml', '10 mcg']) {
    const r = await interpretar(`flunaricina ${concentracion}, caja de 20 tabletas`, [mencion(`flunaricina ${concentracion}`, ['flunaricina'], { concentracion: cita(concentracion), presentacion: cita('caja de 20 tabletas') })], [{ indice: 0, codigo: '10042-1', confianza: 'alta' }]);
    assert.equal(r.registro.medicamentos[0].codigo, null); assert.equal(r.preguntas.length, 1);
  }
  const r = await interpretar('ibuprofeno 500 mg tabletas', [mencion('ibuprofeno 500 mg tabletas', ['ibuprofeno 500 mg tabletas'], { concentracion: cita('500 mg') })], [{ indice: 0, codigo: '10045-1', confianza: 'alta' }]);
  assert.equal(r.registro.medicamentos[0].codigo, null); assert.equal(r.preguntas.length, 1);
  const ajeno = await interpretar('flunaricina; otro producto con código 10042-1', [mencion('flunaricina')], [{ indice: 0, codigo: '10042-1', confianza: 'alta' }]);
  assert.equal(ajeno.registro.medicamentos[0].codigo, null, 'Un CUM de otra mención no completa la identificación de esta');
});
test('no infiere medicamento por indicación, ni utiliza un resultado truncado como coincidencia única', async () => {
  let llamadas = 0;
  const r = await s.interpretarMedicamentos({ texto: 'una pastilla para la presión', aclaraciones: [] }, async () => {
    assert.equal(++llamadas, 1); return { estado: 'toma', menciones: [{ ...mencion('una pastilla para la presión', []), clara: false, pregunta: '¿Recuerdas el nombre del envase?' }] };
  });
  assert.equal(r.registro.medicamentos[0].codigo, null); assert.equal(r.preguntas.length, 1);
  const candidatos = cum.buscarCandidatosCUM(['acetaminofen']); assert.equal(candidatos.hayMas, true); assert.equal(candidatos.candidatos.length, 60);
  const ambiguo = await interpretar('acetaminofen', [mencion('acetaminofen', ['acetaminofen'])], [{ indice: 0, codigo: candidatos.candidatos[0].codigo, confianza: 'alta' }]);
  assert.equal(ambiguo.registro.medicamentos[0].codigo, null);
});
test('ausencia y desconocimiento explícitos permanecen distintos y se pueden guardar', async () => {
  for (const [texto, estado] of [['No tomo medicamentos', 'no_toma'], ['No sé si tomo medicamentos', 'no_sabe']]) {
    const r = await s.interpretarMedicamentos({ texto, aclaraciones: [] }, async () => ({ estado, menciones: [] }));
    assert.equal(r.registro.estado, estado); assert.equal(r.registro.medicamentos.length, 0); assert.equal(r.preguntas.length, 0);
    assert.equal(s.leerMedicamentos(s.firmarMedicamentos(contexto, r.registro), contexto).estado, estado);
  }
});
test('rechaza códigos inventados, evidencia o detalles inventados y recuperación mal formada', async () => {
  await assert.rejects(interpretar('flunaricina', [mencion('flunaricina')], [{ indice: 0, codigo: 'E109', confianza: 'alta' }]), /candidatos/);
  await assert.rejects(interpretar('flunaricina', [mencion('otra cosa')], []), /respaldo/);
  await assert.rejects(interpretar('flunaricina', [mencion('flunaricina', [], { concentracion: cita('10 mg') })], []), /respaldo/);
  await assert.rejects(s.interpretarMedicamentos({ texto: 'producto', aclaraciones: [] }, async (_p, d) => d.recuperar ? { recuperaciones: [] } : { estado: 'toma', menciones: [mencion('producto', [])] }), /Recuperación inválida/);
});
test('comprobante no admite otra cuenta, pregunta, generación o comprobantes de enfermedades', async () => {
  const { registro } = await caso(); const token = s.firmarMedicamentos(contexto, registro);
  for (const [key, value] of Object.entries({ pacienteId: 'otro', interrogatorioId: 'b'.repeat(24), questionId: 's01_enfermedades_familia', referencia: '01:madre', generacion: 1 }))
    assert.throws(() => s.leerMedicamentos(token, { ...contexto, [key]: value }), /cambió o venció/);
  const wrong = require('jsonwebtoken').sign({ proposito: 'antecedente_referido', ...contexto, registro }, env.JWT_SECRET);
  assert.throws(() => s.leerMedicamentos(wrong, contexto));
  assert.throws(() => s.leerMedicamentos(token.slice(0, -5) + 'xxxxx', contexto));
});
test('fase 1 guarda el registro firmado, reintenta sin duplicar y mantiene compatibilidad al reanudar', async () => {
  const { registro } = await caso(); const h = harness({ interpret: accepted }); await complete(h, contexto.questionId);
  assert.notEqual(h.last.busqueda.semantica, true);
  const result = await h.send(registro.textoOriginal, { valorRespuesta: { comprobante: s.firmarMedicamentos(contexto, registro) } });
  assert.equal(result.statusCode, 200); assert.deepEqual(h.doc.respuestas.s01_medicamentos_actuales, clone(registro));
  assert.equal(h.last.questionId, 's03_sintomas_tabla'); assert(flow.normalizarRespuesta(h.doc.fase1.preguntas.find(q => q.id === contexto.questionId), registro).valido);
  const version = h.doc.fase1.version; await h.send(registro.textoOriginal, result.request); assert.equal(h.doc.fase1.version, version);
  const antigua = harness({ interpret: accepted }); await complete(antigua, contexto.questionId);
  const doc = antigua.doc; doc.fase1.preguntas.find(q => q.id === contexto.questionId).search.semantica = true; doc.fase1.ultimaRespuesta.busqueda.semantica = true;
  const respuestasAnteriores = clone(doc.respuestas);
  const reanudada = harness({ doc }); await reanudada.send('', { accion: 'reanudar' });
  assert.notEqual(reanudada.last.busqueda.semantica, true);
  assert.equal(reanudada.last.busqueda.placeholder, 'Busca un medicamento o su código CUM');
  assert.deepEqual(reanudada.doc.respuestas, respuestasAnteriores); assert.equal(reanudada.aiCalls, 0);
});
test('RDA conserva CUM, detalles y palabras originales sin sobrescribir antecedentes revisados', async () => {
  const rda = load('src/services/medico/registroRDA/fase1RDA.ts');
  const { registro } = await caso(); const proyectado = rda.proyectarFase1RDA({ s01_medicamentos_actuales: registro });
  assert.equal(proyectado.antecedentesFarmacologicos[0].codigoCUMS, '10042-1'); assert.equal(proyectado.antecedentesFarmacologicos[0].concentracion, '10 mg');
  assert.equal(proyectado.declaracionMedicamentos.textoOriginal, registro.textoOriginal);
  assert.deepEqual(clone(rda.completarInicialRDA({ estadoAntecedentesFarmacologicos: 'toma', antecedentesFarmacologicos: [{ codigoCUMS: null, nombre: 'Revisado por MD' }] }, proyectado)), {});
  const unknown = rda.proyectarFase1RDA({ s01_medicamentos_actuales: { estado: 'no_sabe', textoOriginal: 'No sé', aclaraciones: [], medicamentos: [] } });
  assert.equal(unknown.estadoAntecedentesFarmacologicos, 'no_sabe'); assert.equal(unknown.antecedentesFarmacologicos.length, 0);
});
test('endpoint restringe lectura y análisis a la cuenta y pregunta vigente; no registra texto en errores', async () => {
  let llamadas = 0, doc = { estado: 'en_proceso', fase1: { estado: 'recopilando', preguntaId: contexto.questionId } };
  const { registro } = await caso();
  const c = load('src/controllers/paciente/medicamentosReferidosController.ts', {
    '../../models/Interrogatorio': { findOne: q => ({ select: () => ({ lean: async () => q.pacienteId === contexto.pacienteId ? doc : null }) }) },
    '../../utils/errors': errors, '../../services/ai/medicamentosReferidos': { ...s, interpretarMedicamentos: async () => { llamadas++; return { registro, preguntas: [] }; } },
  });
  const send = async (userId = contexto.pacienteId, body = {}) => {
    const res = { code: 200, status(n) { this.code = n; return this; }, setHeader() {}, json(v) { this.body = v; } };
    await c.interpretarMedicamentosReferidos({ userId, body: { interrogatorioId: contexto.interrogatorioId, questionId: contexto.questionId, texto: registro.textoOriginal, ...body } }, res); return res;
  };
  assert.equal((await send('otro')).code, 404); assert.equal((await send(contexto.pacienteId, { aclaraciones: Array(s.MAX_ACLARACIONES_MEDICAMENTOS + 1).fill('dato') })).code, 400); assert.equal(llamadas, 0);
  assert.equal((await send(contexto.pacienteId, { finalizarPendientes: 'si' })).code, 400);
  assert.equal((await send()).code, 200); assert.equal(llamadas, 1);
  doc.fase1.preguntaId = 's03_sintomas_tabla'; assert.equal((await send()).code, 409); assert.equal(llamadas, 1);
});
test('dos aclaraciones no cierran una codificación pendiente: pide unidad y después presentación', async () => {
  const texto = 'flunaricina';
  const aclaraciones = ['la concentración dice 10', 'son tabletas normales', 'la etiqueta indica 10 mg', 'caja de 20 tabletas, dos blísteres de diez'];
  for (const cantidad of [2, 3, 4]) {
    const r = await s.interpretarMedicamentos({ texto, aclaraciones: aclaraciones.slice(0, cantidad) }, async (_p, datos) => {
      if (datos.menciones) return { elecciones: [{ indice: 0, codigo: '10042-1', confianza: 'alta' }] };
      return { estado: 'toma', menciones: [{ ...mencion(texto), evidencias: datos.fuentes.map(f => cita(f.texto, f.indice)), detalles: {
        concentracion: cantidad >= 3 ? cita('10 mg', 3) : cita('10', 1), forma: cita('tabletas normales', 2),
        ...(cantidad === 4 ? { presentacion: cita(aclaraciones[3], 4) } : {}),
      } }] };
    });
    assert.equal(r.registro.aclaraciones.length, cantidad);
    if (cantidad < 4) { assert.equal(r.registro.medicamentos[0].codigo, null); assert.equal(r.preguntas.length, 1); assert.match(r.preguntas[0], cantidad === 2 ? /letras aparecen después de 10/ : /unidades contiene el envase/); }
    else {
      assert.equal(r.registro.medicamentos[0].codigo, '10042-1'); assert.equal(r.preguntas.length, 0);
      assert.equal(s.leerMedicamentos(s.firmarMedicamentos(contexto, r.registro), contexto).aclaraciones.length, 4);
    }
  }
});
test('un número sin unidad no autoriza CUM aunque la presentación se conozca', async () => {
  const texto = 'flunaricina de 10, caja de 20 tabletas';
  const r = await interpretar(texto, [mencion(texto, ['flunaricina'], { concentracion: cita('10'), presentacion: cita('caja de 20 tabletas') })], [{ indice: 0, codigo: '10042-1', confianza: 'alta' }]);
  assert.equal(r.registro.medicamentos[0].codigo, null); assert.match(r.preguntas[0], /letras aparecen después de 10/);
});

test('agrupa la unidad faltante, reconoce lo ya dicho y mantiene estable la aclaración repetida', async () => {
  const texto = 'tomo acetaminofen y vitamina c';
  const respuestas = ['ambas de 500 de tabletas', 'ambos de 500', 'ambos son mg'];
  const resultados = [];
  for (const cantidad of [1, 2, 3]) {
    const r = await s.interpretarMedicamentos({ texto, aclaraciones: respuestas.slice(0, cantidad) }, async (_p, datos) => {
      if (datos.recuperar) return { recuperaciones: datos.recuperar.map(m => ({ indice: m.indice, busquedas: [] })) };
      if (datos.menciones) return { elecciones: datos.menciones.map(m => ({ indice: m.indice, codigo: null, confianza: 'dudosa' })) };
      return { estado: 'toma', menciones: ['tomo acetaminofen', 'vitamina c'].map(nombre => ({
        ...mencion(nombre, [nombre.replace('tomo ', '')]),
        detalles: { concentracion: cantidad === 3 ? [cita('500', 2), cita('mg', 3)] : cita('500', cantidad), forma: cita('tabletas', 1) },
      })) };
    });
    resultados.push(r); assert.equal(r.registro.medicamentos.length, 2);
    assert(r.registro.medicamentos.every(m => m.codigo === null));
    if (cantidad < 3) {
      assert.equal(r.preguntas.length, 1); assert.match(r.preguntas[0], /Ya anotamos 500/);
      assert.match(r.preguntas[0], /«acetaminofen» y «vitamina c»/);
      assert.match(r.preguntas[0], /letras aparecen después de 500/);
      assert(r.registro.medicamentos.every(m => m.concentracion === '500' && m.forma === 'tabletas'));
    } else {
      assert(r.registro.medicamentos.every(m => m.concentracion === '500 mg'));
      assert(!r.preguntas.some(p => p.includes('letras aparecen')));
    }
  }
  assert.equal(resultados[0].aclaracionesSolicitadas[0].clave, resultados[1].aclaracionesSolicitadas[0].clave);
  assert.notEqual(resultados[1].aclaracionesSolicitadas[0].clave, resultados[2].aclaracionesSolicitadas[0].clave);
});

test('completar la unidad en otro turno permite CUM sin inventar una cita ni atribuirla a otro producto', async () => {
  const r = await interpretar('flunaricina de 10 en caja de 20 tabletas y suplemento de 500', [
    mencion('flunaricina de 10 en caja de 20 tabletas', ['flunaricina 10 mg'], {
      concentracion: [cita('10'), cita('mg', 1)], presentacion: cita('caja de 20 tabletas'),
    }),
    { ...mencion('suplemento de 500', [], { concentracion: cita('500') }), clara: false },
  ], [{ indice: 0, codigo: '10042-1', confianza: 'alta' }], ['la flunaricina dice mg']);
  assert.equal(r.registro.medicamentos[0].concentracion, '10 mg'); assert.equal(r.registro.medicamentos[0].codigo, '10042-1');
  assert.equal(r.registro.medicamentos[1].concentracion, '500'); assert.equal(r.registro.medicamentos[1].codigo, null);
  const rda = load('src/services/medico/registroRDA/fase1RDA.ts').proyectarFase1RDA({ s01_medicamentos_actuales: r.registro });
  assert.equal(rda.antecedentesFarmacologicos[0].codigoCUMS, '10042-1');
  assert.equal(rda.antecedentesFarmacologicos[0].concentracion, '10 mg');
  await assert.rejects(interpretar('flunaricina de 10', [mencion('flunaricina', ['flunaricina'], {
    concentracion: [cita('10'), cita('mg', 1)],
  })], [], ['no recuerdo la unidad']), /respaldo/);
});

test('repetir el mismo número dentro de las citas no cambia el dato que falta', async () => {
  const entradas = ['Es de 10.', 'Repito, de 10.'];
  const previa = await interpretar('flunaricina', [mencion('flunaricina', ['flunaricina'], { concentracion: cita(entradas[0], 1) })],
    [{ indice: 0, codigo: null, confianza: 'dudosa' }], entradas.slice(0, 1));
  const repetida = await interpretar('flunaricina', [mencion('flunaricina', ['flunaricina'], { concentracion: entradas.map((t, i) => cita(t, i + 1)) })],
    [{ indice: 0, codigo: null, confianza: 'dudosa' }], entradas);
  assert.match(repetida.preguntas[0], /letras aparecen después de 10/);
  assert.equal(repetida.aclaracionesSolicitadas[0].clave, previa.aclaracionesSolicitadas[0].clave);
  assert.equal(repetida.registro.medicamentos[0].codigo, null);
});

test('frases literales separadas completan la unidad sin deducirla de una dosis, envase o alternativas', async () => {
  for (const aclaraciones of [
    ['Es de 10.', 'Repito, de 10.', 'Las letras son mg.'],
    ['Es de 10.', 'Las letras son mg.'],
    ['Es de 10.', 'Repito, de 10.'],
    ['Son 10 tabletas.', 'Las letras son mg.'],
    ['Tomo 10 al día.', 'Las letras son mg.'],
    ['Creo que de 10.', 'Las letras son mg.'],
    ['Puede ser 5 o 10.', 'Las letras son mg.'],
  ]) {
    const r = await interpretar('flunaricina en caja de 20 tabletas', [mencion('flunaricina', ['flunaricina'], {
      concentracion: aclaraciones.map((t, i) => cita(t, i + 1)), presentacion: cita('caja de 20 tabletas'),
    })], [{ indice: 0, codigo: '10042-1', confianza: 'alta' }], aclaraciones);
    const completa = aclaraciones[0] === 'Es de 10.' && aclaraciones.includes('Las letras son mg.');
    assert.equal(r.registro.medicamentos[0].codigo, completa ? '10042-1' : null);
    assert.equal(r.registro.medicamentos[0].concentracion, completa ? '10 mg' : aclaraciones.join(' '));
    assert.deepEqual(clone(r.registro.aclaraciones), aclaraciones);
  }
});
test('alcanzar el límite no aprueba la respuesta: solo el paciente puede finalizar con códigos pendientes', async () => {
  const input = { texto: 'flunaricina', aclaraciones: Array.from({ length: s.MAX_ACLARACIONES_MEDICAMENTOS }, (_, i) => `detalle ${i + 1}`) };
  const proveedor = async (_p, datos) => datos.menciones ? { elecciones: [{ indice: 0, codigo: null, confianza: 'dudosa' }] }
    : { estado: 'toma', menciones: [{ ...mencion(input.texto), evidencias: datos.fuentes.map(f => cita(f.texto, f.indice)) }] };
  const r = await s.interpretarMedicamentos(input, proveedor);
  assert.equal(r.preguntas.length, 1); assert.equal(r.registro.medicamentos[0].codigo, null);
  const cerrado = await s.interpretarMedicamentos({ ...input, finalizarPendientes: true }, proveedor);
  assert.equal(cerrado.preguntas.length, 0); assert.equal(cerrado.registro.medicamentos[0].codigo, null);
  assert.deepEqual(clone(cerrado.registro.aclaraciones), input.aclaraciones);
  assert.equal(s.leerMedicamentos(s.firmarMedicamentos(contexto, cerrado.registro), contexto).aclaraciones.length, s.MAX_ACLARACIONES_MEDICAMENTOS);
});

test('datos completos sin CUM no generan preguntas repetidas ni cambian la cantidad para ajustarla al catálogo', async () => {
  const texto = 'tomo acetaminofen y vitamina c';
  const aclaraciones = ['tabletas 500 mg via oral', 'pone acetaminofen 10 tabletas 500mg via oral\nvitamina c 500mg 10 tabletas',
    'acetaminofen viene 10 tabletas\nen vitamina c es una tableta masticable', 'el de acetaminofen dice que es genfar\ny vitamina c dice que es tq'];
  for (const sinCandidatosVitamina of [false, true]) {
    const r = await s.interpretarMedicamentos({ texto, aclaraciones }, async (_p, datos) => {
      if (datos.recuperar) return { recuperaciones: datos.recuperar.map(m => ({ indice: m.indice, busquedas: [] })) };
      if (datos.menciones) return { elecciones: datos.menciones.map(m => ({ indice: m.indice, codigo: null, confianza: 'dudosa',
        pregunta: m.indice === 0 ? '¿Tiene 60, 100 o 200 tabletas?' : '¿Qué nombre y presentación aparecen en el envase?' })) };
      return { estado: 'toma', menciones: ['acetaminofen', 'vitamina c'].map((nombre, i) => ({
        ...mencion(nombre, i && sinCandidatosVitamina ? [] : [nombre]),
        evidencias: [cita(nombre), cita(i ? 'vitamina c 500mg 10 tabletas' : 'pone acetaminofen 10 tabletas 500mg via oral', 2),
          cita(i ? 'una tableta masticable' : 'acetaminofen viene 10 tabletas', 3), cita(i ? 'tq' : 'genfar', 4)],
        detalles: { concentracion: cita('500mg', 2), forma: cita(i ? 'tableta masticable' : 'tabletas', i ? 3 : 1),
          presentacion: cita('10 tabletas', 2), marca: cita(i ? 'tq' : 'genfar', 4) },
      })) };
    });
    assert.equal(r.preguntas.length, 0); assert.equal(r.registro.medicamentos.length, 2);
    assert(r.registro.medicamentos.every(m => m.codigo === null && m.presentacion === '10 tabletas' && m.concentracion === '500mg'));
    assert.deepEqual(clone(r.registro.medicamentos.map(m => m.marca)), ['genfar', 'tq']);
    assert.equal(r.registro.medicamentos[1].forma, 'tableta masticable');
    assert.deepEqual(clone(s.leerMedicamentos(s.firmarMedicamentos(contexto, r.registro), contexto).aclaraciones), aclaraciones);
    const proyectado = load('src/services/medico/registroRDA/fase1RDA.ts').proyectarFase1RDA({ s01_medicamentos_actuales: r.registro });
    assert.deepEqual(clone(proyectado.antecedentesFarmacologicos.map(m => m.marca)), ['genfar', 'tq']);
    const mongoose = require('mongoose');
    const Model = mongoose.models.RegistroRDA || load('src/models/RegistroRDA.ts', { mongoose }).default;
    const doc = new Model({ tipoRegistro: 'inicial', pacienteId: 'b'.repeat(24), estado: 'borrador', seccionInterrogatorioInicial: proyectado });
    await doc.validate();
    assert.deepEqual(doc.toObject().seccionInterrogatorioInicial.antecedentesFarmacologicos.map(m => m.marca), ['genfar', 'tq']);
  }
});

test('pregunta solo la marca faltante y deja de preguntar al recibirla, sin atribuir un fabricante al CUM genérico', async () => {
  const texto = 'flunaricina 10 mg, caja de 20 tabletas';
  for (const conMarca of [false, true]) {
    const r = await interpretar(texto, [mencion(texto, ['flunaricina'], { concentracion: cita('10 mg'), forma: cita('tabletas'),
      presentacion: cita('caja de 20 tabletas'), ...(conMarca ? { marca: cita('Laboratorio de prueba', 1) } : {}) })],
      [{ indice: 0, codigo: conMarca ? '10042-1' : null, confianza: conMarca ? 'alta' : 'dudosa', pregunta: '¿Cuántas tabletas tiene la caja?' }],
      conMarca ? ['Laboratorio de prueba'] : []);
    assert.equal(r.registro.medicamentos[0].codigo, null);
    if (!conMarca) { assert.equal(r.preguntas.length, 1); assert.match(r.preguntas[0], /marca o laboratorio/); }
    else { assert.equal(r.preguntas.length, 0); assert.equal(r.registro.medicamentos[0].marca, 'Laboratorio de prueba'); }
  }
});

test('no encontrar un producto conocido en el catálogo no pide otra vez su nombre', async () => {
  const r = await interpretar('suplemento de prueba sin catálogo', [mencion('suplemento de prueba sin catálogo', [])], []);
  assert.equal(r.preguntas.length, 0); assert.equal(r.registro.medicamentos[0].codigo, null);
  const desconocido = await interpretar('una pastilla de nombre desconocido', [{ ...mencion('una pastilla de nombre desconocido', []), clara: false }], []);
  assert.equal(desconocido.preguntas.length, 1); assert.equal(desconocido.registro.medicamentos[0].codigo, null);
});
test('desconocer un detalle o haber dudado antes no cierra automáticamente los demás', async () => {
  for (const aclaraciones of [['No sé la marca, pero son tabletas'], ['No lo sé', 'la concentración dice 10']]) {
    const r = await interpretar('flunaricina', [mencion('flunaricina')], [{ indice: 0, codigo: null, confianza: 'dudosa' }], aclaraciones);
    assert.equal(r.preguntas.length, 1); assert.equal(r.registro.medicamentos[0].codigo, null);
  }
});
test('el esquema RDA persiste detalles y declaración, incluido desconocimiento sin convertirlo en ausencia', async () => {
  const mongoose = require('mongoose');
  const Model = mongoose.models.RegistroRDA || load('src/models/RegistroRDA.ts', { mongoose }).default;
  const { registro } = await caso();
  const seccion = load('src/services/medico/registroRDA/fase1RDA.ts').proyectarFase1RDA({ s01_medicamentos_actuales: registro });
  const doc = new Model({ tipoRegistro: 'inicial', pacienteId: 'b'.repeat(24), estado: 'borrador', seccionInterrogatorioInicial: seccion });
  await doc.validate();
  const guardado = doc.toObject().seccionInterrogatorioInicial;
  assert.equal(guardado.declaracionMedicamentos.textoOriginal, registro.textoOriginal);
  assert.equal(guardado.antecedentesFarmacologicos[0].concentracion, '10 mg'); assert.equal(guardado.antecedentesFarmacologicos[0].estadoCodificacion, 'sugerida');
  doc.seccionInterrogatorioInicial.estadoAntecedentesFarmacologicos = 'no_sabe';
  doc.seccionInterrogatorioInicial.antecedentesFarmacologicos = []; await doc.validate();
  assert.equal(doc.toObject().seccionInterrogatorioInicial.estadoAntecedentesFarmacologicos, 'no_sabe');
});
