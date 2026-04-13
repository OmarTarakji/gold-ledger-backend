import { Prisma, type PrismaClient, type ThresholdType } from "@prisma/client";

import { prisma } from "../config/prisma";

type PrismaLike = Pick<PrismaClient, "account" | "transaction">;

export async function resolveThresholds(
  accountId: string,
  visited: Set<string> = new Set(),
): Promise<{
  lossThresholdType: ThresholdType;
  lossThresholdValue: Prisma.Decimal;
  excessThresholdType: ThresholdType;
  excessThresholdValue: Prisma.Decimal;
}> {
  if (visited.has(accountId)) {
    throw new Error(
      "Threshold configuration missing for account and no parent to inherit from",
    );
  }

  visited.add(accountId);

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      parentAccountId: true,
      lossThresholdType: true,
      lossThresholdValue: true,
      excessThresholdType: true,
      excessThresholdValue: true,
    },
  });

  if (!account) {
    throw new Error("Account not found.");
  }

  const hasAllThresholds =
    account.lossThresholdType !== null &&
    account.lossThresholdValue !== null &&
    account.excessThresholdType !== null &&
    account.excessThresholdValue !== null;

  const hasLossThreshold =
    account.lossThresholdType !== null && account.lossThresholdValue !== null;
  const hasExcessThreshold =
    account.excessThresholdType !== null &&
    account.excessThresholdValue !== null;

  if (
    (hasLossThreshold && !hasExcessThreshold) ||
    (!hasLossThreshold && hasExcessThreshold)
  ) {
    throw new Error(
      "Threshold configuration must define both loss and excess thresholds",
    );
  }

  if (hasAllThresholds) {
    return {
      lossThresholdType: account.lossThresholdType!,
      lossThresholdValue: account.lossThresholdValue!,
      excessThresholdType: account.excessThresholdType!,
      excessThresholdValue: account.excessThresholdValue!,
    };
  }

  if (account.parentAccountId) {
    return resolveThresholds(account.parentAccountId, visited);
  }

  throw new Error(
    "Threshold configuration missing for account and no parent to inherit from",
  );
}

export async function resolveThresholdsWithClient(
  accountId: string,
  client: PrismaLike,
  visited: Set<string> = new Set(),
): Promise<{
  lossThresholdType: ThresholdType;
  lossThresholdValue: Prisma.Decimal;
  excessThresholdType: ThresholdType;
  excessThresholdValue: Prisma.Decimal;
}> {
  if (visited.has(accountId)) {
    throw new Error(
      "Threshold configuration missing for account and no parent to inherit from",
    );
  }

  visited.add(accountId);

  const account = await client.account.findUnique({
    where: { id: accountId },
    select: {
      parentAccountId: true,
      lossThresholdType: true,
      lossThresholdValue: true,
      excessThresholdType: true,
      excessThresholdValue: true,
    },
  });

  if (!account) {
    throw new Error("Account not found.");
  }

  const hasAllThresholds =
    account.lossThresholdType !== null &&
    account.lossThresholdValue !== null &&
    account.excessThresholdType !== null &&
    account.excessThresholdValue !== null;

  const hasLossThreshold =
    account.lossThresholdType !== null && account.lossThresholdValue !== null;
  const hasExcessThreshold =
    account.excessThresholdType !== null &&
    account.excessThresholdValue !== null;

  if (
    (hasLossThreshold && !hasExcessThreshold) ||
    (!hasLossThreshold && hasExcessThreshold)
  ) {
    throw new Error(
      "Threshold configuration must define both loss and excess thresholds",
    );
  }

  if (hasAllThresholds) {
    return {
      lossThresholdType: account.lossThresholdType!,
      lossThresholdValue: account.lossThresholdValue!,
      excessThresholdType: account.excessThresholdType!,
      excessThresholdValue: account.excessThresholdValue!,
    };
  }

  if (account.parentAccountId) {
    return resolveThresholdsWithClient(
      account.parentAccountId,
      client,
      visited,
    );
  }

  throw new Error(
    "Threshold configuration missing for account and no parent to inherit from",
  );
}

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

export async function validatePieceBalance(accountId: string) {
  const transactions = await getAccountTransactions(accountId);

  const isActive = transactions.some((t) => t.numOfPieces !== null);
  if (!isActive) {
    return { valid: true } as const;
  }

  let incomingPieces = 0;
  let outgoingPieces = 0;

  for (const t of transactions) {
    const pieces = t.numOfPieces ?? 0;

    if (t.toAccountId === accountId) {
      incomingPieces += pieces;
    }

    if (t.fromAccountId === accountId) {
      outgoingPieces += pieces;
    }
  }

  return {
    valid: incomingPieces === outgoingPieces,
    incomingPieces,
    outgoingPieces,
  };
}

