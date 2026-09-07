import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
export const notFound = (req: Request, res: Response) => res.status(404).json({ message: `Rota não encontrada: ${req.method} ${req.originalUrl}` });
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) return res.status(400).json({ message: "Dados inválidos.", errors: error.issues });
  console.error(error);
  return res.status(500).json({ message: "Erro interno do servidor." });
}
