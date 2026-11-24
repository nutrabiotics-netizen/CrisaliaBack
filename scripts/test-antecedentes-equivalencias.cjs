// Catálogo y servicio reales; proveedor simulado, sin red ni datos de pacientes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { semantic, cie10 } = require('./antecedentes-harness.cjs');
const clone = structuredClone;
const casos = [
  ['presión alta', 'I10', 'I10X'],
  ['tiroides lenta', 'E03', 'E039'],
  ['EPOC', 'J44', 'J449'],
  ['hígado graso no alcohólico', 'K76', 'K760'],
  ['migraña sin aura', 'G43', 'G430'],
  ['hipertencion', 'I10', 'I10X'],
];
const mencion = (texto, referenciasCIE10 = [], busquedas = []) => ({
  evidencias: [{ fuente: 0, texto }], clara: true, busquedas, referenciasCIE10, pregunta: null,
});

for (const ambito of ['personal', 'familiar']) {
  test(`${ambito}: equivalencias, abreviaturas y erratas recuperan candidatos reales para distintas enfermedades`, async () => {
    for (const [texto, categoria, codigo] of casos) {
      let llamadas = 0;
      const r = await semantic.interpretarAntecedente({ texto, aclaraciones: [], ambito }, async (_prompt, datos) => {
        llamadas++; assert.equal(datos.ambito, ambito);
        if (!datos.menciones) return { estado: 'referidas', menciones: [mencion(texto, [categoria], [texto])] };
        assert(datos.menciones[0].candidatos.some(c => c.codigo === codigo));
        assert(datos.menciones[0].candidatos.every(c => cie10.obtenerCIE10(c.codigo)?.nombre === c.nombre));
        return { elecciones: [{ indice: 0, codigo, confianza: 'alta' }] };
      });
      assert.equal(llamadas, 2); assert.equal(r.registro.textoOriginal, texto); assert.equal(r.preguntas.length, 0);
      assert.equal(r.registro.enfermedades[0].codigo, codigo);
      assert.equal(r.registro.enfermedades[0].estadoCodificacion, 'sugerida');
      assert.equal(r.registro.enfermedades[0].requiereRevisionMedica, true);
    }
  });

  test(`${ambito}: una única reformulación recupera varias enfermedades sin coincidencia literal`, async () => {
    const texto = 'tiroides lenta y presión alta';
    let llamadas = 0;
    const r = await semantic.interpretarAntecedente({ texto, aclaraciones: [], ambito }, async (_prompt, datos) => {
      llamadas++;
      if (datos.recuperar) {
        assert.deepEqual(clone(datos.recuperar.map(m => m.indice)), [0, 1]);
        assert.deepEqual(clone(datos.fuentes), [{ indice: 0, texto }]);
        return { recuperaciones: [
          { indice: 1, busquedas: ['hipertensión esencial'], referenciasCIE10: [] },
          { indice: 0, busquedas: [], referenciasCIE10: ['E03'] },
        ] };
      }
      if (datos.menciones) {
        assert(datos.menciones[0].candidatos.some(c => c.codigo === 'E039'));
        assert(!datos.menciones[0].candidatos.some(c => c.codigo === 'I10X'));
        assert(datos.menciones[1].candidatos.some(c => c.codigo === 'I10X'));
        return { elecciones: [{ indice: 0, codigo: 'E039', confianza: 'alta' }, { indice: 1, codigo: 'I10X', confianza: 'alta' }] };
      }
      return { estado: 'referidas', menciones: [mencion('tiroides lenta', [], ['sincoincidencialiteral']), mencion('presión alta', [], ['sincoincidencialiteral'])] };
    });
    assert.equal(llamadas, 3); assert.equal(r.preguntas.length, 0);
    assert.deepEqual(clone(r.registro.enfermedades.map(e => e.codigo)), ['E039', 'I10X']);
  });

  test(`${ambito}: la duda impide seleccionar aunque la IA proponga una categoría`, async () => {
    let llamadas = 0;
    const r = await semantic.interpretarAntecedente({ texto: 'creo que es tiroides lenta', aclaraciones: [], ambito }, async () => {
      assert.equal(++llamadas, 1, 'No debe recuperar ni seleccionar una mención incierta');
      return { estado: 'referidas', menciones: [{ ...mencion('creo que es tiroides lenta', ['E03']), clara: false, pregunta: '¿Recuerdas qué diagnóstico te dieron?' }] };
    });
    assert.equal(r.registro.enfermedades[0].codigo, null); assert.equal(r.preguntas.length, 1);
  });

  test(`${ambito}: una referencia equivocada es solo una pista; el selector puede rechazarla`, async () => {
    const r = await semantic.interpretarAntecedente({ texto: 'tiroides lenta', aclaraciones: [], ambito }, async (prompt, datos) => {
      if (!datos.menciones) return { estado: 'referidas', menciones: [mencion('tiroides lenta', ['G43'])] };
      assert.match(prompt, /NO son evidencia clínica/);
      assert(datos.menciones[0].candidatos.every(c => c.codigo.startsWith('G43')));
      return { elecciones: [{ indice: 0, codigo: null, confianza: 'dudosa', pregunta: '¿Recuerdas el diagnóstico que te dieron?' }] };
    });
    assert.equal(r.registro.enfermedades[0].codigo, null); assert.equal(r.preguntas.length, 1);
  });

  test(`${ambito}: desconocer el nombre de una enfermedad no descarta el relato ambiguo ni causa un error`, async () => {
    const texto = 'Algo del corazón, pero no sé qué enfermedad es.';
    let llamadas = 0;
    const r = await semantic.interpretarAntecedente({ texto, aclaraciones: [], ambito }, async () => {
      assert.equal(++llamadas, 1);
      return { estado: 'no_sabe', menciones: [{ ...mencion(texto), clara: false, pregunta: '¿Recuerdas el nombre aproximado?' }] };
    });
    assert.equal(r.registro.estado, 'referidas'); assert.equal(r.registro.textoOriginal, texto);
    assert.equal(r.registro.enfermedades[0].codigo, null); assert.equal(r.preguntas.length, 1);
    assert(semantic.esAntecedenteReferido(r.registro));
  });
}

