import { Router } from "express";
const shopRouter = Router();


import { asyncHandler } from "../../utils/asyncHandler.js";
import { createShop, deleteShop, getShop, updateShop } from "../../controller/shop/shop.controller.js";
import { adminAuthValidation } from "../../middleware/auth/admin.auth.middleware.js";
import { feildValidator } from "../../middleware/fieldValidator/validate.js";
import { shopSchema } from "../../schemas/schema.js";

shopRouter.post("/create",adminAuthValidation,feildValidator(shopSchema),asyncHandler(createShop));
shopRouter.get("/",asyncHandler(getShop));
shopRouter.put("/update", adminAuthValidation, asyncHandler(updateShop));
shopRouter.delete("/delete/:shopId" , adminAuthValidation , asyncHandler(deleteShop))

export default shopRouter