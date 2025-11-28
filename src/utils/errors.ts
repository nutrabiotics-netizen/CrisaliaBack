export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const handleError = (error: Error, res: any): void => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      message: error.message,
      status: 'error'
    });
  } else {
    res.status(500).json({
      message: 'Error interno del servidor',
      status: 'error'
    });
  }
};

