
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export function errorHandler(err: AppError, req: Request, res: Response, next: NextFunction) {
  err.statusCode = err.statusCode || 500;
  err.isOperational = err.isOperational || false;

  logger.error('API Error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  const message = process.env.NODE_ENV === 'production' && !err.isOperational
    ? 'Something went wrong!'
    : err.message;

  res.status(err.statusCode).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: 'Resource not found',
    path: req.path,
  });
}