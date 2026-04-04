
import { Router } from "express";

import {
  createTransactionController,
  voidTransactionController,
} from "../controllers/transaction.controller";

export const transactionRouter = Router();

transactionRouter.post("/transactions", createTransactionController);
transactionRouter.post("/transactions/:id/void", voidTransactionController);
