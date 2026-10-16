import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "../lib/jwt.js";
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer "))
    return res.status(401).json({ message: "Token não informado." });
  try {
    const payload = verifyToken(header.slice(7));
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch {
    return res.status(401).json({ message: "Token inválido ou expirado." });
  }
}
export function authorize(...roles: Array<"DONOR" | "NGO">) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role))
      return res.status(403).json({ message: "Acesso não autorizado." });
    return next();
  };
}
