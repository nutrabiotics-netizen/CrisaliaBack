/**
 * Seed de datos clínicos demo para un paciente.
 *
 * Crea, para la última cita "confirmada" o "completada" del paciente:
 *   - HistoriaClinica con motivo, recomendaciones, diagnóstico, etc.
 *   - FormulaMedica con 3 medicamentos de muestra.
 *   - ExamenMedico con 2 paraclínicos.
 *
 * No crea cita: usa la que ya tenés. Si no hay ninguna apta, sale con warning.
 *
 * Uso:
 *   npx ts-node src/scripts/seedDatosClinicosDemo.ts --email paciente@ejemplo.com
 *   npx ts-node src/scripts/seedDatosClinicosDemo.ts --documento 1023456789
 *
 * Es **idempotente** por cita: si ya hay HC para esa cita, salta la creación.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import Paciente from '../models/Paciente';
import Cita from '../models/Cita';
import HistoriaClinica from '../models/HistoriaClinica';
import FormulaMedica from '../models/FormulaMedica';
import ExamenMedico from '../models/ExamenMedico';

function parseArgs() {
  const args = process.argv.slice(2);
  const out: { email?: string; documento?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email') out.email = args[i + 1];
    if (args[i] === '--documento') out.documento = args[i + 1];
  }
  return out;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI no definido en .env');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log('✅ Conectado a Mongo');

  const { email, documento } = parseArgs();
  const query: any = { activo: { $ne: false } };
  if (email) query.email = email.toLowerCase().trim();
  if (documento) query.numeroDocumento = documento;

  const paciente = await Paciente.findOne(query).lean();
  if (!paciente) {
    console.error('❌ Paciente no encontrado. Pasá --email o --documento.');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`👤 Paciente: ${paciente.nombre} ${paciente.apellido} <${paciente.email}>`);
  console.log(`   _id: ${paciente._id}`);

  // Buscar la cita más reciente confirmada o completada
  const cita = await Cita.findOne({
    pacienteId: paciente._id,
    estado: { $in: ['confirmada', 'completada'] }
  })
    .sort({ fecha: -1 })
    .lean();

  if (!cita) {
    console.error('❌ El paciente no tiene citas confirmadas o completadas.');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`📅 Cita target: ${cita._id} (${new Date(cita.fecha).toLocaleDateString('es-CO')} ${cita.hora}, estado=${cita.estado})`);

  const medicoId = cita.medicoId;

  // ─── 1) Historia Clínica ────────────────────────────────────────────────────
  const hcExistente = await HistoriaClinica.findOne({ citaId: cita._id, pacienteId: paciente._id });
  if (hcExistente) {
    console.log('⏭️  Ya existe HistoriaClinica para esta cita — saltado.');
  } else {
    await HistoriaClinica.create({
      pacienteId: paciente._id,
      medicoId,
      citaId: cita._id,
      fechaRegistro: new Date(),
      tipoActividad: 'consulta',
      motivoConsulta:
        'Paciente consulta por episodios recurrentes de dermatitis seborreica en zona facial, asociados a estrés y cambios estacionales. Solicita evaluación integral desde medicina funcional.',
      diagnosticos: [
        { codigo: 'L21.0', descripcion: 'Dermatitis seborreica del cuero cabelludo y zona malar', tipo: 'principal' }
      ],
      recomendaciones: [
        'Evitar jabones alcalinos y agua muy caliente en el rostro.',
        'Limpieza facial suave 2 veces al día con sindet.',
        'Uso de protector solar mineral gel-crema (FPS 50+).',
        'Reducir consumo de azúcares refinados y lácteos durante 4 semanas.',
        'Suplementación de Omega 3 y Vitamina D según fórmula.'
      ].join('\n'),
      analisisyplan:
        'Plan de seguimiento a 90 días. Mejorar barrera cutánea, modular respuesta inflamatoria sistémica y evaluar microbiota intestinal en próximo control.',
      recomendacionesCrisalIA: undefined,
      activo: true,
      creadoPor: medicoId,
      creadoPorRol: 'Medico'
    });
    console.log('✅ HistoriaClinica creada.');
  }

  // ─── 2) Fórmula Médica ──────────────────────────────────────────────────────
  const formulaExistente = await FormulaMedica.findOne({ citaId: cita._id });
  if (formulaExistente) {
    console.log('⏭️  Ya existe FormulaMedica para esta cita — saltado.');
  } else {
    await FormulaMedica.create({
      pacienteId: paciente._id,
      medicoId,
      citaId: cita._id,
      fechaInicio: new Date(),
      medicamentos: [
        {
          denominacionComun: 'Omega 3',
          concentracion: '1000mg',
          unidadMedida: 'cápsula',
          formaFarmaceutica: 'cápsula blanda',
          dosis: '1 cápsula',
          viaAdministracion: 'oral',
          frecuencia: 'cada 12 horas',
          diasTratamiento: '90 días',
          cantidadNumeros: '180',
          cantidadLetras: 'ciento ochenta',
          indicaciones: 'Tomar con las comidas principales para mejorar absorción.'
        },
        {
          denominacionComun: 'Vitamina D3',
          concentracion: '5000 UI',
          unidadMedida: 'gota',
          formaFarmaceutica: 'gotas',
          dosis: '2 gotas',
          viaAdministracion: 'oral',
          frecuencia: 'diaria',
          diasTratamiento: '60 días',
          cantidadNumeros: '1',
          cantidadLetras: 'uno',
          indicaciones: 'En la mañana junto con desayuno graso.'
        },
        {
          denominacionComun: 'Ketoconazol crema 2%',
          concentracion: '2%',
          unidadMedida: 'aplicación',
          formaFarmaceutica: 'crema',
          dosis: 'capa fina',
          viaAdministracion: 'tópica',
          frecuencia: 'cada 12 horas',
          diasTratamiento: '14 días',
          cantidadNumeros: '1',
          cantidadLetras: 'uno',
          indicaciones: 'Aplicar sobre piel limpia y seca en zonas afectadas.'
        }
      ],
      diagnosticos: [
        { codigo: 'L21.0', descripcion: 'Dermatitis seborreica', tipo: 'principal' }
      ],
      observaciones:
        'Reevaluar a las 4 semanas. Si no hay mejoría suspender ketoconazol y continuar con suplementación.',
      creadoPor: medicoId,
      creadoPorRol: 'Medico'
    });
    console.log('✅ FormulaMedica creada con 3 medicamentos.');
  }

  // ─── 3) Examen Médico (paraclínicos solicitados) ────────────────────────────
  const examenExistente = await ExamenMedico.findOne({ citaId: cita._id });
  if (examenExistente) {
    console.log('⏭️  Ya existe ExamenMedico para esta cita — saltado.');
  } else {
    await ExamenMedico.create({
      pacienteId: paciente._id,
      medicoId,
      citaId: cita._id,
      examenes: [
        {
          codigoCups: '902210',
          descripcionCups: 'Perfil lipídico (Colesterol total, HDL, LDL, Triglicéridos)',
          cantidad: 1,
          observacion: 'Ayuno de 12 horas.'
        },
        {
          codigoCups: '902045',
          descripcionCups: 'Hemograma IV completo',
          cantidad: 1
        },
        {
          codigoCups: '903841',
          descripcionCups: 'Vitamina D - 25 OH',
          cantidad: 1,
          observacion: 'Para evaluar baseline antes de suplementación.'
        }
      ],
      estado: 'pendiente',
      creadoPor: medicoId,
      creadoPorRol: 'Medico'
    });
    console.log('✅ ExamenMedico creado con 3 paraclínicos.');
  }

  console.log('\n🎉 Datos clínicos demo listos para el paciente.');
  console.log('   Abrí /paciente/citas → expandí la cita → vas a ver datos reales.');
  console.log('   También /paciente/mi-tratamiento → indicaciones + recomendaciones reales.');

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('❌ Error en seed:', e);
  process.exit(1);
});
