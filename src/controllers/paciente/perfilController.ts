import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import Paciente from '../../models/Paciente';
import ConfiguracionSeguridadPaciente from '../../models/ConfiguracionSeguridadPaciente';

export const obtenerPerfil = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;

    if (!pacienteId) {
      res.status(401).json({ message: 'Usuario no autenticado' });
      return;
    }

    const paciente = await Paciente.findById(pacienteId).select('-password');
    
    if (!paciente) {
      res.status(404).json({ message: 'Paciente no encontrado' });
      return;
    }

    // Obtener configuración de seguridad si existe
    let configuracionSeguridad = await ConfiguracionSeguridadPaciente.findOne({ paciente: pacienteId });
    
    // Si no existe, crear una por defecto
    if (!configuracionSeguridad) {
      configuracionSeguridad = await ConfiguracionSeguridadPaciente.create({
        paciente: pacienteId,
        autenticacionDosFactores: false,
        recordarDispositivo: false,
        autenticacionBiometrica: false,
        tipoBiometrico: 'ninguno',
        visualizarContrasena: false,
        metodoNotificacion: 'whatsapp',
        aceptaTerminos: false,
        aceptaConsentimiento: false
      });
    }

    res.status(200).json({
      success: true,
      data: {
        paciente,
        configuracionSeguridad
      }
    });
  } catch (error) {
    console.error('Error al obtener el perfil del paciente:', error);
    res.status(500).json({ message: 'Error interno del servidor al obtener el perfil' });
  }
};

