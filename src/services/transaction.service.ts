import { prisma } from "../config/prisma";
import { Prisma, TransactionSource } from "@prisma/client";

export type CreateTransactionInput = {
  title: string;
  weight: number;
  karat: number;
  fromAccountId?: string;
  quickAccountId?: string;
  toAccountId?: string;
  source: TransactionSource;
  numOfPieces?: number;
};

export async function createTransaction(input: CreateTransactionInput) {
  if (!input.fromAccountId && !input.toAccountId) {
    throw new Error("Either fromAccountId or toAccountId must be provided.");
  }

  if (
    input.fromAccountId &&
    input.toAccountId &&
    input.fromAccountId === input.toAccountId
  ) {
    throw new Error("fromAccountId and toAccountId cannot be equal.");
  }

  if (
    typeof input.weight !== "number" ||
    Number.isNaN(input.weight) ||
    input.weight <= 0
  ) {
    throw new Error("weight must be a number greater than 0.");
  }

  if (!Number.isInteger(input.karat) || input.karat <= 0) {
    throw new Error("karat must be a positive integer.");
  }

  return prisma.$transaction(async (tx) => {
    const [fromAccount, toAccount] = await Promise.all([
      input.fromAccountId
        ? tx.account.findUnique({
            where: { id: input.fromAccountId },
            select: { status: true, type: true },
          })
        : Promise.resolve(null),
      input.toAccountId
        ? tx.account.findUnique({
            where: { id: input.toAccountId },
            select: { status: true, type: true },
          })
        : Promise.resolve(null),
    ]);

    if (fromAccount?.status === "CLOSED") {
      throw new Error("Cannot use closed account as source");
    }

    if (toAccount?.status === "CLOSED") {
      throw new Error("Cannot use closed account as destination");
    }

    if (fromAccount?.type === "GROUP" || toAccount?.type === "GROUP") {
      throw new Error("Transactions cannot be made directly on group accounts");
    }

    let fromAccountId = input.fromAccountId;

    if (fromAccountId && fromAccount?.type === "QUICK_GROUP") {
      if (!input.quickAccountId) {
        throw new Error(
          "Must specify quick account when sending from quick group",
        );
      }

      const quickAccount = await tx.account.findUnique({
        where: { id: input.quickAccountId },
        select: { id: true, status: true, type: true, parentAccountId: true },
      });

      if (
        !quickAccount ||
        quickAccount.status !== "OPEN" ||
        quickAccount.type !== "QUICK_ACCOUNT" ||
        quickAccount.parentAccountId !== fromAccountId
      ) {
        throw new Error(
          "Must specify quick account when sending from quick group",
        );
      }

      fromAccountId = quickAccount.id;
    }

    let toAccountId = input.toAccountId;

    if (toAccountId && toAccount?.type === "QUICK_GROUP") {
      const quickAccount = await tx.account.create({
        data: {
          name: input.title,
          type: "QUICK_ACCOUNT",
          parentAccountId: toAccountId,
        },
        select: { id: true },
      });

      toAccountId = quickAccount.id;
    }

    const created = await tx.transaction.create({
      data: {
        title: input.title,
        weight: new Prisma.Decimal(input.weight),
        karat: input.karat,

        fromAccountId,
        toAccountId,

        source: input.source,
        numOfPieces: input.numOfPieces,
      },
    });

    return created;
  });
}

export async function voidTransaction(transactionId: string, reason: string) {
  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw new Error("reason must be a non-empty string.");
  }

  const existing = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: { id: true, isVoided: true },
  });

  if (!existing) {
    throw new Error("Transaction not found.");
  }

  if (existing.isVoided) {
    throw new Error("Transaction is already voided.");
  }

  const updated = await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      isVoided: true,
      voidReason: reason,
    },
  });

  return updated;
}
