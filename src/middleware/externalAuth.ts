import { Request, Response, NextFunction } from 'express';

/**
 * Middleware de autenticación para APIs Externas
 * Valida un token de una sola vez desde variable de entorno
 */
export const authenticateExternal = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const token = req.headers.authorization?.split(' ')[1] || req.headers['x-external-token'] as string;

    if (!token) {
      res.status(401).json({ 
        success: false,
        message: 'Token de autenticación externa no proporcionado' 
      });
      return;
    }

    // Obtener token desde variable de entorno
    const externalToken = process.env.EXTERNAL_API_TOKEN;

    if (!externalToken) {
      console.error('EXTERNAL_API_TOKEN no está configurado en las variables de entorno');
      res.status(500).json({ 
        success: false,
        message: 'Error de configuración del servidor' 
      });
      return;
    }

    // Validar token
    if (token !== externalToken) {
      res.status(401).json({ 
        success: false,
        message: 'Token de autenticación externa inválido' 
      });
      return;
    }

    // Token válido, continuar
    next();
  } catch (error) {
    res.status(401).json({ 
      success: false,
      message: 'Error al validar token de autenticación externa' 
    });
  }
};
