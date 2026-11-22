import { Response } from 'express';

export const ok = (res: Response, data?: unknown, message?: string, status = 200) =>
  res.status(status).json({ success: true, ...(message && { message }), ...(data !== undefined && { data }) });
