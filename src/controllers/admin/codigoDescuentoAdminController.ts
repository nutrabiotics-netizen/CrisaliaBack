import { Request, Response } from 'express';
import CodigoDescuento from '../../models/CodigoDescuento';

/** POST /api/admin/codigos-descuento */
export const crearCodigo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { codigo, tipo, valor, medicoId, origen, maxUsos, expiresAt } = req.body;
    const nuevo = await CodigoDescuento.create({
      codigo: codigo.toUpperCase().trim(),
      tipo,
      valor,
      medicoId: medicoId || undefined,
      origen,
      maxUsos,
      expiresAt: new Date(expiresAt)
    });
    res.status(201).json({ success: true, data: nuevo });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(409).json({ success: false, error: 'El código ya existe.' });
      return;
    }
    res.status(500).json({ success: false, error: error?.message || 'Error al crear código.' });
  }
};

/** GET /api/admin/codigos-descuento */
export const listarCodigos = async (_req: Request, res: Response): Promise<void> => {
  try {
    const codigos = await CodigoDescuento.find()
      .populate('medicoId', 'nombre apellido')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: codigos });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al listar códigos.' });
  }
};

/** PUT /api/admin/codigos-descuento/:id */
export const editarCodigo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const actualizado = await CodigoDescuento.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!actualizado) {
      res.status(404).json({ success: false, error: 'Código no encontrado.' });
      return;
    }
    res.json({ success: true, data: actualizado });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Error al editar código.' });
  }
};

/** DELETE /api/admin/codigos-descuento/:id */
export const desactivarCodigo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await CodigoDescuento.findByIdAndUpdate(id, { activo: false });
    res.json({ success: true, mensaje: 'Código desactivado.' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al desactivar código.' });
  }
};
