import { ZodObject } from "zod";
import { Request, Response, NextFunction } from "express";
import { sendError } from "../../utils/response.js";

export const feildValidator =
  (schema: ZodObject) =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return sendError(
        res,
        "Validation failed",
        result.error.message,
        400
      );
    }

    
    req.body = result.data;
    next();
  };
