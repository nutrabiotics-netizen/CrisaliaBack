import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';

// Compatibilidad con el cliente que precarga al marcar el maniquí.
export const precargar = async (_req: AuthRequest, res: Response): Promise<void> => {
  res.json({ success: true });
};
export { responderFase1 as responder } from './fase1Controller';
export { responderFase2 as responderInterrogatorio } from './fase2Controller';
