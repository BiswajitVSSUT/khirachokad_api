import dotenv from "dotenv"
dotenv.config()
import express from 'express';
const app = express();
import cors from "cors";




import { errorHandler } from "./middleware/error/errorHandler.js";
import authRouter from "./routes/auth/auth.routes.js";
import shopRouter from "./routes/shop/shop.routes.js";
import productRouter from "./routes/products/product.routes.js";
import reviewRouter from "./routes/review/review.routes.js";





app.use(cors());
app.use(express.json());




app.get("/",(req,res)=>{
    res.status(200).json({
        message: "Welcome to khirachokada api"
    });
})

app.use("/api/v1/auth",authRouter);
app.use("/api/v1/shop",shopRouter);
app.use("/api/v1/product",productRouter);
app.use("/api/v1/review",reviewRouter)
app.use(errorHandler);


app.listen(process.env.PORT || 3000,()=>{
    console.log(`\n\n\nServer is running at http://localhost:${process.env.PORT || 3000}`);
})