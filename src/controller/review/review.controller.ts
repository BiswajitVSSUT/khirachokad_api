import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { sendError, sendSuccess } from "../../utils/response.js";
const prisma = new PrismaClient();




export const createReview = async(req: Request, res: Response)=>{
    const newReview = await prisma.review.create({
        data:req.body
    });
    if(!newReview) return sendError(res,"Failed to create review",400);
    sendSuccess(res,"Review created successfully",newReview,201);
}


export const getReviews = async(req: Request, res: Response)=>{
    const reviews = await prisma.review.findMany();
    if(!reviews || reviews.length === 0) return sendError(res,"No review found",404);
    sendSuccess(res,"Reviews fetched",reviews,200);
}


export const getBestReviews  = async(req: Request, res: Response)=>{
    const bestReviews = await prisma.review.findMany({
        where:{
            rating:5
        }
    });
    if(!bestReviews || bestReviews.length === 0) return sendError(res,"no best review found",404);
    sendSuccess(res,"Best reviews fetched successfully",bestReviews,200)
}