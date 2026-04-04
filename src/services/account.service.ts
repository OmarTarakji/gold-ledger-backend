import { Prisma, type FinalState } from "@prisma/client";

import { prisma } from "../config/prisma";
import {
  calculateGroupNetDifferenceWithClient,
  calculateNetDifference,
  evaluateThresholdWithClient,
} from "./ledger.service";

export type CloseAccountOptions = {
  suppressWarning?: boolean;
  markAsOutlier?: boolean;
  outlierData?: {
    expectedNetDifference: number;
    explanation: string;
  };
};

export async function closeAccount(
  accountId: string,
  options?: CloseAccountOptions,
) {
  return prisma.$transaction(async (tx) => {
    const account = await tx.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        status: true,
        type: true,
        lossThresholdType: true,
        lossThresholdValue: true,
        excessThresholdType: true,
        excessThresholdValue: true,
      },
    });

    if (!account) {
      throw new Error("Account not found.");
    }

    if (account.status !== "OPEN") {
      throw new Error("Account must be OPEN to be closed.");
    }

    if (account.type === "GROUP") {
      const children = await tx.account.findMany({
        where: {
          parentAccountId: accountId,
        },
        select: {
          status: true,
        },
      });

      const hasOpenChild = children.some((c) => c.status === "OPEN");
      if (hasOpenChild) {
        throw new Error(
          "Cannot close group account while child accounts are still open",
        );
      }

      const groupNetDifference = await calculateGroupNetDifferenceWithClient(
        accountId,
        tx,
      );

      const updatedGroupAccount = await tx.account.update({
        where: { id: accountId },
        data: {
          status: "CLOSED",
          finalState: null,
          cachedNetDifference: new Prisma.Decimal(groupNetDifference),
          closedAt: new Date(),
        },
      });

      return updatedGroupAccount;
    }

    const [netDifferenceNumber, thresholdEvaluation] = await Promise.all([
      calculateNetDifference(accountId, tx),
      evaluateThresholdWithClient(accountId, tx),
    ]);

    const netDifference = new Prisma.Decimal(netDifferenceNumber);

    let finalState: FinalState;

    const isBalanced = netDifferenceNumber === 0;
    if (isBalanced) {
      finalState = "BALANCED";
    } else {
      if (thresholdEvaluation.valid) {
        finalState = "BALANCED";
      } else {
        const suppressWarning = options?.suppressWarning === true;
        const markAsOutlier = options?.markAsOutlier === true;

        if (!suppressWarning && !markAsOutlier) {
          throw new Error(
            "Threshold violated: set suppressWarning or markAsOutlier.",
          );
        }

        if (markAsOutlier) {
          const outlierData = options?.outlierData;
          if (!outlierData) {
            throw new Error(
              "outlierData is required when markAsOutlier is true.",
            );
          }

          if (
            typeof outlierData.expectedNetDifference !== "number" ||
            Number.isNaN(outlierData.expectedNetDifference)
          ) {
            throw new Error(
              "outlierData.expectedNetDifference must be a valid number.",
            );
          }

          if (
            typeof outlierData.explanation !== "string" ||
            outlierData.explanation.trim().length === 0
          ) {
            throw new Error(
              "outlierData.explanation must be a non-empty string.",
            );
          }

          await tx.outlierData.upsert({
            where: { accountId },
            create: {
              accountId,
              expectedNetDifference: new Prisma.Decimal(
                outlierData.expectedNetDifference,
              ),
              explanation: outlierData.explanation,
            },
            update: {
              expectedNetDifference: new Prisma.Decimal(
                outlierData.expectedNetDifference,
              ),
              explanation: outlierData.explanation,
            },
          });

          finalState = "OUTLIER";
        } else {
          finalState = "SUPPRESSED_WARNING";
        }
      }
    }

    const updatedAccount = await tx.account.update({
      where: { id: accountId },
      data: {
        status: "CLOSED",
        finalState,
        cachedNetDifference: netDifference,
        closedAt: new Date(),
      },
    });

    return updatedAccount;
  });
}

export async function reopenAccount(accountId: string, reason: string) {
  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw new Error("reason must be a non-empty string.");
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      status: true,
      closedAt: true,
    },
  });

  if (!account) {
    throw new Error("Account not found.");
  }

  if (account.status !== "CLOSED") {
    throw new Error("Account must be CLOSED to be reopened.");
  }

  if (!account.closedAt) {
    throw new Error("Account does not have a closedAt timestamp.");
  }

  const fortyEightHoursMs = 48 * 60 * 60 * 1000;
  const closedAtMs = account.closedAt.getTime();
  const nowMs = Date.now();

  if (nowMs - closedAtMs > fortyEightHoursMs) {
    throw new Error("Account can only be reopened within 48 hours of closing.");
  }

  const updated = await prisma.account.update({
    where: { id: accountId },
    data: {
      status: "OPEN",
    },
  });

  return updated;
}