export async function validatePieceBalanceWithClient(
  accountId: string,
  client: PrismaLike,
) {
  const transactions = await getAccountTransactions(accountId, client);

  const isActive = transactions.some((t) => t.numOfPieces !== null);
  if (!isActive) {
    return { valid: true } as const;
  }

  let incomingPieces = 0;
  let outgoingPieces = 0;

  for (const t of transactions) {
    const pieces = t.numOfPieces ?? 0;

    if (t.toAccountId === accountId) {
      incomingPieces += pieces;
    }

    if (t.fromAccountId === accountId) {
      outgoingPieces += pieces;
    }
  }

  return {
    valid: incomingPieces === outgoingPieces,
    incomingPieces,
    outgoingPieces,
  };
}

export async function evaluateQuickAccountStatus(accountId: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { type: true },
  });

  if (!account) {
    throw new Error("Account not found.");
  }

  if (account.type !== "QUICK_ACCOUNT") {
    throw new Error("Account must be a QUICK_ACCOUNT.");
  }

  const [thresholdEvaluation, pieceBalance] = await Promise.all([
    evaluateThreshold(accountId),
    validatePieceBalance(accountId),
  ]);

  const valid = thresholdEvaluation.valid && pieceBalance.valid;

  return {
    status: valid ? ("CLOSED" as const) : ("OPEN" as const),
  };
}

export async function evaluateQuickAccountStatusWithClient(
  accountId: string,
  client: PrismaLike,
) {
  const account = await client.account.findUnique({
    where: { id: accountId },
    select: { type: true },
  });

  if (!account) {
    throw new Error("Account not found.");
  }

  if (account.type !== "QUICK_ACCOUNT") {
    throw new Error("Account must be a QUICK_ACCOUNT.");
  }

  const [thresholdEvaluation, pieceBalance] = await Promise.all([
    evaluateThresholdWithClient(accountId, client),
    validatePieceBalanceWithClient(accountId, client),
  ]);

  const valid = thresholdEvaluation.valid && pieceBalance.valid;

  return {
    status: valid ? ("CLOSED" as const) : ("OPEN" as const),
  };
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
  const [netDifference, totalIncoming, thresholds] = await Promise.all([
    calculateNetDifference(accountId),
    calculateTotalIncoming(accountId),
    resolveThresholds(accountId),
  ]);

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
          thresholdType: thresholds.lossThresholdType,
          thresholdValue: thresholds.lossThresholdValue,
          type: "LOSS" as const,
        }
      : {
          thresholdType: thresholds.excessThresholdType,
          thresholdValue: thresholds.excessThresholdValue,
          type: "EXCESS" as const,
        };

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

export async function calculateQuickGroupNetDifference(groupId: string) {
  return calculateQuickGroupNetDifferenceWithClient(groupId, prisma);
}

export async function calculateQuickGroupNetDifferenceWithClient(
  groupId: string,
  client: PrismaLike,
) {
  const children = await client.account.findMany({
    where: {
      parentAccountId: groupId,
    },
    select: {
      id: true,
      status: true,
      cachedNetDifference: true,
    },
  });

  let total = new Prisma.Decimal(0);

  for (const child of children) {
    if (child.status === "CLOSED" && child.cachedNetDifference !== null) {
      total = total.add(child.cachedNetDifference);
      continue;
    }

    const net = await calculateNetDifference(child.id, client);
    total = total.add(new Prisma.Decimal(net));
  }

  return total.toNumber();
}

export async function evaluateThresholdWithClient(
  accountId: string,
  client: PrismaLike,
) {
  const [netDifference, totalIncoming, thresholds] = await Promise.all([
    calculateNetDifference(accountId, client),
    calculateTotalIncomingWithClient(accountId, client),
    resolveThresholdsWithClient(accountId, client),
  ]);

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
    netDifference > 0
      ? {
          thresholdType: thresholds.lossThresholdType,
          thresholdValue: thresholds.lossThresholdValue,
          type: "LOSS" as const,
        }
      : {
          thresholdType: thresholds.excessThresholdType,
          thresholdValue: thresholds.excessThresholdValue,
          type: "EXCESS" as const,
        };

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
