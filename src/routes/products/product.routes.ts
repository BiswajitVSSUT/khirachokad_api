import { Router } from "express";
import { adminAuthValidation } from "../../middleware/auth/admin.auth.middleware.js";
import { feildValidator } from "../../middleware/fieldValidator/validate.js";
import { productSchema } from "../../schemas/schema.js";
import { createProduct, getProducts, refreshProductQr, updateProduct, verifyProduct } from "../../controller/product/product.controller.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
const productRouter = Router();



productRouter.post("/create",adminAuthValidation,feildValidator(productSchema),asyncHandler(createProduct))
productRouter.get("/",asyncHandler(getProducts));
productRouter.put("/update",adminAuthValidation,asyncHandler(updateProduct));
productRouter.get("/verify/:verificationCode",asyncHandler(verifyProduct));
productRouter.put("/qr-refresh",adminAuthValidation, asyncHandler(refreshProductQr));


export default productRouter;