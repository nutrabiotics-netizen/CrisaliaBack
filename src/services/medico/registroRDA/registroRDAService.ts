import RegistroRDA, { IRegistroRDA } from '../../../models/RegistroRDA';
import Paciente from '../../../models/Paciente';
import Interrogatorio from '../../../models/Interrogatorio';
import Cita from '../../../models/Cita';
import { AppError } from '../../../utils/errors';
import { proyectarFase1RDA, completarInicialRDA } from './fase1RDA';
import { filtroOposicionRDA, quitarOposicionLegacy, completarPreguntasRDA } from '../../paciente/preguntasRDAFlow';
import { proyectarDemografiaPaciente, facturacionInicialRDA } from './demografiaRDA';
import { sincronizarDemografiaRegistro } from '../../paciente/demografiaRDASyncService';

// ─── Completitud auto-calculada ───────────────────────────────────────────────

function calcularCompletitud(r: any) {
  const c = r.seccionCuenta || {};
  const ii = r.seccionInterrogatorioInicial || {};
  const f = r.seccionFacturacion || {};
  const ip = r.seccionInterrogatorioPrincipal || {};
  const co = r.seccionConsulta || {};

  const seccion1 = {
    nombre:      !!(c.primerNombre && c.primerApellido),
    documento:   !!(c.tipoDocumentoCodigo && c.numeroDocumento),
    contacto:    !!(c.telefono || c.correoElectronico),
    sexoFechaNac: !!(c.sexoBiologico && c.fechaNacimiento),
  };

  const seccion2 = {
    identidadGenero:           !!ii.identidadGenero,
    ocupacion:                 !!(ii.ocupacionCodigo && ii.ocupacionNombre),
    alergias:                  ii.indicadorAlergia === false
                                 || (ii.indicadorAlergia === true && (ii.antecedentesAlergias?.length ?? 0) > 0),
    antecedentesFamiliares:    ii.estadoAntecedentesFamiliares === 'no_conoce'
                                 || (ii.antecedentesFamiliares?.length ?? 0) > 0,
    antecedentesFarmacologicos:ii.estadoAntecedentesFarmacologicos === 'no_toma'
                                 || (ii.antecedentesFarmacologicos?.length ?? 0) > 0,
  };

  const seccion3 = {
    residencia:   !!(f.paisResidenciaCodigo && f.municipioResidenciaCodigo),
    aseguradora:  !!(f.aseguradoraCodigo && f.aseguradoraNombre),
    nacionalidad: !!(f.paisNacionalidadCodigo),
    zonaEtnia:    !!(f.zonaResidencia && f.etniaCodigo),
  };

  const seccion4 = {
    donacionOrganos: (ip.oposicionOrganos || []).some((r: any) => ['si_escrita', 'no_escrita', 'sin_certeza', 'prefiero_no_responder'].includes(r.respuesta) || typeof r.oposicion === 'boolean')
      || ['si_escrita', 'no_escrita', 'sin_certeza', 'prefiero_no_responder'].includes(ip.respuestaOposicionOrganos)
      || typeof ip.oposicionDonarOrganos === 'boolean',
    discapacidades:  (ip.discapacidades?.length ?? 0) > 0,
    factoresRiesgo:  ip.estadoFactoresRiesgo === 'sin_certeza' || (ip.factoresRiesgo?.length ?? 0) > 0,
  };

  const seccion5 = {
    tiempoAtencion: !!(co.fechaHoraInicioAtencion && co.fechaHoraFinAtencion),
    modalidad:      !!(co.modalidadAtencion && co.grupoServicio),
    diagnosticos:   (co.diagnosticos?.length ?? 0) > 0,
    profesional:    !!(co.profesionalNumeroDocumento && co.profesionalRegistroMedico),
    prestador:      !!co.codigoPrestador,
  };

  const todasSecciones = [
    ...Object.values(seccion1),
    ...Object.values(seccion2),
    ...Object.values(seccion3),
    ...Object.values(seccion4),
    ...Object.values(seccion5),
  ];
  const completadas = todasSecciones.filter(Boolean).length;
  const porcentaje = Math.round((completadas / todasSecciones.length) * 100);

  return { seccion1, seccion2, seccion3, seccion4, seccion5, porcentaje };
}

