import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "../config/prisma";

type PrismaLike = Pick<PrismaClient, "account" | "transaction">;

export async function getAccountTransactions(
  accountId: string,
  client: PrismaLike = prisma,
) {
  const transactions = await client.transaction.findMany({
    where: {
      isVoided: false,
      OR: [{ toAccountId: accountId }, { fromAccountId: accountId }],
    },
  });

  return transactions;
}

export async function calculateTotalIncomingWithClient(
  accountId: string,
  client: PrismaLike,
) {
  const result = await client.transaction.aggregate({
    where: {
      isVoided: false,
      toAccountId: accountId,
    },
    _sum: {
      weight: true,
    },
  });

  return (result._sum.weight ?? new Prisma.Decimal(0)).toNumber();
}

export async function calculateNetDifference(
  accountId: string,
  client: PrismaLike = prisma,
) {
  const account = await client.account.findUnique({
    where: { id: accountId },
    select: {
      status: true,
      cachedNetDifference: true,
    },
  });

  if (!account) {
    throw new Error("Account not found.");
  }

  if (account.status === "CLOSED" && account.cachedNetDifference !== null) {
    return account.cachedNetDifference.toNumber();
  }

  const transactions = await getAccountTransactions(accountId, client);

  let incoming = new Prisma.Decimal(0);
  let outgoing = new Prisma.Decimal(0);

  for (const tx of transactions) {
    const weight =
      tx.weight instanceof Prisma.Decimal
        ? tx.weight
        : new Prisma.Decimal(tx.weight as unknown as number);

    if (tx.toAccountId === accountId) {
      incoming = incoming.add(weight);
    }

    if (tx.fromAccountId === accountId) {
      outgoing = outgoing.add(weight);
    }
  }

  return incoming.sub(outgoing).toNumber();
}

export async function calculateTotalIncoming(accountId: string) {
  const result = await prisma.transaction.aggregate({
    where: {
      isVoided: false,
      toAccountId: accountId,
    },
    _sum: {
      weight: true,
    },
  });

  return (result._sum.weight ?? new Prisma.Decimal(0)).toNumber();
}

export async function evaluateThreshold(accountId: string) {
  const [netDifference, totalIncoming, account] = await Promise.all([
    calculateNetDifference(accountId),
    calculateTotalIncoming(accountId),
    prisma.account.findUnique({
      where: { id: accountId },
      select: {
        lossThresholdType: true,
        lossThresholdValue: true,
        excessThresholdType: true,
        excessThresholdValue: true,
      },
    }),
  ]);

  if (!account) {
    throw new Error("Account not found.");
  }

  if (netDifference === 0) {
    return {
      valid: true,
      reason: "balanced",
      netDifference,
      thresholdUsed: null as number | null,
      type: "BALANCED" as const,
    };
  }

  const thresholdConfig =
    netDifference < 0
      ? {
          thresholdType: account.lossThresholdType,
          thresholdValue: account.lossThresholdValue,
          type: "LOSS" as const,
        }
      : {
          thresholdType: account.excessThresholdType,
          thresholdValue: account.excessThresholdValue,
          type: "EXCESS" as const,
        };

  if (
    !thresholdConfig.thresholdType ||
    thresholdConfig.thresholdValue === null
  ) {
    return {
      valid: false,
      netDifference,
      thresholdUsed: null as number | null,
      type: thresholdConfig.type,
    };
  }

  const rawValue = thresholdConfig.thresholdValue.toNumber();

  const thresholdUsed =
    thresholdConfig.thresholdType === "FIXED"
      ? rawValue
      : (rawValue / 100) * totalIncoming;

  const valid = Math.abs(netDifference) <= thresholdUsed;

  return {
    valid,
    netDifference,
    thresholdUsed,
    type: thresholdConfig.type,
  };
}

export async function calculateGroupNetDifference(groupAccountId: string) {
  const children = await prisma.account.findMany({
    where: {
      parentAccountId: groupAccountId,
      status: "CLOSED",
    },
    select: {
      cachedNetDifference: true,
    },
  });

  let total = new Prisma.Decimal(0);
  for (const child of children) {
    if (child.cachedNetDifference !== null) {
      total = total.add(child.cachedNetDifference);
    }
  }

  return total.toNumber();
}

export async function calculateGroupNetDifferenceWithClient(
  groupAccountId: string,
  client: PrismaLike,
) {
  const children = await client.account.findMany({
    where: {
      parentAccountId: groupAccountId,
      status: "CLOSED",
    },
    select: {
      cachedNetDifference: true,
    },
  });

  let total = new Prisma.Decimal(0);
  for (const child of children) {
    if (child.cachedNetDifference !== null) {
      total = total.add(child.cachedNetDifference);
    }
  }

  return total.toNumber();
}

export async function evaluateThresholdWithClient(
  accountId: string,
  client: PrismaLike,
) {
  const [netDifference, totalIncoming, account] = await Promise.all([
    calculateNetDifference(accountId, client),
    calculateTotalIncomingWithClient(accountId, client),
    client.account.findUnique({
      where: { id: accountId },
      select: {
        lossThresholdType: true,
        lossThresholdValue: true,
        excessThresholdType: true,
        excessThresholdValue: true,
      },
    }),
  ]);

  if (!account) {
    throw new Error("Account not found.");
  }

  if (netDifference === 0) {
    return {
      valid: true,
      reason: "balanced",
      netDifference,
      thresholdUsed: null as number | null,
      type: "BALANCED" as const,
    };
  }

  const thresholdConfig =
    netDifference < 0
      ? {
          thresholdType: account.excessThresholdType,
          thresholdValue: account.excessThresholdValue,
          type: "EXCESS" as const,
        }
      : {
          thresholdType: account.lossThresholdType,
          thresholdValue: account.lossThresholdValue,
          type: "LOSS" as const,
        };

  if (
    !thresholdConfig.thresholdType ||
    thresholdConfig.thresholdValue === null
  ) {
    return {
      valid: false,
      netDifference,
      thresholdUsed: null as number | null,
      type: thresholdConfig.type,
    };
  }

  const rawValue = thresholdConfig.thresholdValue.toNumber();
  const thresholdUsed =
    thresholdConfig.thresholdType === "FIXED"
      ? rawValue
      : (rawValue / 100) * totalIncoming;

  const valid = Math.abs(netDifference) <= thresholdUsed;

  return {
    valid,
    netDifference,
    thresholdUsed,
    type: thresholdConfig.type,
  };
}
