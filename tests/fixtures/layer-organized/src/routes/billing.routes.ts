import { Router } from "express";
import { BillingController } from "../controllers/billing.controller";

const router = Router();
const controller = new BillingController();

router.post("/subscriptions", (req, res) => controller.createSubscription(req, res));
router.get("/invoices", (req, res) => controller.getInvoices(req, res));

export default router;
