import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
export const notFound = (_req: Request, res: Response) =>
  res.status(404).json({ message: "Rota não encontrada." });
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError)
    return res.status(400).json({
      message: "Dados inválidos.",
      errors: error.issues.map(({ path, message }) => ({ path, message })),
    });
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002")
      return res.status(409).json({ message: "Um registro com esses dados já existe." });
    if (error.code === "P2025")
      return res.status(404).json({ message: "Registro não encontrado." });
    if (error.code === "P2003")
      return res.status(400).json({ message: "Uma referência informada não é válida." });
    if (error.code === "P2034")
      return res.status(409).json({
        message: "A operação conflitou com outra alteração. Tente novamente.",
      });
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "type" in error &&
    ((error.status === 400 && error.type === "entity.parse.failed") ||
      (error.status === 413 && error.type === "entity.too.large"))
  ) {
    if (error.status === 413)
      return res.status(413).json({ message: "O corpo da requisição excede o limite permitido." });
    return res.status(400).json({ message: "O corpo da requisição não contém JSON válido." });
  }
  if (
    error instanceof Error &&
    error.name === "ApiError" &&
    "status" in error &&
    "message" in error
  ) {
    const status = error.status;
    if (typeof status === "number" && status >= 400 && status < 500)
      return res.status(status).json({ message: error.message });
  }
  console.error(error);
  return res.status(500).json({ message: "Erro interno do servidor." });
}
