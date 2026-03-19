import Cita from '../models/Cita';

// Generador de estructuras RIPS Fases 2, 3, y 4.
export async function buildRipsPackage(periodo: string) {
  const [yearStr, monthStr] = periodo.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr) - 1; // 0-indexed

  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);

  // Consultar historial
  const citas = await Cita.find({
    estado: { $in: ['completada', 'confirmada'] }, // Ampliado por el demo
    fecha: { $gte: startDate, $lte: endDate }
  }).populate('pacienteId').lean();

  const usList: any[] = [];
  const acList: any[] = [];
  const afList: any[] = [];
  const pacientesMap = new Map();

  for(const cita of citas) {
    const p = cita.pacienteId as any;
    
    // Archivo US
    if (p && !pacientesMap.has(p._id.toString())) {
      pacientesMap.set(p._id.toString(), true);
      usList.push({
        tipoDocumento: p.tipoDocumento || 'CC',
        numeroDocumento: p.numeroIdentificacion || '0000000',
        tipoUsuario: '01',
        primerApellido: p.primerApellido || 'APELLIDO',
        segundoApellido: p.segundoApellido || '',
        primerNombre: p.primerNombre || 'NOMBRE',
        segundoNombre: p.segundoNombre || '',
        edad: 30,
        unidadMedidaEdad: '01',
        sexo: p.genero === 'Femenino' ? 'F' : 'M',
        codigoDepartamento: '11',
        codigoMunicipio: '11001',
        zonaResidencia: 'U'
      });
    }

    // Archivo AC
    acList.push({
      numeroFactura: `FCT-${yearStr}${monthStr}-001`,
      codigoPrestador: '123456789012',
      tipoDocumento: p?.tipoDocumento || 'CC',
      numeroDocumento: p?.numeroIdentificacion || '0000000',
      fechaConsulta: cita.fecha.toISOString().split('T')[0],
      numeroAutorizacion: null,
      codigoConsulta: '890201',
      finalidadConsulta: '10',
      causaExterna: '13',
      codigoDiagnosticoPrincipal: 'Z000',
      tipoDiagnosticoPrincipal: '1',
      valorConsulta: 150000,
      valorCuotaModeradora: 0,
      valorNetoPagar: 150000
    });
  }

  // AF
  if (citas.length > 0) {
    afList.push({
      codigoPrestador: '123456789012',
      razonSocial: 'Crisalia Salud',
      tipoDocumento: 'NI',
      numeroDocumento: '900123456',
      numeroFactura: `FCT-${yearStr}${monthStr}-001`,
      fechaExpedicion: endDate.toISOString().split('T')[0],
      fechaInicio: startDate.toISOString().split('T')[0],
      fechaFinal: endDate.toISOString().split('T')[0],
      codigoEntidad: 'EPS001',
      nombreEntidad: 'EPS General',
      numeroContrato: 'CONT-123',
      planBeneficios: 'PBS',
      numeroPoliza: null,
      valorCopago: 0,
      valorComision: 0,
      valorDescuento: 0,
      valorNetoPagar: citas.length * 150000
    });
  }

  // CT (Control)
  const ctList = [
    { codigoArchivo: 'US', totalRegistros: usList.length },
    { codigoArchivo: 'AC', totalRegistros: acList.length },
    { codigoArchivo: 'AP', totalRegistros: 0 },
    { codigoArchivo: 'AM', totalRegistros: 0 },
    { codigoArchivo: 'AF', totalRegistros: afList.length }
  ];

  return {
    US: usList,
    AC: acList,
    AP: [], // Sin mock de procedimientos por simplicidad
    AM: [],
    AF: afList,
    CT: ctList
  };
}
