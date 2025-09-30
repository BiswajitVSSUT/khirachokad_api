import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { signIn, signUp, updatePassword } from "../../controller/auth/auth.controller.js"
const authRouter = Router();

authRouter.post("/signup", asyncHandler(signUp));
authRouter.post("/signin", asyncHandler(signIn));
authRouter.post("/update-password", asyncHandler(updatePassword));



export default authRouter;
