import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../utils/appError';

export const notFound = (req: Request, _res: Response, next: NextFunction) =>
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));

export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  let status = 500;
  let message = 'Internal server error';
  let details: unknown;

  if (err instanceof AppError) {
    status = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err?.code === 11000) {
    status = 409;
    message = 'Resource already exists';
  } else if (err?.name === 'CastError') {
    status = 400;
    message = 'Invalid identifier';
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  }

  if (status === 500) console.error(err);
  res.status(status).json({
    success: false,
    message,
    ...(details !== undefined && { details }),
    ...(env.NODE_ENV === 'development' && status === 500 && { stack: err?.stack }),
  });
};
