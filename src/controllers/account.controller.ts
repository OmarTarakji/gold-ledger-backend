import type { Request, Response } from "express";

import {
  closeAccount,
  reopenAccount,
  type CloseAccountOptions,
} from "../services/account.service";

const validationErrorMessages = new Set([
  "Account not found.",
  "Account must be OPEN to be closed.",
  "Threshold violated: set suppressWarning or markAsOutlier.",
  "outlierData is required when markAsOutlier is true.",
  "outlierData.expectedNetDifference must be a valid number.",
  "outlierData.explanation must be a non-empty string.",
  "reason must be a non-empty string.",
  "Account must be CLOSED to be reopened.",
  "Account does not have a closedAt timestamp.",
  "Account can only be reopened within 48 hours of closing.",
  "Cannot close group account while child accounts are still open",
  "Cannot close quick group account while child accounts are still open",
  "Threshold configuration missing for account and no parent to inherit from",
  "Threshold configuration must define both loss and excess thresholds",
]);

function isValidationError(err: unknown): err is Error {
  return err instanceof Error && validationErrorMessages.has(err.message);
}

export async function closeAccountController(req: Request, res: Response) {
  try {
    const accountId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const options = (req.body ?? {}) as CloseAccountOptions;

    const updated = await closeAccount(accountId, options);
    res.json(updated);
  } catch (err) {
    if (isValidationError(err)) {
      res.status(400).json({ error: err.message });
      return;
    }

    res.status(500).json({ error: "Internal server error" });
  }
}

export async function reopenAccountController(req: Request, res: Response) {
  try {
    const accountId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const reason = (req.body as { reason?: unknown } | undefined)?.reason;

    const updated = await reopenAccount(accountId, String(reason ?? ""));
    res.json(updated);
  } catch (err) {
    if (isValidationError(err)) {
      res.status(400).json({ error: err.message });
      return;
    }

    res.status(500).json({ error: "Internal server error" });
  }
}
