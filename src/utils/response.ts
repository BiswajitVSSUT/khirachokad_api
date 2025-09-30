import { Response } from "express";

export const sendSuccess = <T = any>(
  res: Response,
  message: string,
  data: T | null = null,
  statusCode = 200
) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

export const sendError = (
  res: Response,
  message: string,
  error: any = null,
  statusCode = 500
) => {
  return res.status(statusCode).json({
    success: false,
    message,
    error,
  });
};
