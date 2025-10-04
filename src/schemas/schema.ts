import { z } from "zod";

export const shopSchema = z.object({
  name: z.string().min(4),
  description: z.string().min(10),
  logo: z.string().url(),
  contactNumber: z.string().min(10).max(15), 
  contactNumber2: z.string().min(10).max(15).optional(),
  contactEmail: z.email(),
  postalCode: z.string().optional(),
  blockName: z.string().optional(),
  district: z.string().optional(),
});


export const productSchema = z.object({
  name:z.string().min(5),
  description:z.string(),
  price:z.string(),
  image :z.string().url(),
  shopId: z.string(),
  expiryDate: z.coerce.date(),
})

export const reviewSchema = z.object({
  revieweeName: z.string(),
  revieweeEmail: z.string().email(),
  review: z.string().min(5),
  rating: z.number(),
  shopId: z.string().uuid()
})