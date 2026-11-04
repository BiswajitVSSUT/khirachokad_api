import { Router } from "express";
import { clearChat, createQuickReply, deleteQuickReply, getChat, listChats, listQuickReplies, sendChatMessage, setBotMode, updateQuickReply, uploadChatMedia } from "../../controller/chat/chat.controller.js";
import { adminAuthValidation } from "../../middleware/auth/admin.auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const chatRouter = Router();
chatRouter.use(adminAuthValidation);
chatRouter.get("/", asyncHandler(listChats));
chatRouter.post("/media", asyncHandler(uploadChatMedia));
chatRouter.get("/quick-replies", asyncHandler(listQuickReplies));
chatRouter.post("/quick-replies", asyncHandler(createQuickReply));
chatRouter.patch("/quick-replies/:replyId", asyncHandler(updateQuickReply));
chatRouter.delete("/quick-replies/:replyId", asyncHandler(deleteQuickReply));
chatRouter.delete("/:customerId/clear", asyncHandler(clearChat));
chatRouter.get("/:customerId", asyncHandler(getChat));
chatRouter.patch("/:customerId/bot-mode", asyncHandler(setBotMode));
chatRouter.post("/:customerId/messages", asyncHandler(sendChatMessage));
export default chatRouter;
