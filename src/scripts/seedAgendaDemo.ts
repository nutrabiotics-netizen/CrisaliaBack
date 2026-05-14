/**
 * Seed de agenda demo para médicos.
 *
 * Uso:
 *   npx ts-node src/scripts/seedAgendaDemo.ts                 (todos los médicos activos sin agenda)
 *   npx ts-node src/scripts/seedAgendaDemo.ts --email a@b.com (uno solo por email)
 *   npx ts-node src/scripts/seedAgendaDemo.ts --nombre "Juan" (todos los que matchean el nombre)
 *
 * Crea una ConfiguracionAgenda por defecto:
 *   - 1 sede "Consultorio Principal" en Bogotá
 *   - Lunes a Viernes
 *   - 08:00-12:00 y 14:00-18:00
 *   - Modalidad mixta (presencial + virtual)
 *   - Consulta de 30 min, sin tiempos de inactividad
 *
 * Si el médico YA tiene una ConfiguracionAgenda, lo salta (no sobrescribe).
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Medico from '../models/Medico';
import ConfiguracionAgenda, {
  IJornadaConfig,
  ISedeAgenda
} from '../models/ConfiguracionAgenda';

const DIAS_LABORALES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'] as const;

function jornadaPorDefecto(dia: IJornadaConfig['dia']): IJornadaConfig {
  return {
    dia,
    activa: true,
    bloquesHorarios: [
      {
        horaInicio: '08:00',
        horaFin: '12:00',
        modalidad: 'mixta',
        duracionConsulta: 30,
        tiemposInactividad: []
      },
      {
        horaInicio: '14:00',
        horaFin: '18:00',
        modalidad: 'mixta',
        duracionConsulta: 30,
        tiemposInactividad: []
      }
    ]
  };
}

function sedePorDefecto(): ISedeAgenda {
  return {
    nombre: 'Consultorio Principal',
    direccion: 'Calle 100 #15-20, Bogotá',
    jornadas: [
      ...DIAS_LABORALES.map((d) => jornadaPorDefecto(d as IJornadaConfig['dia'])),
      // Fin de semana inactivo (pero declarado)
      { dia: 'Sábado', activa: false, bloquesHorarios: [] } as IJornadaConfig,
      { dia: 'Domingo', activa: false, bloquesHorarios: [] } as IJornadaConfig
    ]
  };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out: { email?: string; nombre?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email') out.email = args[i + 1];
    if (args[i] === '--nombre') out.nombre = args[i + 1];
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

  const { email, nombre } = parseArgs();

  const query: any = { activo: { $ne: false } };
  if (email) query.email = email.toLowerCase().trim();
  if (nombre) query.$or = [
    { nombre: { $regex: nombre, $options: 'i' } },
    { apellido: { $regex: nombre, $options: 'i' } }
  ];

  const medicos = await Medico.find(query).select('_id nombre apellido email');

  if (medicos.length === 0) {
    console.log('⚠️ No se encontraron médicos con esos criterios.');
    await mongoose.disconnect();
    return;
  }

  console.log(`\nEncontrados ${medicos.length} médico(s):`);
  for (const m of medicos) console.log(`  - ${m.nombre} ${m.apellido} <${m.email}> [${m._id}]`);

  let creados = 0;
  let saltados = 0;
  for (const medico of medicos) {
    const existente = await ConfiguracionAgenda.findOne({ medico: medico._id });
    if (existente) {
      console.log(`⏭️  ${medico.nombre} ${medico.apellido} ya tiene agenda — saltado.`);
      saltados++;
      continue;
    }

    await ConfiguracionAgenda.create({
      medico: medico._id,
      optimizacionAutomatica: true,
      flexibilidadReubicacion: true,
      sedes: [sedePorDefecto()],
      notificacionesAgendamiento: {
        notificacionAutomaticaPaciente: true,
        recordatorio24Horas: true,
        recordatorio2Horas: true,
        notificacionMedicoPreconsulta: true,
        notificacionMedicoConsulta: true,
        notificacionMedicoControl: true
      }
    });
    console.log(`✅ Agenda creada para ${medico.nombre} ${medico.apellido}`);
    creados++;
  }

  console.log(`\nResumen: ${creados} creadas, ${saltados} saltadas.`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('❌ Error en seed:', e);
  process.exit(1);
});
