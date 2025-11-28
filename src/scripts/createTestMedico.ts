/**
 * Script para crear un médico de prueba
 * Ejecutar con: npx ts-node src/scripts/createTestMedico.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Medico from '../models/Medico';
import { connectDB } from '../config/database';

dotenv.config();

const createTestMedico = async () => {
  try {
    await connectDB();

    const testMedico = {
      email: 'medico@test.com',
      password: '123456',
      nombre: 'Juan',
      apellido: 'Pérez',
      especialidad: 'Medicina General',
      numeroColegiatura: '12345',
      telefono: '+1234567890',
      activo: true
    };

    // Verificar si ya existe
    const existingMedico = await Medico.findOne({ email: testMedico.email });
    if (existingMedico) {
      console.log('⚠️  El médico de prueba ya existe');
      await mongoose.connection.close();
      return;
    }

    // Crear médico
    const medico = new Medico(testMedico);
    await medico.save();

    console.log('✅ Médico de prueba creado exitosamente');
    console.log('📧 Email:', testMedico.email);
    console.log('🔑 Password:', testMedico.password);
    console.log('👤 Nombre:', `${testMedico.nombre} ${testMedico.apellido}`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error al crear médico de prueba:', error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
};

createTestMedico();

