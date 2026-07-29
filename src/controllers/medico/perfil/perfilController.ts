import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import perfilMedicoService from '../../../services/medico/perfil/perfilService';
import Medico from '../../../models/Medico';
import ConfiguracionAgenda from '../../../models/ConfiguracionAgenda';
import { handleError } from '../../../utils/errors';
import { uploadBinary } from '../../../utils/s3Documents';

export const getPerfilMedico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const medico = await perfilMedicoService.obtenerPerfilMedico(medicoId);

    if (!medico) {
      res.status(404).json({
        success: false,
        message: 'Médico no encontrado'
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Perfil obtenido exitosamente',
      data: medico
    });
  } catch (error: any) {
    handleError(error, res);
  }
};

export const updatePerfilMedico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const datosActualizacion = req.body;

    // Validar que al menos un campo sea proporcionado (incluye perfilVerificación para filtros y verificación)
    const camposPermitidos = [
      'nombre', 'apellido', 'email', 'telefono', 'especialidad', 'numeroColegiatura', 'logoUrl', 'firmaUrl', 'indicacionesAntesConsulta',
      'genero', 'fechaNacimiento', 'tipoDocumento', 'numeroDocumento', 'pais', 'ciudadVivienda', 'direccionVivienda', 'codigoPostal', 'celularContacto',
      'fotoMedicoUrl', 'fotoEntornoClinicoUrl', 'rethusTarjetaProfesional', 'tituloUniversitario', 'tituloEspecialidad', 'formacionMedicinaFuncional',
      'anosExperiencia', 'biografiaProfesional', 'subespecialidad', 'idiomas',
      'estiloPractica', 'modalidadesTerapeuticas', 'gruposInteres', 'motivosConsultaQueAtiende',
      'registroMinisterioSalud', 'direccionConsultorioHabilitado', 'telefonoLugarTrabajo'
    ];
    const camposProporcionados = Object.keys(datosActualizacion);
    const tieneCamposValidos = camposProporcionados.some(campo => camposPermitidos.includes(campo));

    if (!tieneCamposValidos) {
      res.status(400).json({
        success: false,
        message: 'Debe proporcionar al menos un campo válido para actualizar'
      });
      return;
    }

    const medicoActualizado = await perfilMedicoService.actualizarPerfilMedico(
      medicoId,
      datosActualizacion
    );

    res.status(200).json({
      success: true,
      message: 'Perfil actualizado exitosamente',
      data: medicoActualizado
    });
  } catch (error: any) {
    handleError(error, res);
  }
};

/**
 * GET /api/medico/perfil/preajustes
 * Devuelve el subdocumento de preajustes clínicos del médico.
 */
export const getPreajustes = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }
    const medico = await Medico.findById(medicoId).select('preajustes').lean();
    if (!medico) { res.status(404).json({ success: false, message: 'Médico no encontrado' }); return; }
    res.json({ success: true, data: medico.preajustes });
  } catch (err: any) {
    handleError(err, res);
  }
};

/**
 * PUT /api/medico/perfil/preajustes
 * Actualiza los preajustes clínicos del médico (merge parcial).
 * Body: Partial<IPreajustesMedico>
 */
export const updatePreajustes = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }

    const permitidos = [
      'duracionConsultaMin', 'duracionControlMin', 'intervaloEntreConsultasMin',
      'idioma', 'idiomas',
      'firmaImagenUrl', 'plantillaObservaciones', 'semaforoColores',
      'modalidadesAtencion', 'direccionAtencionPresencial',
      'anticipacionMinimaHoras', 'maximoConsultasDia', 'tiposPacientes',
    ];
    const update: Record<string, unknown> = {};
    for (const key of permitidos) {
      if (req.body[key] !== undefined) update[`preajustes.${key}`] = req.body[key];
    }

    if (Object.keys(update).length === 0) {
      res.status(400).json({ success: false, message: 'No se proporcionaron campos válidos.' });
      return;
    }

    const medico = await Medico.findByIdAndUpdate(
      medicoId,
      { $set: update },
      { new: true, runValidators: true }
    ).select('preajustes').lean();

    // Sincronizar ConfiguracionAgenda.consultaRapida según modalidadesAtencion
    if (req.body.modalidadesAtencion !== undefined) {
      const modalidades: string[] = req.body.modalidadesAtencion ?? [];
      const habilitada = modalidades.includes('Consulta rápida - Chat') || modalidades.includes('Consulta rápida - Videollamada');
      const modalidadesConfig: ('chat' | 'teleconsulta')[] = [];
      if (modalidades.includes('Consulta rápida - Chat')) modalidadesConfig.push('chat');
      if (modalidades.includes('Consulta rápida - Videollamada')) modalidadesConfig.push('teleconsulta');

      await ConfiguracionAgenda.findOneAndUpdate(
        { medico: medicoId },
        { $set: { 'consultaRapida.habilitada': habilitada, 'consultaRapida.modalidades': modalidadesConfig } },
        { upsert: true }
      );
    }

    res.json({ success: true, data: medico?.preajustes });
  } catch (err: any) {
    handleError(err, res);
  }
};

