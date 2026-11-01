import { Router } from "express";

import {
  completeOrder,
  confirmOrder,
  getOrder,
  listOrders,
  rejectOrder,
} from "../../controller/order/order.controller.js";
import { adminAuthValidation } from "../../middleware/auth/admin.auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const orderRouter = Router();

orderRouter.use(adminAuthValidation);

orderRouter.get("/", asyncHandler(listOrders));
orderRouter.get("/:id", asyncHandler(getOrder));
orderRouter.post("/:id/confirm", asyncHandler(confirmOrder));
orderRouter.post("/:id/reject", asyncHandler(rejectOrder));
orderRouter.post("/:id/complete", asyncHandler(completeOrder));

export default orderRouter;