test('la tolerancia a incertidumbre no convierte una ausencia o contradicción en una enfermedad codificada', async () => {
  for (const estado of ['ninguna', 'no_sabe']) {
    await assert.rejects(semantic.interpretarAntecedente({ texto: 'tiroides lenta', aclaraciones: [], ambito: 'personal' }, async () =>
      ({ estado, menciones: [mencion('tiroides lenta', ['E03'])] })), /Extracción inválida/);
  }
  await assert.rejects(semantic.interpretarAntecedente({ texto: 'no sé', aclaraciones: [], ambito: 'personal' }, async () =>
    ({ estado: 'no_sabe', menciones: [{ ...mencion('algo del corazón'), clara: false }] })), /Mención sin respaldo/);
});

test('sin equivalencia fiable se conserva el relato; la recuperación no se repite ni inventa códigos', async () => {
  let llamadas = 0;
  const r = await semantic.interpretarAntecedente({ texto: 'un diagnóstico que no recuerdo', aclaraciones: [], ambito: 'personal' }, async (_prompt, datos) => {
    assert(++llamadas <= 2);
    if (datos.recuperar) return { recuperaciones: [{ indice: 0, busquedas: [], referenciasCIE10: ['Z99.99'] }] };
    return { estado: 'referidas', menciones: [mencion('un diagnóstico que no recuerdo', ['Z99.99'])] };
  });
  assert.equal(llamadas, 2); assert.equal(r.registro.enfermedades[0].codigo, null);
  assert.equal(r.registro.textoOriginal, 'un diagnóstico que no recuerdo'); assert.equal(r.preguntas.length, 1);
});

test('rechaza recuperaciones mal formadas, índices ajenos o duplicados y referencias excesivas', async () => {
  const valida = { indice: 0, busquedas: [], referenciasCIE10: ['E03'] };
  for (const recuperaciones of [null, [], [{ ...valida, indice: 3 }], [valida, valida],
    [{ ...valida, busquedas: [''] }], [{ ...valida, busquedas: Array(7).fill('hipotiroidismo') }],
    [{ ...valida, referenciasCIE10: ['E03', 'I10', 'G43', 'J44'] }], [{ ...valida, referenciasCIE10: [1] }]]) {
    await assert.rejects(semantic.interpretarAntecedente({ texto: 'tiroides lenta', aclaraciones: [], ambito: 'personal' }, async (_prompt, datos) => {
      if (datos.recuperar) return { recuperaciones };
      return { estado: 'referidas', menciones: [mencion('tiroides lenta')] };
    }), /Recuperación inválida/);
  }
});

test('una recuperación no puede devolver un código externo a sus candidatos', async () => {
  await assert.rejects(semantic.interpretarAntecedente({ texto: 'tiroides lenta', aclaraciones: [], ambito: 'familiar' }, async (_prompt, datos) => {
    if (datos.recuperar) return { recuperaciones: [{ indice: 0, busquedas: [], referenciasCIE10: ['E03'] }] };
    if (datos.menciones) return { elecciones: [{ indice: 0, codigo: 'G430', confianza: 'alta' }] };
    return { estado: 'referidas', menciones: [mencion('tiroides lenta')] };
  }), /Código fuera de candidatos/);
});
