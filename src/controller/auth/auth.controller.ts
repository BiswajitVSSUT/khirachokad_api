import { Request, Response } from "express";
import z from "zod";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendSuccess, sendError } from "../../utils/response.js";


export const signUp = async (req: Request, res: Response) => {
  const schema = z.object({
    name: z.string().min(3).max(60),
    email: z.email(),
    password: z
      .string()
      .min(5)
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).+$/, {
        message:
          "Password must include uppercase, lowercase, number, and special character",
      }),
    avatar: z.url().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, "Validation failed", parsed.error, 400);
  }

  const { name, email, password, avatar } = parsed.data;

  const existingUser = await prisma.admin.findUnique({ where: { email } });
  if (existingUser) return sendError(res, "Admin already exists", null, 409);

  const hashedPassword = await bcrypt.hash(password, 10);

  const newAdmin = await prisma.admin.create({
    data: { name, email, password: hashedPassword, avatar: avatar ?? "" },
  });

  const token = jwt.sign(
    { id: newAdmin.id, email: newAdmin.email, name: newAdmin.name },
    process.env.JWT_SECRET!,
    { expiresIn: "30d" }
  );

  const { password: _, ...adminData } = newAdmin;
  return sendSuccess(res, "User created successfully", { admin: adminData, token }, 201);
};

export const signIn = async (req: Request, res: Response) => {
  const schema = z.object({
    email: z.email(),
    password: z.string().min(5),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, "Validation failed", parsed.error, 400);

  const { email, password } = parsed.data;

  const existingAdmin = await prisma.admin.findUnique({ where: { email } });
  if (!existingAdmin) return sendError(res, "Admin not found", null, 404);

  const isPasswordValid = await bcrypt.compare(password, existingAdmin.password);
  if (!isPasswordValid) return sendError(res, "Invalid password", null, 401);

  const token = jwt.sign(
    { id: existingAdmin.id, email: existingAdmin.email, name: existingAdmin.name },
    process.env.JWT_SECRET!,
    { expiresIn: "30d" }
  );

  const { password: _, ...adminData } = existingAdmin;
  return sendSuccess(res, "Sign in successful", { token, admin: adminData }, 200);
};

export const updatePassword = async (req: Request, res: Response) => {
  const schema = z.object({
    adminId: z.string().uuid(),
    currentPassword: z.string(),
    newPassword: z
      .string()
      .min(5)
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).+$/, {
        message:
          "Password must include uppercase, lowercase, number, and special character",
      }),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, "Validation failed", parsed.error, 400);

  const { adminId, currentPassword, newPassword } = parsed.data;

  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin) return sendError(res, "No Admin found", null, 404);

  const isMatch = await bcrypt.compare(currentPassword, admin.password);
  if (!isMatch) return sendError(res, "Invalid current password", null, 401);

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.admin.update({
    where: { id: adminId },
    data: { password: hashedPassword },
  });

  return sendSuccess(res, "Password updated successfully", null, 200);
};
