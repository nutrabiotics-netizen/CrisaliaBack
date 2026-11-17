const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const cita = (_id, hora, extra = {}) => ({ _id, pacienteId: 'paciente', medicoId: 'medico',
  fecha: new Date('2026-11-16T05:00:00Z'), hora, estado: 'confirmada', ...extra });

function harness(citas, ahora = '2026-11-16T22:00:00Z') {
  class FechaFija extends Date { constructor(...args) { super(...(args.length ? args : [ahora])); } }
  class ObjectId { constructor(value) { this.value = value; } toString() { return this.value; } }
  function matches(row, query) {
    return Object.entries(query).every(([key, value]) => {
      if (value?.$gte) return row[key] >= value.$gte;
      if (value?.$in) return value.$in.includes(row[key]);
      return String(row[key]) === String(value);
    });
  }
  function chain(rows, one = false) {
    return { select() { return this; }, limit() { return this; },
      sort(order) { rows = [...rows].sort((a, b) => {
        for (const [key, direction] of Object.entries(order)) {
          if (a[key] < b[key]) return -direction;
          if (a[key] > b[key]) return direction;
        }
        return 0;
      }); return this; },
      lean: async () => one ? rows[0] ?? null : rows,
    };
  }
  const paciente = { _id: 'paciente', nombre: 'Paciente de prueba' };
  const mocks = {
    mongoose: { Types: { ObjectId } },
    '../../../models/Cita': { distinct: async () => ['paciente'],
      find: query => chain(citas.filter(c => matches(c, query))),
      findOne: query => chain(citas.filter(c => matches(c, query)), true),
    },
    '../../../models/Paciente': { findById: () => chain([paciente], true) },
    '../../../models/CompartirHistorial': { find: () => chain([]) },
    '../../../models/Interrogatorio': { find: () => chain([]), findOne: () => chain([], true) },
    '../../../models/HistoriaClinica': { find: () => chain([]), countDocuments: async () => 0 },
    '../../../utils/errors': { handleError(error) { throw error; } },
  };
  function load(file) {
    const mod = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    new Function('require', 'module', 'exports', 'Date', code)(id => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      return load(path.resolve(path.dirname(file), `${id}.ts`));
    }, mod, mod.exports, FechaFija);
    return mod.exports;
  }
  const controller = load(path.join(root, 'src/controllers/medico/seguimiento/seguimientoController.ts'));
  return async function invoke(method) {
    const res = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
    await controller[method]({ userId: 'medico', params: { pacienteId: 'paciente' } }, res);
    assert.equal(res.body.success, true);
    return method === 'listarSeguimiento' ? res.body.data[0].proximaCita : res.body.data.proximaCita;
  };
}

for (const endpoint of ['listarSeguimiento', 'obtenerSeguimientoPaciente']) {
  test(`${endpoint}: selecciona 20:00 aunque 20:30 aparezca primero en el mismo día`, async () => {
    const invoke = harness([cita('tarde', '20:30'), cita('temprana', '20:00')]);
    assert.equal((await invoke(endpoint))._id, 'temprana');
  });

  test(`${endpoint}: cambia a 20:30 al pasar el minuto de 20:00`, async () => {
    const citas = [cita('tarde', '20:30'), cita('temprana', '20:00')];
    assert.equal((await harness(citas, '2026-11-17T01:00:30Z')(endpoint))._id, 'temprana');
    assert.equal((await harness(citas, '2026-11-17T01:01:00Z')(endpoint))._id, 'tarde');
    assert.equal(await harness(citas, '2026-11-17T01:31:00Z')(endpoint), null);
  });

  test(`${endpoint}: ordena AM/PM y fechas UTC distintas por la hora real de Colombia`, async () => {
    const invoke = harness([
      cita('manana', '08:00 AM', { fecha: new Date('2026-11-17T00:00:00Z') }),
      cita('tarde', '08:30 PM', { fecha: new Date('2026-11-16T00:00:00Z') }),
      cita('temprana', '20:00'),
    ]);
    assert.equal((await invoke(endpoint))._id, 'temprana');
  });

  test(`${endpoint}: excluye canceladas, completadas y citas de otro médico`, async () => {
    const invoke = harness([
      cita('cancelada', '18:00', { estado: 'cancelada' }),
      cita('completada', '18:30', { estado: 'completada' }),
      cita('ajena', '19:00', { medicoId: 'otro' }),
      cita('valida', '20:00', { estado: 'en_espera' }),
    ]);
    assert.equal((await invoke(endpoint))._id, 'valida');
  });
}
