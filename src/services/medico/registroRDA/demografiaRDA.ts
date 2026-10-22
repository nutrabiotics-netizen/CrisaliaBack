export interface DemografiaRDA {
  actualizadoEn?: Date;
  seccionCuenta: Record<string, any>;
  seccionFacturacion: Record<string, any>;
}

/** Conserva los nombres declarados; sin catálogo no asigna códigos oficiales. */
export function proyectarDemografiaPaciente(p: Record<string, any>): DemografiaRDA {
  const partes = (v: string = '') => v.trim().split(/\s+/);
  const sexo: Record<string, string> = { masculino: '01', femenino: '02', intersexual: '03' };
  const limpiar = (datos: Record<string, any>) => Object.fromEntries(Object.entries(datos)
    .filter(([, valor]) => valor !== undefined && valor !== null && valor !== ''));
  return {
    ...(p.updatedAt ? { actualizadoEn: p.updatedAt } : {}),
    seccionCuenta: limpiar({
      primerNombre: p.primerNombre || partes(p.nombre)[0],
      segundoNombre: p.segundoNombre || partes(p.nombre).slice(1).join(' '),
      primerApellido: p.primerApellido || partes(p.apellido)[0],
      segundoApellido: p.segundoApellido || partes(p.apellido).slice(1).join(' '),
      telefono: p.telefono, correoElectronico: p.email, tipoDocumentoCodigo: p.tipoDocumento,
      numeroDocumento: p.numeroDocumento, sexoBiologico: sexo[p.sexoBiologico], fechaNacimiento: p.fechaNacimiento,
    }),
    seccionFacturacion: limpiar({
      paisResidenciaNombre: p.paisResidencia, municipioResidenciaNombre: p.municipioResidencia || p.lugarResidencia,
      zonaResidencia: p.zonaResidencia === 'Urbana' ? 'U' : p.zonaResidencia === 'Rural' ? 'R' : undefined,
      etniaNombre: p.pertEtnica || p.grupoEtnico, aseguradoraNombre: p.entidadSalud || p.aseguradora || p.eps,
      paisNacimientoNombre: p.paisNacimiento, paisNacionalidadNombre: p.nacionalidad,
    }),
  };
}

const igual = (a: any, b: any) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const codigos: Record<string, string> = { paisResidenciaNombre: 'paisResidenciaCodigo',
  municipioResidenciaNombre: 'municipioResidenciaCodigo', etniaNombre: 'etniaCodigo',
  aseguradoraNombre: 'aseguradoraCodigo', paisNacimientoNombre: 'paisNacimientoCodigo',
  paisNacionalidadNombre: 'paisNacionalidadCodigo' };

export function facturacionInicialRDA(perfil: DemografiaRDA, manual: Record<string, any> = {}) {
  return { ...Object.fromEntries(Object.entries(perfil.seccionFacturacion)
    .filter(([campo]) => !codigos[campo] || !manual[codigos[campo]])), ...manual };
}

/** Solo completa huecos o actualiza valores que siguen siendo los importados del paciente. */
export function cambiosDemografiaRDA(registro: Record<string, any>, perfil: DemografiaRDA) {
  const set: Record<string, any> = {}, unset: Record<string, 1> = {};
  const fuente: DemografiaRDA = { seccionCuenta: { ...registro.fuenteDemografiaPaciente?.seccionCuenta },
    seccionFacturacion: { ...registro.fuenteDemografiaPaciente?.seccionFacturacion } };
  for (const seccion of ['seccionCuenta', 'seccionFacturacion'] as const) {
    const actual = registro[seccion] || {};
    for (const campo of new Set([...Object.keys(perfil[seccion]), ...Object.keys(fuente[seccion])])) {
      if (seccion === 'seccionFacturacion' && codigos[campo] && actual[codigos[campo]]) continue;
      const propio = Object.prototype.hasOwnProperty.call(fuente[seccion], campo);
      if (propio ? !igual(actual[campo], fuente[seccion][campo]) : actual[campo] != null && actual[campo] !== '') continue;
      const valor = perfil[seccion][campo];
      if (igual(actual[campo], valor)) continue;
      if (valor === undefined) unset[`${seccion}.${campo}`] = 1;
      else set[`${seccion}.${campo}`] = valor;
      fuente[seccion][campo] = valor ?? null;
    }
  }
  if (Object.keys(set).length || Object.keys(unset).length) {
    if (perfil.actualizadoEn) fuente.actualizadoEn = perfil.actualizadoEn;
    set.fuenteDemografiaPaciente = fuente;
  }
  return { set, unset };
}
