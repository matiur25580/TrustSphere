import type { ErrorRequestHandler, RequestHandler } from "express";

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
  const appError = error instanceof AppError ? error : null;
  const statusCode = appError?.statusCode ?? 500;

  if (!appError) {
    console.error("Unhandled API error:", error);
  }

  res.status(statusCode).json({
    error: {
      code: appError?.code ?? "INTERNAL_SERVER_ERROR",
      message: appError?.message ?? "An unexpected error occurred.",
    },
  });
};
