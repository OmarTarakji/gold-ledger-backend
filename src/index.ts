
import cors from "cors";
import dotenv from "dotenv";
import express from "express";

import { accountRouter } from "./routes/account.routes";
import { transactionRouter } from "./routes/transaction.routes";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", transactionRouter);
app.use("/api/accounts", accountRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
