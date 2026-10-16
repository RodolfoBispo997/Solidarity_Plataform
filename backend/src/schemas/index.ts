import { z } from "zod";

const email = z
  .string()
  .trim()
  .email()
  .transform((value) => value.toLowerCase());
const password = z.string().min(6).max(100);
const campaignEndDate = z.preprocess(
  (value) =>
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T23:59:59.999Z`
      : value,
  z.coerce.date(),
);

export const loginSchema = z.object({
  email,
  password,
  expectedRole: z.enum(["DONOR", "NGO"]).optional(),
});

export const donorRegisterSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email,
  password,
});

export const ngoRegisterSchema = z.object({
  responsibleName: z.string().trim().min(2).max(100),
  email,
  password,
  organizationName: z.string().trim().min(2).max(150),
  cnpj: z.string().trim().optional().nullable(),
  description: z.string().trim().min(10).max(2000),
  phone: z.string().trim().max(30).optional().nullable(),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().length(2),
});

const campaignBaseSchema = z.object({
  categoryId: z.string().min(1),
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().min(10).max(3000),
  goalQuantity: z.coerce.number().int().positive(),
  unit: z.string().trim().min(1).max(30),
  startDate: z.coerce.date().optional(),
  endDate: campaignEndDate.optional().nullable(),
  status: z.enum(["DRAFT", "ACTIVE"]).default("ACTIVE"),
});

export const campaignCreateSchema = campaignBaseSchema.superRefine(
  (campaign, context) => {
    if (
      campaign.endDate &&
      campaign.startDate &&
      campaign.endDate < campaign.startDate
    ) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "A data final não pode ser anterior à inicial.",
      });
    }
  },
);

export const campaignUpdateSchema = campaignBaseSchema
  .omit({ status: true })
  .partial()
  .extend({
    status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "CANCELED"]).optional(),
  });

export const donationCreateSchema = z.object({
  campaignId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  note: z.string().trim().max(300).optional().nullable(),
});

export const donationStatusSchema = z.object({
  status: z.enum(["RECEIVED", "CANCELED"]),
});

export const publicCampaignQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});
