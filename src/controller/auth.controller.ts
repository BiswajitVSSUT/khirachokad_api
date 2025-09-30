import { Request, Response } from "express";
import z from "zod";
import { PrismaClient } from "../generated/prisma/index.js";
const prisma = new PrismaClient();
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const signUp = async (request: Request, response: Response) => {
  try {
    const schema = z.object({
      name: z.string(),
      email: z.string().email(),
      password: z
        .string()
        .min(5)
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).+$/, {
          message:
            "Password must include uppercase, lowercase, number, and special character",
        }),
        
      avatar: z.string().url()
    });
    const results = schema.safeParse(request.body);
    if (!results.success) {
      response.status(400).json({
        message: results.error,
      });
      return;
    }
    const { name, email, password, avatar } = results.data;
    const hashedUserPassword = bcrypt.hashSync(password, 10);
    const existingUser = await prisma.admin.findUnique({ where: { email } });
    if (existingUser) {
      response.status(409).json({
        message: "Admin already exists",
      });
      return;
    }

    const newAdmin = await prisma.admin.create({
      data: {
        name,
        email,
        password: hashedUserPassword,
        avatar,
      },
    });
    if (!newAdmin) {
      response.status(500).json({
        message: "Failed to create user",
      });
    }
    const token = jwt.sign(
      { name,
        email,},
      process.env.JWT_SECRET!,
      {
        expiresIn: "30days",
      }
    );

 

    response.status(200).json({
      message: "User Created successfully",
      newAdmin: newAdmin,
      token: token,
    });
  } catch (error) {
    const err = error as Error;
    response.status(500).json({
      messsage: "Internal Server Error",
      error: err.message,
    });
  }
};

export const signIn = async (request: Request, response: Response) => {
  try {
    // Define and validate schema
    const schema = z.object({
      email: z.string().email(),
      password: z
        .string()
        .min(5)
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).+$/, {
          message:
            "Password must include uppercase, lowercase, number, and special character",
        }),
    });

    const result = schema.safeParse(request.body);
    if (!result.success) {
      response.status(400).json({
        message: "Validation failed",
        errors: result.error,
      });
      return;
    }

    const { email, password } = result.data;

    const existingAdmin = await prisma.admin.findUnique({
      where: { email },
    });

    if (!existingAdmin) {
      response.status(404).json({
        message: "Admin not found",
      });
      return;
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      existingAdmin.password
    );

    if (!isPasswordValid) {
      response.status(401).json({
        message: "Invalid password",
      });
      return;
    }

    const token = jwt.sign(
      {
       email:existingAdmin.email,name:existingAdmin.name       
      },
      process.env.JWT_SECRET!,
      { expiresIn: "30d" }
    );
    return response.status(200).json({
      message: "Sign in successful",
      token,
      existingAdmin
      
    });
  } catch (error) {
    const err = error as Error;
    return response.status(500).json({
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

export const updatePassword = async (req: Request, res: Response) => {
  try {
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

    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        message: "Validation failed",
        errors: result.error,
      });
      return ;
    }

    const { currentPassword, newPassword, adminId } = result.data;

    const admin = await prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin) {
      res.status(404).json({ message: "No Admin found" });
      return 
    }

    const isMatch = await bcrypt.compare(currentPassword, admin.password);
    if (!isMatch) {
      res.status(401).json({ message: "Invalid current password" });
      return 
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.admin.update({
      where: { id: adminId },
      data: { password: hashedPassword },
    });

    return res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({
      message: "Internal server error",
      error: err.message,
    });
    return 
  }
};

