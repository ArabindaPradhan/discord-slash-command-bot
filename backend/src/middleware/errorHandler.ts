import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types';

/**
 * Global error handler — must be registered last in Express middleware chain.
 * Never exposes internal stack traces to clients.
 */
export function errorHandler(
  err: Error & { status?: number; statusCode?: number },
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const status = err.status ?? err.statusCode ?? 500;

  const body: ApiResponse = {
    success: false,
    error: status >= 500
      ? 'Internal server error'         // Do NOT expose stack traces
      : err.message ?? 'Request failed',
  };

  res.status(status).json(body);
}

/**
 * 404 handler — catches unmatched routes.
 */
export function notFoundHandler(_req: Request, res: Response): void {
  const body: ApiResponse = {
    success: false,
    error: 'Route not found',
  };
  res.status(404).json(body);
}
