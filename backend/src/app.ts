import cors from "cors";
import express from "express";
import * as controllers from "./controllers/controllers.js";
import { authenticate, authorize } from "./middlewares/auth.js";
import { errorHandler, notFound } from "./middlewares/error-handler.js";

const allowedOrigins = (process.env.FRONTEND_URL ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const app = express();
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "100kb" }));

app.get("/health", (_req, res) =>
  res.json({ status: "ok", application: "ConectaSolidária API" }),
);
app.post("/auth/register/donor", controllers.registerDonor);
app.post("/auth/register/ngo", controllers.registerNgo);
app.post("/auth/login", controllers.login);
app.get("/auth/me", authenticate, controllers.me);

app.get("/categories", controllers.categories);
app.get("/campaigns", controllers.publicCampaigns);

app.get(
  "/ngo/dashboard",
  authenticate,
  authorize("NGO"),
  controllers.ngoDashboard,
);
app.get(
  "/ngo/campaigns",
  authenticate,
  authorize("NGO"),
  controllers.ngoCampaigns,
);
app.post(
  "/ngo/campaigns",
  authenticate,
  authorize("NGO"),
  controllers.createCampaign,
);
app.put(
  "/ngo/campaigns/:id",
  authenticate,
  authorize("NGO"),
  controllers.updateCampaign,
);
app.post(
  "/ngo/campaigns/:id/complete",
  authenticate,
  authorize("NGO"),
  controllers.completeCampaign,
);
app.delete(
  "/ngo/campaigns/:id",
  authenticate,
  authorize("NGO"),
  controllers.deleteCampaign,
);
app.get(
  "/ngo/donations",
  authenticate,
  authorize("NGO"),
  controllers.ngoDonations,
);
app.patch(
  "/ngo/donations/:id/status",
  authenticate,
  authorize("NGO"),
  controllers.donationStatus,
);

app.get(
  "/donor/dashboard",
  authenticate,
  authorize("DONOR"),
  controllers.donorDashboard,
);
app.get(
  "/donor/donations",
  authenticate,
  authorize("DONOR"),
  controllers.donorDonations,
);
app.post(
  "/donor/donations",
  authenticate,
  authorize("DONOR"),
  controllers.createDonation,
);

app.use(notFound);
app.use(errorHandler);
