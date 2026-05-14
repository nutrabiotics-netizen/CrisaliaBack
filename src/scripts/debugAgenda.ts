import 'dotenv/config';
import mongoose from 'mongoose';
import ConfiguracionAgenda from '../models/ConfiguracionAgenda';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const ids = ['695bd5e6e2a3a01d24f01182', '695c1892628acb3f81232109'];
  for (const id of ids) {
    const c = await ConfiguracionAgenda.findOne({ medico: id }).lean();
    console.log('\n===== Médico', id, '=====');
    if (!c) { console.log('  NO TIENE configuracion'); continue; }
    console.log('  sedes:', c.sedes?.length ?? 0);
    c.sedes?.forEach((s: any, i: number) => {
      console.log(`  sede[${i}]: ${s.nombre} — jornadas: ${s.jornadas?.length ?? 0}`);
      s.jornadas?.forEach((j: any) => {
        console.log(`    ${j.dia} activa=${j.activa} bloques=${j.bloquesHorarios?.length ?? 0}`);
        j.bloquesHorarios?.forEach((b: any) => {
          console.log(`      ${b.horaInicio}-${b.horaFin} modalidad=${b.modalidad} dur=${b.duracionConsulta}`);
        });
      });
    });
  }
  await mongoose.disconnect();
}
main();
