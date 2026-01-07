/**
 * Script para crear los 3 usuarios iniciales (médico, paciente, administrativo)
 * Ejecutar con: npm run create-initial-users
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Medico from '../models/Medico';
import Paciente from '../models/Paciente';
import Administrativo from '../models/Administrativo';
import { connectDB } from '../config/database';

dotenv.config();

const createInitialUsers = async () => {
  try {
    await connectDB();

    // Datos del médico
    const medicoData = {
      email: 'medico@crisalia.com',
      password: 'medico123',
      nombre: 'Juan Carlos',
      apellido: 'Pérez García',
      especialidad: 'Medicina Funcional',
      numeroColegiatura: '12345',
      telefono: '+57 300 123 4567',
      activo: true
    };

    // Datos del paciente
    const pacienteData = {
      email: 'paciente@crisalia.com',
      password: 'paciente123',
      nombre: 'María',
      apellido: 'González López',
      fechaNacimiento: new Date('1990-05-15'),
      telefono: '+57 300 987 6543',
      direccion: 'Calle 123 #45-67, Bogotá',
      activo: true
    };

    // Datos del administrativo
    const administrativoData = {
      email: 'admin@crisalia.com',
      password: 'admin123',
      nombre: 'Carlos',
      apellido: 'Rodríguez Martínez',
      telefono: '+57 300 555 1234',
      activo: true
    };

    // Crear o actualizar médico
    let medico = await Medico.findOne({ email: medicoData.email });
    if (medico) {
      console.log('⚠️  El médico ya existe, actualizando...');
      medico.set(medicoData);
      medico.markModified('password');
      await medico.save();
      console.log('✅ Médico actualizado exitosamente');
    } else {
      medico = new Medico(medicoData);
      await medico.save();
      console.log('✅ Médico creado exitosamente');
    }
    console.log('📧 Email:', medicoData.email);
    console.log('🔑 Password:', medicoData.password);
    console.log('👤 Nombre:', `${medicoData.nombre} ${medicoData.apellido}`);
    console.log('');

    // Crear o actualizar paciente
    let paciente = await Paciente.findOne({ email: pacienteData.email });
    if (paciente) {
      console.log('⚠️  El paciente ya existe, actualizando...');
      paciente.set(pacienteData);
      paciente.markModified('password');
      await paciente.save();
      console.log('✅ Paciente actualizado exitosamente');
    } else {
      paciente = new Paciente(pacienteData);
      await paciente.save();
      console.log('✅ Paciente creado exitosamente');
    }
    console.log('📧 Email:', pacienteData.email);
    console.log('🔑 Password:', pacienteData.password);
    console.log('👤 Nombre:', `${pacienteData.nombre} ${pacienteData.apellido}`);
    console.log('');

    // Crear o actualizar administrativo
    let administrativo = await Administrativo.findOne({ email: administrativoData.email });
    if (administrativo) {
      console.log('⚠️  El administrativo ya existe, actualizando...');
      administrativo.set(administrativoData);
      administrativo.markModified('password');
      await administrativo.save();
      console.log('✅ Administrativo actualizado exitosamente');
    } else {
      administrativo = new Administrativo(administrativoData);
      await administrativo.save();
      console.log('✅ Administrativo creado exitosamente');
    }
    console.log('📧 Email:', administrativoData.email);
    console.log('🔑 Password:', administrativoData.password);
    console.log('👤 Nombre:', `${administrativoData.nombre} ${administrativoData.apellido}`);
    console.log('');

    console.log('🎉 Todos los usuarios iniciales han sido creados/actualizados exitosamente');
    console.log('');
    console.log('📋 Resumen de credenciales:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👨‍⚕️  MÉDICO:');
    console.log('   Email: medico@crisalia.com');
    console.log('   Password: medico123');
    console.log('');
    console.log('👤 PACIENTE:');
    console.log('   Email: paciente@crisalia.com');
    console.log('   Password: paciente123');
    console.log('');
    console.log('👔 ADMINISTRATIVO:');
    console.log('   Email: admin@crisalia.com');
    console.log('   Password: admin123');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error al crear usuarios iniciales:', error.message);
    console.error(error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

createInitialUsers();