/**
 * GET /api/medico/perfil/aliados
 * Devuelve el estado de los aliados del médico (ALIVIA, NUTRAPP, AMF).
 */
export const getAliados = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }
    const medico = await Medico.findById(medicoId).select('aliados').lean();
    if (!medico) { res.status(404).json({ success: false, message: 'Médico no encontrado' }); return; }
    // No exponer tokens
    const aliados = medico.aliados ?? {};
    res.json({ success: true, data: aliados });
  } catch (err: any) {
    handleError(err, res);
  }
};

/**
 * PUT /api/medico/perfil/aliados/:aliado
 * Actualiza la configuración de un aliado (alivia | nutrapp | amf).
 * Body: { activo: boolean, userId?: string }
 */
export const updateAliado = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }

    const aliado = String(req.params.aliado);
    if (!['alivia', 'nutrapp', 'amf'].includes(aliado)) {
      res.status(400).json({ success: false, message: 'Aliado inválido. Use: alivia, nutrapp o amf.' });
      return;
    }

    const { activo, userId, membresiaId, permisos } = req.body;
    const update: Record<string, unknown> = {};
    if (activo !== undefined) update[`aliados.${aliado}.activo`] = activo;
    if (userId !== undefined) update[`aliados.${aliado}.userId`] = userId;
    if (membresiaId !== undefined && aliado === 'amf') update[`aliados.amf.membresiaId`] = membresiaId;
    if (permisos?.compartirDatosAdmin !== undefined) update[`aliados.${aliado}.permisos.compartirDatosAdmin`] = permisos.compartirDatosAdmin;
    if (permisos?.compartirDocumentos !== undefined) update[`aliados.${aliado}.permisos.compartirDocumentos`] = permisos.compartirDocumentos;

    const medico = await Medico.findByIdAndUpdate(
      medicoId,
      { $set: update },
      { new: true }
    ).select('aliados').lean();

    res.json({ success: true, data: medico?.aliados });
  } catch (err: any) {
    handleError(err, res);
  }
};

/**
 * GET /api/medico/perfil/suscripcion
 * Devuelve el estado de la suscripción y el plan de prueba del médico.
 */
export const getSuscripcion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }
    const medico = await Medico.findById(medicoId).select('suscripcionActiva planPrueba').lean();
    if (!medico) { res.status(404).json({ success: false, message: 'Médico no encontrado' }); return; }
    res.json({
      success: true,
      data: {
        suscripcionActiva: medico.suscripcionActiva,
        planPrueba: medico.planPrueba,
        cuposDisponibles: medico.suscripcionActiva
          ? null
          : Math.max(0, (medico.planPrueba?.limite ?? 3) - (medico.planPrueba?.pacientesUsados ?? 0))
      }
    });
  } catch (err: any) {
    handleError(err, res);
  }
};

/**
 * POST /api/medico/perfil/firma
 * Recibe imagen de firma (field: "firma"), la sube a S3 y guarda la URL en medico.firmaUrl.
 */
export const subirFirmaMedico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) { res.status(400).json({ success: false, message: 'No se recibió ningún archivo.' }); return; }

    const ext = file.mimetype === 'image/png' ? '.png' : file.mimetype === 'image/webp' ? '.webp' : '.jpg';
    const key = `medicos/${medicoId}/firma${ext}`;
    await uploadBinary(file.buffer, key, file.mimetype);

    const bucketName = process.env.AWS_S3_DOCUMENTS_BUCKET || '';
    const region = process.env.AWS_REGION || 'us-east-1';
    const firmaUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;

    await Medico.findByIdAndUpdate(medicoId, { $set: { firmaUrl } });

    res.json({ success: true, data: { firmaUrl } });
  } catch (err: any) {
    handleError(err, res);
  }
};

/**
 * POST /api/medico/perfil/foto
 * Recibe un archivo de imagen (field: "foto"), lo sube a S3 y guarda la URL en perfilVerificacion.fotoMedicoUrl.
 */
export const subirFotoMedico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) { res.status(400).json({ success: false, message: 'No se recibió ningún archivo.' }); return; }

    const ext = file.mimetype === 'image/png' ? '.png' : file.mimetype === 'image/webp' ? '.webp' : '.jpg';
    const key = `medicos/${medicoId}/foto-perfil${ext}`;
    await uploadBinary(file.buffer, key, file.mimetype);

    const bucketName = process.env.AWS_S3_DOCUMENTS_BUCKET || '';
    const region = process.env.AWS_REGION || 'us-east-1';
    const fotoUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;

    const medico = await Medico.findById(medicoId);
    if (!medico) { res.status(404).json({ success: false, message: 'Médico no encontrado' }); return; }

    const pv = (medico.perfilVerificacion && typeof medico.perfilVerificacion === 'object')
      ? { ...medico.perfilVerificacion }
      : {};
    (pv as Record<string, unknown>).fotoMedicoUrl = fotoUrl;
    medico.perfilVerificacion = pv;
    await medico.save();

    res.json({ success: true, data: { fotoUrl } });
  } catch (err: any) {
    handleError(err, res);
  }
};
