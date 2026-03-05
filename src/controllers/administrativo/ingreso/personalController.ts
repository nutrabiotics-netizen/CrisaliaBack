import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import PersonalInstitucional from '../../../models/PersonalInstitucional';
import Administrativo from '../../../models/Administrativo';
import mongoose from 'mongoose';
import { UserRole } from '../../../types';

const TIPOS = ['asistencial', 'administrativo'] as const;

/** Listar personal (opcional filtro por tipo) */
export const listar = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tipo = req.query.tipo as string | undefined;
    const filter: Record<string, unknown> = {};
    if (tipo && TIPOS.includes(tipo as any)) filter.tipo = tipo;
    const personal = await PersonalInstitucional.find(filter).sort({ tipo: 1, nombre: 1 }).lean();
    res.json({ success: true, data: personal });
  } catch (error: any) {
    console.error('Error al listar personal:', error);
    res.status(500).json({ success: false, message: 'Error al listar personal', error: error.message });
  }
};

/** Obtener uno por ID */
export const obtenerPorId = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'ID inválido' });
      return;
    }
    const p = await PersonalInstitucional.findById(id).lean();
    if (!p) {
      res.status(404).json({ success: false, message: 'Personal no encontrado' });
      return;
    }
    res.json({ success: true, data: p });
  } catch (error: any) {
    console.error('Error al obtener personal:', error);
    res.status(500).json({ success: false, message: 'Error al obtener personal', error: error.message });
  }
};

/** Crear */
export const crear = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { tipo, nombre, apellido, cargo, activo, email, password } = req.body;
    if (!nombre?.trim() || !cargo?.trim()) {
      res.status(400).json({ success: false, message: 'Nombre y cargo son requeridos' });
      return;
    }
    const tipoValido = tipo && TIPOS.includes(tipo) ? tipo : 'administrativo';
    const personal = await PersonalInstitucional.create({
      tipo: tipoValido,
      nombre: nombre.trim(),
      apellido: (apellido ?? '').trim() || undefined,
      cargo: cargo.trim(),
      activo: activo !== false,
      email: tipoValido === 'administrativo' && email?.trim() ? email.trim().toLowerCase() : undefined
    });
    if (tipoValido === 'administrativo' && email?.trim() && password) {
      const emailNorm = email.trim().toLowerCase();
      const existente = await Administrativo.findOne({ email: emailNorm });
      if (existente) {
        await PersonalInstitucional.findByIdAndDelete(personal._id);
        res.status(400).json({ success: false, message: 'Ya existe un usuario con ese correo' });
        return;
      }
      const admin = await Administrativo.create({
        email: emailNorm,
        password: String(password),
        nombre: personal.nombre,
        apellido: (personal.apellido || '').trim() || ' ',
        cargo: personal.cargo,
        activo: true,
        role: UserRole.ADMINISTRATIVO,
        personalInstitucionalId: personal._id
      });
      personal.administrativoId = admin._id;
      await personal.save();
    }
    const data = await PersonalInstitucional.findById(personal._id).lean();
    res.status(201).json({ success: true, message: 'Personal creado correctamente', data: data || personal });
  } catch (error: any) {
    console.error('Error al crear personal:', error);
    res.status(500).json({ success: false, message: 'Error al crear personal', error: error.message });
  }
};

/** Actualizar */
export const actualizar = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { tipo, nombre, apellido, cargo, activo, email, password } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'ID inválido' });
      return;
    }
    const prev = await PersonalInstitucional.findById(id);
    if (!prev) {
      res.status(404).json({ success: false, message: 'Personal no encontrado' });
      return;
    }
    const update: Record<string, unknown> = {};
    if (tipo !== undefined) update.tipo = TIPOS.includes(tipo) ? tipo : 'administrativo';
    if (nombre !== undefined) update.nombre = String(nombre).trim();
    if (apellido !== undefined) update.apellido = String(apellido).trim() || '';
    if (cargo !== undefined) update.cargo = String(cargo).trim();
    if (activo !== undefined) update.activo = activo !== false;
    if (prev.tipo === 'administrativo' && email !== undefined) {
      update.email = email?.trim() ? String(email).trim().toLowerCase() : null;
    }
    const personal = await PersonalInstitucional.findByIdAndUpdate(id, update, { new: true });
    if (!personal) {
      res.status(404).json({ success: false, message: 'Personal no encontrado' });
      return;
    }
    if (personal.tipo === 'administrativo' && personal.email) {
      const emailNorm = personal.email;
      let admin = await Administrativo.findOne({ personalInstitucionalId: personal._id });
      if (admin) {
        admin.nombre = personal.nombre;
        admin.apellido = (personal.apellido || '').trim() || ' ';
        admin.cargo = personal.cargo;
        admin.activo = personal.activo;
        admin.email = emailNorm;
        if (password && String(password).length >= 6) {
          admin.password = String(password);
          admin.markModified('password');
        }
        await admin.save();
      } else {
        const otro = await Administrativo.findOne({ email: emailNorm });
        if (otro) {
          res.status(400).json({ success: false, message: 'Ya existe un usuario con ese correo' });
          return;
        }
        admin = await Administrativo.create({
          email: emailNorm,
          password: String(password || 'temp123'),
          nombre: personal.nombre,
          apellido: (personal.apellido || '').trim() || ' ',
          cargo: personal.cargo,
          activo: true,
          role: UserRole.ADMINISTRATIVO,
          personalInstitucionalId: personal._id
        });
        personal.administrativoId = admin._id;
        await personal.save();
      }
    }
    const data = await PersonalInstitucional.findById(personal._id).lean();
    res.json({ success: true, message: 'Personal actualizado correctamente', data: data || personal });
  } catch (error: any) {
    console.error('Error al actualizar personal:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar personal', error: error.message });
  }
};

/** Eliminar */
export const eliminar = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'ID inválido' });
      return;
    }
    const p = await PersonalInstitucional.findById(id);
    if (!p) {
      res.status(404).json({ success: false, message: 'Personal no encontrado' });
      return;
    }
    if (p.administrativoId) {
      await Administrativo.findByIdAndUpdate(p.administrativoId, { activo: false });
    }
    await PersonalInstitucional.findByIdAndDelete(id);
    res.json({ success: true, message: 'Personal eliminado correctamente' });
  } catch (error: any) {
    console.error('Error al eliminar personal:', error);
    res.status(500).json({ success: false, message: 'Error al eliminar personal', error: error.message });
  }
};
