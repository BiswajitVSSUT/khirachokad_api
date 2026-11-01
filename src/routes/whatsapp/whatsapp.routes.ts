import { Router } from "express";

import {
  receiveWebhook,
  verifyWebhook,
} from "../../controller/whatsapp/whatsapp.controller.js";

const whatsappRouter = Router();

whatsappRouter.get("/webhook", verifyWebhook);
whatsappRouter.post("/webhook", receiveWebhook);

export default whatsappRouter;
