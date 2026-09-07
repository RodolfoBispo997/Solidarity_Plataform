import jwt from "jsonwebtoken";
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error("JWT_SECRET não configurado.");
export type TokenPayload = { sub: string; role: "DONOR" | "NGO" };
export const signToken = (payload: TokenPayload) => jwt.sign(payload, secret, { expiresIn: "8h" });
export const verifyToken = (token: string) => jwt.verify(token, secret) as TokenPayload;
