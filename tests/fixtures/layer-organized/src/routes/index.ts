import { Router } from "express";
import authRoutes from "./auth.routes";
import billingRoutes from "./billing.routes";
import emailRoutes from "./email.routes";
import userRoutes from "./user.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/billing", billingRoutes);
router.use("/email", emailRoutes);
router.use("/users", userRoutes);

export default router;