// ─── Service ──────────────────────────────────────────────────────────────────

class RegistroRDAService {
  private async incorporarOposicion(registro: any) {
    if (!registro || registro.estado === 'transmitido' || registro.activo === false || !registro.fuenteFase1?.interrogatorioId) return registro;
    const fuente = await Interrogatorio.findOne({ _id: registro.fuenteFase1.interrogatorioId, pacienteId: registro.pacienteId,
      tipo: 'primera_vez', 'fase1.confirmada': true }).lean();
    if (!fuente) return registro;
    const cambios = completarPreguntasRDA(registro.seccionInterrogatorioPrincipal || {}, fuente.respuestas || {}, fuente._id);
    if (!Object.keys(cambios).length) return registro;
    const campos = Object.fromEntries(Object.entries(cambios).map(([k, v]) => [`seccionInterrogatorioPrincipal.${k}`, v]));
    const actualizado = await RegistroRDA.findOneAndUpdate({ _id: registro._id, medicoId: registro.medicoId, pacienteId: registro.pacienteId,
      estado: { $ne: 'transmitido' }, activo: { $ne: false }, updatedAt: registro.updatedAt,
      ...filtroOposicionRDA(registro.seccionInterrogatorioPrincipal || {}) }, { $set: campos, $unset: quitarOposicionLegacy(registro.seccionInterrogatorioPrincipal || {}) }, { new: true, runValidators: true }).lean();
    return actualizado || await RegistroRDA.findOne({ _id: registro._id, medicoId: registro.medicoId, activo: { $ne: false } }).lean();
  }
  private async obtenerFase1(pacienteId: string, limite: Date) {
    return Interrogatorio.findOne({ pacienteId, tipo: 'primera_vez', 'fase1.confirmada': true,
      createdAt: { $lte: limite } }).sort({ createdAt: -1, _id: -1 }).lean();
  }

  /** Una sola incorporación por RDA, con su origen persistido; nunca cambia una cita histórica por una entrevista posterior. */
  private async incorporarFase1(registro: any) {
    if (registro.estado === 'transmitido' || registro.activo === false) return registro;
    const paciente = await Paciente.findById(registro.pacienteId).lean();
    if (paciente) registro = await sincronizarDemografiaRegistro(registro, paciente);
    if (!registro || registro.estado === 'transmitido' || registro.activo === false) return registro;
    if (registro.fuenteFase1) return this.incorporarOposicion(registro);
    const fuente = await this.obtenerFase1(registro.pacienteId.toString(), registro.createdAt);
    if (!fuente) return registro;
    const cambios = completarInicialRDA(registro.seccionInterrogatorioInicial || {}, proyectarFase1RDA(fuente.respuestas || {}));
    const campos = Object.fromEntries(Object.entries(cambios).map(([k, v]) => [`seccionInterrogatorioInicial.${k}`, v]));
    const actualizado = await RegistroRDA.findOneAndUpdate({ _id: registro._id, pacienteId: registro.pacienteId, medicoId: registro.medicoId,
      estado: { $ne: 'transmitido' }, activo: { $ne: false }, fuenteFase1: { $exists: false }, updatedAt: registro.updatedAt },
      { $set: { ...campos, fuenteFase1: { interrogatorioId: fuente._id, version: fuente.fase1!.version, incorporadoEn: new Date() } } },
      { new: true, runValidators: true }).lean();
    // Si el médico editó o transmitió mientras leíamos, conservar lo que ganó esa escritura.
    return this.incorporarOposicion(actualizado || await RegistroRDA.findOne({ _id: registro._id, medicoId: registro.medicoId, activo: { $ne: false } }).lean());
  }

  private async construirSeccionCuenta(pacienteId: string) {
    const paciente = await Paciente.findById(pacienteId).lean();
    if (!paciente) throw new AppError('Paciente no encontrado', 404);

    return proyectarDemografiaPaciente(paciente).seccionCuenta;
  }

