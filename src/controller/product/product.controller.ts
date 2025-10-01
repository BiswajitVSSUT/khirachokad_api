import { Request, Response } from "express";

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
    const qrcodeUrl = `https://khirachokada.com/verify/${verificationCode}`
    if(!product) return sendError(res,"Failed to create product",400);
    sendSuccess(res,"Product created successfully",{product,qrcodeUrl},201);

}

export const getProducts = async(req: Request, res: Response)=>{
    const products = await prisma.products.findMany()
    if(!products || products.length === 0) return sendError(res,"Failed to get products",404);
    sendSuccess(res,"Products fetched",products,200);
}


export const updateProduct = async(req: Request, res: Response)=>{
  const { name,
      description,
      price,
      image ,
      id,
      expairyDate,
      shopId} = req.body
     
      let updateData: any = {};
      if(!id || !id.trim()) return sendError(res,"All fields are requireed",400)
      if(description !== undefined && description.length!== "") updateData.description = description;
      if(price !== undefined && price!== "") updateData.price = price;
      if(image !== undefined && image!== "") updateData.image = image;
      if(expairyDate !== undefined && expairyDate!== "") updateData.expairyDate = expairyDate;
      if(shopId !== undefined && shopId!== "") updateData.shopId = shopId;
       if(name !== undefined && name!== "") updateData.name = name;

      if(Object.keys(updateData).length === 0) return sendError(res,"No data to update",400)
   
       const updatedProduct = await prisma.products.update({
        where:{
          id
        },
        data:updateData
      })
    
   
      if(!updatedProduct) return sendError(res,"Failed to update the product",400);
      sendSuccess(res, "Product updated successfully",updatedProduct,200);
}



export const verifyProduct = async(req: Request, res: Response)=>{
  const {verificationCode} = req.params
  if(!verificationCode?.trim()) return sendError(res,"All fields are required");
  const product = await prisma.products.findMany({
    where:{verificationId:verificationCode}
  })
  if(!product || product.length === 0) return sendError(res,"Fake product",404);
  sendSuccess(res,"Verified product",200);
}


export const refreshProductQr = async(req: Request, res: Response)=>{
  const {id} = req.body;

  if(!id.trim() || id === undefined) return sendError(res,"All fields are required",400);
  const newVerificationCode = crypto.randomUUID();
  const updatedQr = await prisma.products.update({
    where:{
      id
    },
    data:{
      verificationId:newVerificationCode
    }
  })
  if(!updatedQr) return sendError(res,"Failed to update QR",400);
  const newQrURL = `https://khirachokada.com/verify/${updatedQr.verificationId}`;
  sendSuccess(res,"QR Code updated successfully",{updatedQr,newQrURL},200)
}