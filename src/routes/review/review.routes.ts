import { Router } from "express";
import { createReview, getBestReviews, getReviews } from "../../controller/review/review.controller.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { feildValidator } from "../../middleware/fieldValidator/validate.js";
import { reviewSchema } from "../../schemas/schema.js";
const reviewRouter = Router();


reviewRouter.post("/create",feildValidator(reviewSchema),asyncHandler(createReview));
reviewRouter.get("/all",asyncHandler(getReviews));
reviewRouter.get("/best",asyncHandler(getBestReviews));


export default reviewRouter;