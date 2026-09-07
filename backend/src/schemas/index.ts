import { z } from "zod";
export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(6), expectedRole: z.enum(["DONOR","NGO"]).optional() });
export const donorRegisterSchema = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(6) });
export const ngoRegisterSchema = z.object({
  responsibleName: z.string().min(2), email: z.string().email(), password: z.string().min(6), organizationName: z.string().min(2),
  cnpj: z.string().optional().nullable(), description: z.string().min(10), phone: z.string().optional().nullable(), city: z.string().min(2), state: z.string().min(2).max(2)
});
export const campaignCreateSchema = z.object({
  categoryId: z.string().min(1), title: z.string().min(3), description: z.string().min(10), goalQuantity: z.coerce.number().int().positive(),
  unit: z.string().min(1).max(30), endDate: z.coerce.date().optional().nullable(), status: z.enum(["DRAFT","ACTIVE"]).default("ACTIVE")
});
export const campaignUpdateSchema = campaignCreateSchema.partial().extend({ status: z.enum(["DRAFT","ACTIVE","COMPLETED","CANCELED"]).optional() });
export const donationCreateSchema = z.object({ campaignId: z.string().min(1), quantity: z.coerce.number().int().positive(), note: z.string().max(300).optional().nullable() });
export const donationStatusSchema = z.object({ status: z.enum(["RECEIVED","CANCELED"]) });
