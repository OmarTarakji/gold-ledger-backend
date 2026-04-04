
import { Router } from "express";

import { closeAccountController, reopenAccountController } from "../controllers/account.controller";

export const accountRouter = Router();

accountRouter.post("/:id/close", closeAccountController);
accountRouter.post("/:id/reopen", reopenAccountController);