export const actualizarPerfil = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;

    if (!pacienteId) {
      res.status(401).json({ message: 'Usuario no autenticado' });
      return;
    }

    const {
      // Datos del paciente
      nombre,
      apellido,
      tipoDocumento,
      numeroDocumento,
      fechaNacimiento,
      sexoBiologico,
      genero,
      estadoCivil,
      nacionalidad,
      lugarResidencia,
      direccion,
      telefono,
      contactoEmergencia,
      regimenAfiliacion,
      eps,
      numeroAfiliacion,
      // Sociodemográficos y clínicos (perfil → precargar en cita)
      grupoSanguineo,
      rh,
      escolaridad,
      ocupacion,
      condicionDesplazamiento,
      grupoEtnico,
      aseguradora,
      // Configuración de seguridad
      autenticacionDosFactores,
      recordarDispositivo,
      autenticacionBiometrica,
      tipoBiometrico,
      visualizarContrasena,
      metodoNotificacion,
      aceptaTerminos,
      aceptaConsentimiento,
      consentimientosDetalle
    } = req.body;

    // Actualizar datos del paciente
    const paciente = await Paciente.findById(pacienteId);
    
    if (!paciente) {
      res.status(404).json({ message: 'Paciente no encontrado' });
      return;
    }

    // Validar campos obligatorios
    if (nombre !== undefined && nombre.trim() === '') {
      res.status(400).json({ message: 'El nombre es obligatorio' });
      return;
    }
    if (apellido !== undefined && apellido.trim() === '') {
      res.status(400).json({ message: 'El apellido es obligatorio' });
      return;
    }

    // Actualizar campos del paciente
    if (nombre !== undefined && nombre.trim() !== '') paciente.nombre = nombre;
    if (apellido !== undefined && apellido.trim() !== '') paciente.apellido = apellido;
    if (tipoDocumento !== undefined && tipoDocumento.trim() !== '') paciente.tipoDocumento = tipoDocumento;
    if (numeroDocumento !== undefined) paciente.numeroDocumento = numeroDocumento.trim() || undefined;
    if (fechaNacimiento !== undefined) paciente.fechaNacimiento = fechaNacimiento || undefined;
    
    // Campos enum: solo actualizar si tienen un valor válido (no vacío), si viene vacío se establece como undefined
    if (sexoBiologico !== undefined) {
      paciente.sexoBiologico = sexoBiologico.trim() !== '' ? sexoBiologico : undefined;
    }
    if (genero !== undefined) {
      paciente.genero = genero.trim() !== '' ? genero : undefined;
    }
    if (estadoCivil !== undefined) {
      paciente.estadoCivil = estadoCivil.trim() !== '' ? estadoCivil : undefined;
    }
    
    if (nacionalidad !== undefined) paciente.nacionalidad = nacionalidad.trim() || undefined;
    if (lugarResidencia !== undefined) paciente.lugarResidencia = lugarResidencia.trim() || undefined;
    if (direccion !== undefined) paciente.direccion = direccion.trim() || undefined;
    if (telefono !== undefined) paciente.telefono = telefono.trim() || undefined;
    if (contactoEmergencia !== undefined) {
      paciente.contactoEmergencia = contactoEmergencia.nombre?.trim() || contactoEmergencia.telefono?.trim() 
        ? contactoEmergencia 
        : undefined;
    }
    
    // Campo enum: solo actualizar si tiene un valor válido (no vacío)
    if (regimenAfiliacion !== undefined) {
      paciente.regimenAfiliacion = regimenAfiliacion.trim() !== '' ? regimenAfiliacion : undefined;
    }
    if (eps !== undefined) paciente.eps = eps.trim() || undefined;
    if (numeroAfiliacion !== undefined) paciente.numeroAfiliacion = numeroAfiliacion.trim() || undefined;
    // Sociodemográficos y clínicos
    if (grupoSanguineo !== undefined) paciente.grupoSanguineo = grupoSanguineo.trim() || undefined;
    if (rh !== undefined) paciente.rh = rh.trim() || undefined;
    if (escolaridad !== undefined) paciente.escolaridad = escolaridad.trim() || undefined;
    if (ocupacion !== undefined) paciente.ocupacion = ocupacion.trim() || undefined;
    if (condicionDesplazamiento !== undefined) paciente.condicionDesplazamiento = condicionDesplazamiento.trim() || undefined;
    if (grupoEtnico !== undefined) paciente.grupoEtnico = grupoEtnico.trim() || undefined;
    if (aseguradora !== undefined) paciente.aseguradora = aseguradora.trim() || undefined;

    await paciente.save();

    // Actualizar o crear configuración de seguridad
    let configuracionSeguridad = await ConfiguracionSeguridadPaciente.findOne({ paciente: pacienteId });

    if (!configuracionSeguridad) {
      configuracionSeguridad = await ConfiguracionSeguridadPaciente.create({
        paciente: pacienteId,
        autenticacionDosFactores: autenticacionDosFactores || false,
        recordarDispositivo: recordarDispositivo || false,
        autenticacionBiometrica: autenticacionBiometrica || false,
        tipoBiometrico: tipoBiometrico || 'ninguno',
        visualizarContrasena: visualizarContrasena || false,
        metodoNotificacion: metodoNotificacion || 'whatsapp',
        aceptaTerminos: aceptaTerminos || false,
        aceptaConsentimiento: aceptaConsentimiento || false,
        fechaAceptacionTerminos: aceptaTerminos ? new Date() : undefined,
        fechaAceptacionConsentimiento: aceptaConsentimiento ? new Date() : undefined
      });
    } else {
      if (autenticacionDosFactores !== undefined) configuracionSeguridad.autenticacionDosFactores = autenticacionDosFactores;
      if (recordarDispositivo !== undefined) configuracionSeguridad.recordarDispositivo = recordarDispositivo;
      if (autenticacionBiometrica !== undefined) configuracionSeguridad.autenticacionBiometrica = autenticacionBiometrica;
      if (tipoBiometrico !== undefined) configuracionSeguridad.tipoBiometrico = tipoBiometrico;
      if (visualizarContrasena !== undefined) configuracionSeguridad.visualizarContrasena = visualizarContrasena;
      if (metodoNotificacion !== undefined) configuracionSeguridad.metodoNotificacion = metodoNotificacion;
      if (aceptaTerminos !== undefined) {
        configuracionSeguridad.aceptaTerminos = aceptaTerminos;
        if (aceptaTerminos && !configuracionSeguridad.fechaAceptacionTerminos) {
          configuracionSeguridad.fechaAceptacionTerminos = new Date();
        }
      }
      if (aceptaConsentimiento !== undefined) {
        configuracionSeguridad.aceptaConsentimiento = aceptaConsentimiento;
        if (aceptaConsentimiento && !configuracionSeguridad.fechaAceptacionConsentimiento) {
          configuracionSeguridad.fechaAceptacionConsentimiento = new Date();
        }
      }
      if (consentimientosDetalle !== undefined && typeof consentimientosDetalle === 'object' && consentimientosDetalle !== null) {
        configuracionSeguridad.consentimientosDetalle = consentimientosDetalle;
      }
      await configuracionSeguridad.save();
    }

    // Obtener datos actualizados
    const pacienteActualizado = await Paciente.findById(pacienteId).select('-password');
    const configuracionActualizada = await ConfiguracionSeguridadPaciente.findOne({ paciente: pacienteId });

    res.status(200).json({
      success: true,
      message: 'Perfil actualizado exitosamente',
      data: {
        paciente: pacienteActualizado,
        configuracionSeguridad: configuracionActualizada
      }
    });
  } catch (error) {
    console.error('Error al actualizar el perfil del paciente:', error);
    res.status(500).json({ message: 'Error interno del servidor al actualizar el perfil' });
  }
};

