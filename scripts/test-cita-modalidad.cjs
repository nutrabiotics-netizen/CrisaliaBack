// Controlador real; almacenamiento y auditoría simulados, sin conexión a MongoDB.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const mongoose = require('mongoose');
const id = '696c451533e072d8710bcea8';
const citaBase = { _id: id, medicoId: 'medico', pacienteId: 'paciente', modalidad: 'presencial', estado: 'confirmada', fecha: '2026-11-16', hora: '20:30' };

function harness(cita = citaBase, antesDeGuardar) {
  let guardada = cita ? structuredClone(cita) : null;
  const auditorias = [], escrituras = [], lecturas = [];
  const coincide = query => guardada && Object.entries(query).every(([key, value]) => guardada[key] === value);
  const consulta = obtener => ({ select() { return this; }, lean: async () => obtener() });
  const mocks = {
    mongoose,
    '../../models/Cita': {
      findOne(query) {
        lecturas.push(query);
        return consulta(() => coincide(query) ? structuredClone(guardada) : null);
      },
      findOneAndUpdate(query, update, options) {
        return consulta(() => {
          if (antesDeGuardar) antesDeGuardar(guardada);
          if (!coincide(query)) return null;
          assert.deepEqual(options, { new: true, runValidators: true });
          escrituras.push({ query, update });
          guardada = { ...guardada, ...update.$set };
          return structuredClone(guardada);
        });
      },
    },
    '../../utils/auditoriaHelper': { registrarAccion: async (...args) => auditorias.push(args) },
  };
  const mod = { exports: {} };
  const file = path.resolve(__dirname, '../src/controllers/medico/modalidadCitaController.ts');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    throw new Error(`Importación inesperada: ${name}`);
  }, mod, mod.exports);
  return { auditorias, escrituras, lecturas, get guardada() { return guardada; },
    async invoke(modalidad, reqExtra = {}) {
      const req = { userId: 'medico', userRole: 'medico', params: { citaId: id }, body: { modalidad }, ...reqExtra };
      const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
      await mod.exports.cambiarModalidadCita(req, res);
      return res;
    },
  };
}

for (const modalidad of ['virtual', 'presencial']) {
  test(`guarda ${modalidad}, conserva paciente, fecha y hora y registra el cambio`, async () => {
    const anterior = modalidad === 'virtual' ? 'presencial' : 'virtual';
    const h = harness({ ...citaBase, modalidad: anterior });
    const res = await h.invoke(modalidad, { body: { modalidad, medicoId: 'otro', fecha: '2030-01-01', hora: '00:00', estado: 'completada' } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.modalidad, modalidad);
    assert.deepEqual(h.guardada, { ...citaBase, modalidad, actualizadoPor: 'medico', actualizadoPorRol: 'Medico' });
    assert.equal(h.escrituras.length, 1);
    assert.equal(h.auditorias.length, 1);
    assert.deepEqual(h.auditorias[0].slice(1, 5), ['actualizar', 'Cita', id, { modalidad: anterior }]);
    assert.equal(h.auditorias[0][5].modalidad, modalidad);
  });
}

test('permite citas pendientes y en espera antes de iniciar la consulta', async () => {
  for (const estado of ['pendiente', 'en_espera']) {
    const h = harness({ ...citaBase, estado });
    assert.equal((await h.invoke('virtual')).statusCode, 200);
    assert.equal(h.guardada.estado, estado);
  }
});

test('no cambia citas ajenas ni inexistentes', async () => {
  for (const cita of [null, { ...citaBase, medicoId: 'otro' }]) {
    const h = harness(cita);
    assert.equal((await h.invoke('virtual')).statusCode, 404);
    assert.equal(h.escrituras.length, 0);
    assert.equal(h.auditorias.length, 0);
    assert.equal(h.lecturas[0].medicoId, 'medico');
  }
});

test('requiere autenticación e identificador válido antes de consultar datos', async () => {
  const h = harness();
  assert.equal((await h.invoke('virtual', { userId: undefined })).statusCode, 401);
  assert.equal((await h.invoke('virtual', { params: { citaId: 'invalid' } })).statusCode, 400);
  assert.equal(h.lecturas.length, 0);
});

test('rechaza modalidades inválidas sin modificar la cita', async () => {
  for (const modalidad of [undefined, null, 'mixta', 'VIRTUAL', '', { $ne: 'virtual' }]) {
    const h = harness();
    assert.equal((await h.invoke(modalidad)).statusCode, 400);
    assert.equal(h.escrituras.length, 0);
    assert.equal(h.lecturas.length, 0);
  }
});

test('bloquea cambios durante o después de la consulta y en citas canceladas', async () => {
  for (const estado of ['en_consulta', 'completada', 'cancelada']) {
    const h = harness({ ...citaBase, estado });
    assert.equal((await h.invoke('virtual')).statusCode, 409);
    assert.equal(h.escrituras.length, 0);
    assert.equal(h.auditorias.length, 0);
  }
});

test('repetir la misma modalidad no crea una nueva escritura ni auditoría', async () => {
  const h = harness();
  assert.equal((await h.invoke('presencial')).statusCode, 200);
  assert.equal(h.escrituras.length, 0);
  assert.equal(h.auditorias.length, 0);
});

test('no sobrescribe una cita iniciada o modificada mientras se guardaba', async () => {
  for (const cambio of [{ estado: 'en_consulta' }, { modalidad: 'virtual' }, { estado: 'cancelada' }]) {
    const h = harness(citaBase, guardada => Object.assign(guardada, cambio));
    assert.equal((await h.invoke('virtual')).statusCode, 409);
    assert.equal(h.escrituras.length, 0);
    assert.equal(h.auditorias.length, 0);
    assert.deepEqual(h.guardada, { ...citaBase, ...cambio });
  }
});
