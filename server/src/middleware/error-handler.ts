import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500,
    public readonly code = "INTERNAL_SERVER_ERROR",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "The requested resource was not found.",
    },
  });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      },
    });
    return;
  }

  const appError = error instanceof AppError ? error : null;
  const duplicateKey = typeof error === "object" && error !== null && "code" in error && error.code === 11000;
  const statusCode = appError?.statusCode ?? (duplicateKey ? 409 : 500);

  if (!appError && !duplicateKey) {
    console.error("Unhandled API error:", error);
  }

  res.status(statusCode).json({
    error: {
      code: appError?.code ?? (duplicateKey ? "RESOURCE_CONFLICT" : "INTERNAL_SERVER_ERROR"),
      message: appError?.message ?? (duplicateKey ? "A record with this value already exists." : "An unexpected error occurred."),
    },
  });
};
