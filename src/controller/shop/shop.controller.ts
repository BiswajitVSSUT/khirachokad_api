import { Request, Response } from "express";
import z from "zod";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

import { sendSuccess, sendError } from "../../utils/response.js";

export const createShop = async (req: Request, res: Response) => {
  try {
    const {
      userId, 
      name,
      description,
      logo,
      contactNumber,
      contactNumber2,
      contactEmail,
      postalCode,
      blockName,
      district
    } = req.body;

    // Validate required userId
    if(!userId) return sendError(res , "userId is required" , null , 400)

    const newShop = await prisma.shop.create({
      data: {
        name,
        description,
        logo,
        contactNumber,
        contactNumber2: contactNumber2 || null,
        contactEmail,
        postalCode: postalCode || null,
        blockName: blockName || null,
        district: district || null,
        user: {
          connect: { id : userId}
        }
      }
    });

    sendSuccess(res, "New shop created successfully", { newShop }, 201);
  } catch (error: any) {
    console.error('Create shop error:', error);
    sendError(res, error.message || "Failed to create shop", null, 500);
  }
};

export const getAllShop = async (req: Request, res: Response) => {
  const { id } = req.params

  if (!id) return sendError(res, "Id is required", null, 400)

  const shop = await prisma.shop.findMany({
    where: {
      userId: id
    }
  });
  if (!shop) return sendError(res, "Failed to get shop", null, 404);
  sendSuccess(res, "Shop fetched", shop, 200);
};

export const updateShop = async (req: Request, res: Response) => {
  const {
    id,
    name,
    description,
    logo,
    contactNumber,
    contactNumber2,
    contactEmail,
    postalCode,
    blockName,
    district,
  } = req.body;
  if (!id.trim()) return sendError(res, "All fields are required", 400);
  let updateData: any = {};
  if (name !== undefined && name !== "") updateData.name = name;
  if (description !== undefined && description !== "") updateData.description = description;
  if (logo !== undefined && logo !== "") updateData.logo = logo;
  if (contactNumber !== undefined && contactNumber !== "") updateData.contactNumber = contactNumber;
  if (contactNumber2 !== undefined && contactNumber2 !== "") updateData.contactNumber2 = contactNumber2;
  if (contactEmail !== undefined && contactEmail !== "") updateData.contactEmail = contactEmail;
  if (postalCode !== undefined && postalCode !== "") updateData.postalCode = postalCode;
  if (blockName !== undefined && blockName !== "") updateData.blockName = blockName;
  if (district !== undefined && district !== "") updateData.district = district;

  if (Object.keys(updateData).length === 0) return sendError(res, "No fields to update", 400);
  const updatedShop = await prisma.shop.update({
    where: {
      id
    },
    data: updateData
  });
  if (!updatedShop) return sendError(res, "Failed to update shop", 400);
  sendSuccess(res, "Shop updated successfully", updateShop, 200)
};

export const deleteShop = async (req: Request, res: Response) => {
  const { shopId } = req.params

  if (!shopId) return sendError(res, "Shop ID is required", null, 400)

  const existingShop = await prisma.shop.findUnique({
    where: { id: shopId }
  });

  if (!existingShop) {
    return sendError(res, "Shop not found", null, 404);
  }

  const shop = await prisma.shop.delete({
    where: { id: shopId }
  });
  sendSuccess(res, "Shop deleted successfully", shop, 200);
};