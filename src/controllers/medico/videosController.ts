import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { getVideoSignedUrl } from '../../utils/s3Videos';
import { handleError } from '../../utils/errors';

export const getVideoUrl = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const { key } = req.query;
    if (!key || typeof key !== 'string') {
      res.status(400).json({ success: false, message: 'El parámetro "key" es requerido' });
      return;
    }

    const url = await getVideoSignedUrl(key);
    res.status(200).json({ success: true, data: { url, expiresIn: 3600 } });
  } catch (err: any) {
    handleError(err, res);
  }
};
