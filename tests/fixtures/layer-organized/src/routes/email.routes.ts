import { Router } from "express";
import { EmailController } from "../controllers/email.controller";

const router = Router();
const controller = new EmailController();

router.post("/send", (req, res) => controller.send(req, res));
router.post("/schedule", (req, res) => controller.schedule(req, res));

export default router;
