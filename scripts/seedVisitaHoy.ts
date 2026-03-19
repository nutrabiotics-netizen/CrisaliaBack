import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import Cita from '../src/models/Cita';
import AsignacionBox from '../src/models/AsignacionBox';
import Paciente from '../src/models/Paciente';
import Medico from '../src/models/Medico';
import BoxConsultorio from '../src/models/BoxConsultorio';

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('🔗 Conectado a MongoDB');

    const medico = await Medico.findOne();
    const paciente = await Paciente.findOne();
    let box = await BoxConsultorio.findOne();

    if (!box) {
       box = await BoxConsultorio.create({ 
           nombre: 'Consultorio VIP 1',
           tipo: 'normal',
           capacidadVirtual: false,
           equipos: [],
           sede: 'Sede Principal Crisalida',
           activo: true
       });
    }

    if (!medico || !paciente) {
        console.log('⚠️ Requieres tener al menos 1 médico y 1 paciente creados previamente.');
        process.exit(1);
    }

    const inicioDia = new Date(); 
    inicioDia.setHours(0,0,0,0);

    let asignacion = await AsignacionBox.findOne({ medicoId: medico._id, fecha: inicioDia });
    if (!asignacion) {
        asignacion = await AsignacionBox.create({
            boxId: box._id,
            medicoId: medico._id,
            fecha: inicioDia,
            horaInicio: '08:00',
            horaFin: '18:00',
            activo: true
        });
    }

    await Cita.create({
        pacienteId: paciente._id,
        medicoId: medico._id,
        fecha: inicioDia,
        hora: '10:00',
        tipo: 'consulta',
        modalidad: 'presencial',
        estado: 'confirmada'
    });

    await Cita.create({
        pacienteId: paciente._id,
        medicoId: medico._id,
        fecha: inicioDia,
        hora: '14:30',
        tipo: 'control',
        modalidad: 'presencial',
        estado: 'en_espera',
        horaLlegada: new Date(Date.now() - 17 * 60000) // Hace 17 mins para que pinte amarillo
    });

    console.log('✅ Se inyectaron 2 citas para HOY con éxito en Visita Paciente.');
    process.exit(0);
  } catch(e) {
    console.error('❌ Error de siembra:', e);
    process.exit(1);
  }
}

seed();
