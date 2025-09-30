import { Request, Response } from "express";
import z from "zod";
import { PrismaClient } from "@prisma/client";
import { sendError, sendSuccess } from "../../utils/response.js";
const prisma = new PrismaClient();
import crypto from "crypto"


export const createProduct = async(req: Request, res: Response)=>{
    const verificationCode = crypto.randomUUID();
    const { name,
      description,
      price,
      image ,

      expairyDate,
      shopId} = req.body
    const product = await prisma.products.create({
      data: {
        verificationId: verificationCode,
        name,
        description,
        price, 
        image,

        expairyDate,
        shop: { connect: { id: shopId } },
      }
    })
    if(!product) return sendError(res,"Failed to create product",400);
    sendSuccess(res,"Product created successfully",product,201);

}

export const getProducts = async(req: Request, res: Response)=>{
    const products = await prisma.products.findMany()
    if(!products || products.length === 0) return sendError(res,"Failed to get products",404);
    sendSuccess(res,"Products fetched",products,200);
}