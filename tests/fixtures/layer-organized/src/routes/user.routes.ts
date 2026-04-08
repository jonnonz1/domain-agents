import { Router } from "express";
import { UserController } from "../controllers/user.controller";

const router = Router();
const controller = new UserController();

router.get("/:id", (req, res) => controller.getUser(req, res));
router.patch("/:id", (req, res) => controller.updateProfile(req, res));

export default router;
