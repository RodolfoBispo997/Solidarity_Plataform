import jwt from "jsonwebtoken";
import { z } from "zod";
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error("JWT_SECRET não configurado.");
export type TokenPayload = { sub: string; role: "DONOR" | "NGO" };
export const signToken = (payload: TokenPayload) =>
  jwt.sign(payload, secret, { expiresIn: "8h" });
const tokenPayloadSchema = z.object({
  sub: z.string().min(1),
  role: z.enum(["DONOR", "NGO"]),
});
export const verifyToken = (token: string): TokenPayload => {
  const payload = jwt.verify(token, secret);
  const result = tokenPayloadSchema.safeParse(payload);
  if (!result.success)
    throw new jwt.JsonWebTokenError("Token payload inválido.");
  return result.data;
};
