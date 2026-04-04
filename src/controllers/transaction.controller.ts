import type { Request, Response } from "express";

import {
  createTransaction,
  voidTransaction,
  type CreateTransactionInput,
} from "../services/transaction.service";

const validationErrorMessages = new Set([
  "Either fromAccountId or toAccountId must be provided.",
  "fromAccountId and toAccountId cannot be equal.",
  "weight must be a number greater than 0.",
  "karat must be a positive integer.",
  "Cannot use closed account as source",
  "Cannot use closed account as destination",
  "reason must be a non-empty string.",
  "Transaction not found.",
  "Transaction is already voided.",
  "Transactions cannot be made directly on group accounts",
]);

function isValidationError(err: unknown): err is Error {
  return err instanceof Error && validationErrorMessages.has(err.message);
}

export async function createTransactionController(req: Request, res: Response) {
  try {
    const input = req.body as CreateTransactionInput;
    const created = await createTransaction(input);
    res.json(created);
  } catch (err) {
    if (isValidationError(err)) {
      res.status(400).json({ error: err.message });
      return;
    }

    res.status(500).json({ error: "Internal server error" });
  }
}

export async function voidTransactionController(req: Request, res: Response) {
  try {
    const transactionId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const reason = (req.body as { reason?: unknown } | undefined)?.reason;

    const updated = await voidTransaction(transactionId, String(reason ?? ""));
    res.json(updated);
  } catch (err) {
    if (isValidationError(err)) {
      res.status(400).json({ error: err.message });
      return;
    }

    res.status(500).json({ error: "Internal server error" });
  }
}
