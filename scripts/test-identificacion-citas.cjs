const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

test('la API de citas entrega los campos RDA sin exponer campos ajenos a identificación', async () => {
  const perfil = { _id: 'paciente', nombre: 'Persona sintética', paisNacimiento: '218 - ECUADOR', nacionalidad: 'Colombiana',
    municipioResidencia: '05001 - MEDELLÍN', ocupacionCIUO: { codigo: '2512', nombre: 'Desarrolladores de software' },
    contactoEmergencia: { nombre: 'Acudiente sintético', relacion: 'acudiente', telefono: '0000000000' }, password: 'nunca-retornar' };
  let campos;
  const deps = {
    mongoose: {}, '../../../models/Cita': { find(query) {
      assert.equal(query.medicoId, 'medico');
      return {
        populate(campo, seleccion) { assert.equal(campo, 'pacienteId'); campos = seleccion.split(' '); return this; },
        sort() { return this; },
        async lean() { return [{ _id: 'cita', medicoId: 'medico', hora: '14:00', pacienteId:
          Object.fromEntries(Object.entries(perfil).filter(([k]) => k === '_id' || campos.includes(k))) }]; },
      };
    } },
  };
  const mod = { exports: {} };
  const file = path.resolve(__dirname, '../src/services/medico/agendamiento/agendamientoService.ts');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  new Function('require', 'module', 'exports', code)(id => {
    if (Object.hasOwn(deps, id)) return deps[id];
    throw Error('Importación inesperada: ' + id);
  }, mod, mod.exports);
  const [cita] = await mod.exports.default.obtenerCitasMedico('medico');
  for (const campo of ['paisNacimiento', 'nacionalidad', 'municipioResidencia', 'ocupacionCIUO', 'contactoEmergencia']) {
    assert.deepEqual(cita.paciente[campo], perfil[campo]);
  }
  assert.equal(cita.paciente.password, undefined);
});
