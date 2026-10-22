import type { SeccionInterrogatorioInicial } from '../../../models/RegistroRDA';

const categoriasAlergia: Record<string, { tipoCodigo: '01' | '02' | '03' | '04' | '05' | '06'; tipoNombre: string }> = {
  medicamentos: { tipoCodigo: '01', tipoNombre: 'Medicamento' },
  alimentos: { tipoCodigo: '02', tipoNombre: 'Alimento' },
  ambiente: { tipoCodigo: '03', tipoNombre: 'Sustancia del ambiente' },
  contacto_piel: { tipoCodigo: '04', tipoNombre: 'Sustancia que entran en contacto con la piel' },
  picaduras_insectos: { tipoCodigo: '05', tipoNombre: 'Picadura de insectos' },
  otra: { tipoCodigo: '06', tipoNombre: 'Otra' },
};

/** Proyección de respuestas declaradas. No deduce diagnósticos ni completa códigos ausentes. */
export function proyectarFase1RDA(r: Record<string, any>): SeccionInterrogatorioInicial {
  const resultado: SeccionInterrogatorioInicial = {};
  if (['01', '02', '03', '04', '05'].includes(r.s01_identidad_genero)) resultado.identidadGenero = r.s01_identidad_genero;
  const ocupacion = r.s01_ocupacion_ciuo;
  if (typeof ocupacion?.codigo === 'string' && typeof ocupacion.nombre === 'string') {
    resultado.ocupacionCodigo = ocupacion.codigo; resultado.ocupacionNombre = ocupacion.nombre;
  } else if (typeof r.s01_ocupacion === 'string' && r.s01_ocupacion.trim()) {
    resultado.ocupacionCodigo = null; resultado.ocupacionNombre = r.s01_ocupacion;
  }
  if (r.s01_tipo_alergia === 'sin_alergias_conocidas') {
    resultado.indicadorAlergia = false; resultado.antecedentesAlergias = [];
  } else if (Array.isArray(r.s01_alergias) && r.s01_alergias.length) {
    const alergias = r.s01_alergias.filter((a: any) => typeof a?.tipo === 'string' && typeof a.sustancia === 'string' && a.sustancia.trim());
    if (alergias.length === r.s01_alergias.length) {
      resultado.indicadorAlergia = true;
      resultado.antecedentesAlergias = alergias.map((a: any) => ({ tipo: a.tipo,
        ...(Object.prototype.hasOwnProperty.call(categoriasAlergia, a.tipo) ? categoriasAlergia[a.tipo] : {}),
        nombreAlergeno: a.sustancia }));
    }
  }
  const familiares = r.s01_enfermedades_familia;
  if (familiares?.estado === 'no_conoce' && Array.isArray(familiares.familiares) && !familiares.familiares.length) {
    resultado.estadoAntecedentesFamiliares = 'no_conoce'; resultado.antecedentesFamiliares = [];
  } else if (familiares?.estado === 'registradas' && Array.isArray(familiares.familiares) && familiares.familiares.length &&
      familiares.familiares.every((f: any) => typeof f?.parentesco?.codigo === 'string' && typeof f.parentesco.descripcion === 'string' &&
        Array.isArray(f.enfermedades) && f.enfermedades.length && f.enfermedades.every((e: any) => typeof e?.codigo === 'string' && typeof e.nombre === 'string'))) {
    resultado.estadoAntecedentesFamiliares = 'registradas';
    resultado.antecedentesFamiliares = familiares.familiares.flatMap((f: any) => f.enfermedades.map((e: any) => ({
      codigoCIE10: e.codigo, nombreCIE10: e.nombre, parentesco: f.parentesco.codigo, parentescoNombre: f.parentesco.descripcion,
    })));
  }
  const farmacos = r.s01_medicamentos_actuales;
  if (farmacos?.estado === 'no_toma' && Array.isArray(farmacos.medicamentos) && !farmacos.medicamentos.length) {
    resultado.estadoAntecedentesFarmacologicos = 'no_toma'; resultado.antecedentesFarmacologicos = [];
  } else if (farmacos?.estado === 'toma' && Array.isArray(farmacos.medicamentos) && farmacos.medicamentos.length &&
      farmacos.medicamentos.every((m: any) => typeof m?.nombre === 'string' && m.nombre.trim() &&
        ((typeof m.codigo === 'string' && m.codigo.trim()) || (m.codigo === null && m.origen === 'declarado')))) {
    resultado.estadoAntecedentesFarmacologicos = 'toma';
    resultado.antecedentesFarmacologicos = farmacos.medicamentos.map((m: any) => ({ codigoCUMS: m.codigo, nombre: m.nombre,
      origen: m.codigo === null ? 'declarado' : 'catalogo' }));
  }
  return resultado;
}

/** Cada grupo es indivisible: una ausencia declarada nunca se mezcla con antecedentes anteriores. */
export function completarInicialRDA(actual: SeccionInterrogatorioInicial, fase1: SeccionInterrogatorioInicial): SeccionInterrogatorioInicial {
  const cambios: SeccionInterrogatorioInicial = {};
  if (!actual.identidadGenero && fase1.identidadGenero) cambios.identidadGenero = fase1.identidadGenero;
  if (!actual.ocupacionNombre && !actual.ocupacionCodigo && fase1.ocupacionNombre) {
    cambios.ocupacionCodigo = fase1.ocupacionCodigo; cambios.ocupacionNombre = fase1.ocupacionNombre;
  }
  if (actual.indicadorAlergia == null && !actual.antecedentesAlergias?.length && fase1.indicadorAlergia != null) {
    cambios.indicadorAlergia = fase1.indicadorAlergia; cambios.antecedentesAlergias = fase1.antecedentesAlergias;
  }
  if (!actual.estadoAntecedentesFamiliares && !actual.antecedentesFamiliares?.length && fase1.estadoAntecedentesFamiliares) {
    cambios.estadoAntecedentesFamiliares = fase1.estadoAntecedentesFamiliares; cambios.antecedentesFamiliares = fase1.antecedentesFamiliares;
  }
  if (!actual.estadoAntecedentesFarmacologicos && !actual.antecedentesFarmacologicos?.length && fase1.estadoAntecedentesFarmacologicos) {
    cambios.estadoAntecedentesFarmacologicos = fase1.estadoAntecedentesFarmacologicos; cambios.antecedentesFarmacologicos = fase1.antecedentesFarmacologicos;
  }
  return cambios;
}