  private enriquecer(registro: any) {
    return { ...registro, completitud: calcularCompletitud(registro) };
  }

  private async construirSeccionInterrogatorioInicial(pacienteId: string) {
    const paciente = await Paciente.findById(pacienteId).lean();
    if (!paciente) return {};
    const result: Record<string, any> = {};
    const genero = (paciente as any).genero;
    if (genero?.codigo) result.identidadGenero = genero.codigo;
    const ocupacionCIUO = (paciente as any).ocupacionCIUO;
    if (ocupacionCIUO?.codigo) {
      result.ocupacionCodigo = ocupacionCIUO.codigo;
      result.ocupacionNombre = ocupacionCIUO.nombre;
    }
    return result;
  }

  async crear(data: Partial<IRegistroRDA>): Promise<IRegistroRDA> {
    if (!data.pacienteId) throw new AppError('pacienteId es requerido', 400);
    const cita = await Cita.findOne({ _id: data.citaId, pacienteId: data.pacienteId, medicoId: data.medicoId }).lean();
    if (!cita) throw new AppError('La cita no corresponde al paciente y al médico indicados', 404);

    const existente = await RegistroRDA.findOne({ citaId: data.citaId, activo: { $ne: false } });
    if (existente) throw new AppError('Ya existe un Registro RDA para esta cita', 409);

    const seccionCuentaAuto = await this.construirSeccionCuenta(data.pacienteId.toString());
    const seccionCuenta = { ...seccionCuentaAuto, ...(data.seccionCuenta || {}) };
    const demografia = proyectarDemografiaPaciente(await Paciente.findById(data.pacienteId).lean() || {});

    const fuente = await this.obtenerFase1(data.pacienteId.toString(), new Date());
    const perfil = await this.construirSeccionInterrogatorioInicial(data.pacienteId.toString());
    const seccionInterrogatorioInicialAuto = { ...perfil, ...(fuente ? proyectarFase1RDA(fuente.respuestas || {}) : {}) };
    const manual = data.seccionInterrogatorioInicial || {};
    const seccionInterrogatorioInicial = { ...manual, ...completarInicialRDA(manual, seccionInterrogatorioInicialAuto) };
    const inicial = fuente ? await RegistroRDA.findOne({ pacienteId: data.pacienteId, tipoRegistro: 'inicial',
      'fuenteFase1.interrogatorioId': fuente._id }).lean() : null;
    const principalManual = data.seccionInterrogatorioPrincipal || {};
    const seccionInterrogatorioPrincipal = { ...principalManual,
      ...(fuente ? completarPreguntasRDA(principalManual, fuente.respuestas || {}, fuente._id) : {}) };

    const registro = await RegistroRDA.create({ ...data, tipoRegistro: 'consulta', registroInicialId: inicial?._id, fuenteFase1: fuente ? {
      interrogatorioId: fuente._id, version: fuente.fase1!.version, incorporadoEn: new Date(),
    } : undefined, seccionCuenta, seccionInterrogatorioInicial, seccionInterrogatorioPrincipal,
    seccionFacturacion: facturacionInicialRDA(demografia, data.seccionFacturacion),
    fuenteDemografiaPaciente: demografia });
    return this.enriquecer(registro.toObject()) as IRegistroRDA;
  }

  async obtenerPorCita(citaId: string, medicoId: string): Promise<IRegistroRDA | null> {
    const registro = await RegistroRDA.findOne({ citaId, medicoId, activo: { $ne: false } }).lean();
    const sincronizado = registro ? await this.incorporarFase1(registro) : null;
    return sincronizado ? this.enriquecer(sincronizado) : null;
  }

  async obtenerPorPaciente(pacienteId: string, medicoId: string): Promise<IRegistroRDA[]> {
    const registros = await RegistroRDA.find({ pacienteId, medicoId, activo: { $ne: false } })
      .sort({ createdAt: -1 })
      .lean();
    const sincronizados = await Promise.all(registros.map(r => this.incorporarFase1(r)));
    return sincronizados.filter(Boolean).map(r => this.enriquecer(r));
  }

