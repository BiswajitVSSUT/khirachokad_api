import dotenv from "dotenv"
dotenv.config()
import express from 'express';
const app = express();
import cors from "cors";





import authRouter from "./routes/auth.routes.js";





app.use(cors());
app.use(express.json());




app.get("/",(req,res)=>{
    res.status(200).json({
        message: "Welcome to khirachokada api"
    });
})

app.use("/api/v1/auth",authRouter)


app.listen(process.env.PORT || 3000,()=>{
    console.log(`\n\n\nServer is running at http://localhost:${process.env.PORT || 3000}`);
})