import { Request, Response, NextFunction } from "express";

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err?.statusCode || 500;
  const message = err?.message || "Internal Server Error";
  const error = process.env.NODE_ENV === "production" ? undefined : err?.stack;

  req.log.error({ err, statusCode }, "Unhandled request error");

  res.status(statusCode).json({
    success: false,
    message,
    error,
  });
};