  async obtenerPorId(id: string, medicoId: string): Promise<IRegistroRDA | null> {
    const registro = await RegistroRDA.findOne({ _id: id, medicoId, activo: { $ne: false } }).lean();
    const sincronizado = registro ? await this.incorporarFase1(registro) : null;
    return sincronizado ? this.enriquecer(sincronizado) : null;
  }

  async actualizar(id: string, medicoId: string, datos: Partial<IRegistroRDA>): Promise<IRegistroRDA | null> {
    const registro = await RegistroRDA.findOne({ _id: id, medicoId, activo: { $ne: false } });
    if (!registro) throw new AppError('Registro RDA no encontrado', 404);
    if (registro.estado === 'transmitido') throw new AppError('No se puede modificar un Registro RDA ya transmitido', 400);

    const campos = Object.fromEntries(Object.entries(datos).filter(([k]) => ['seccionCuenta', 'seccionInterrogatorioInicial',
      'seccionFacturacion', 'seccionInterrogatorioPrincipal', 'seccionConsulta', 'actualizadoPor', 'actualizadoPorRol'].includes(k)));
    const guardado = await RegistroRDA.findOneAndUpdate({ _id: id, medicoId, activo: { $ne: false }, estado: { $ne: 'transmitido' }, updatedAt: registro.updatedAt },
      { $set: campos }, { new: true, runValidators: true }).lean();
    if (!guardado) throw new AppError('El RDA cambió o fue transmitido. Recarga antes de editar.', 409);
    return this.enriquecer(guardado) as IRegistroRDA;
  }

  async cambiarEstado(id: string, medicoId: string, estado: 'borrador' | 'listo' | 'transmitido'): Promise<IRegistroRDA | null> {
    const registro = await RegistroRDA.findOne({ _id: id, medicoId, activo: { $ne: false } });
    if (!registro) throw new AppError('Registro RDA no encontrado', 404);

    if (registro.estado === 'transmitido') {
      if (estado === 'transmitido') return this.enriquecer(registro.toObject()) as IRegistroRDA;
      throw new AppError('No se puede cambiar un Registro RDA ya transmitido', 400);
    }

    if (estado === 'listo') {
      const completitud = calcularCompletitud(registro.toObject());
      const seccionesObligatorias = [
        completitud.seccion1.nombre,
        completitud.seccion1.documento,
        completitud.seccion1.contacto,
        completitud.seccion1.sexoFechaNac,
        completitud.seccion5.tiempoAtencion,
        completitud.seccion5.diagnosticos,
        completitud.seccion5.profesional,
        completitud.seccion5.prestador,
      ];
      if (seccionesObligatorias.some(v => !v)) {
        throw new AppError('Faltan campos obligatorios para marcar el RDA como listo', 400);
      }
    }

    const guardado = await RegistroRDA.findOneAndUpdate({ _id: id, medicoId, activo: { $ne: false }, estado: { $ne: 'transmitido' }, updatedAt: registro.updatedAt },
      { $set: { estado } }, { new: true, runValidators: true }).lean();
    if (!guardado) throw new AppError('El RDA cambió o fue transmitido. Recarga antes de continuar.', 409);
    return this.enriquecer(guardado) as IRegistroRDA;
  }

  async eliminar(id: string, medicoId: string): Promise<void> {
    const registro = await RegistroRDA.findOne({ _id: id, medicoId, activo: { $ne: false } });
    if (!registro) throw new AppError('Registro RDA no encontrado', 404);
    if (registro.estado === 'transmitido') throw new AppError('No se puede eliminar un Registro RDA ya transmitido', 400);

    const eliminado = await RegistroRDA.findOneAndUpdate({ _id: id, medicoId, estado: { $ne: 'transmitido' }, updatedAt: registro.updatedAt },
      { $set: { activo: false } }, { new: true });
    if (!eliminado) throw new AppError('El RDA cambió o fue transmitido. Recarga antes de continuar.', 409);
  }
}

export default new RegistroRDAService();
