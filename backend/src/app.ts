import cors from "cors"; import express from "express";
import * as c from "./controllers/controllers.js"; import { authenticate, authorize } from "./middlewares/auth.js"; import { errorHandler, notFound } from "./middlewares/error-handler.js";
export const app=express(); app.use(cors({origin:process.env.FRONTEND_URL??"http://localhost:5173"})); app.use(express.json());
app.get('/health',(_q,r)=>r.json({status:'ok',application:'ConectaSolidária API'}));
app.post('/auth/register/donor',c.registerDonor); app.post('/auth/register/ngo',c.registerNgo); app.post('/auth/login',c.login); app.get('/auth/me',authenticate,c.me);
app.get('/categories',c.categories); app.get('/campaigns',c.publicCampaigns);
app.get('/ngo/dashboard',authenticate,authorize('NGO'),c.ngoDashboard); app.get('/ngo/campaigns',authenticate,authorize('NGO'),c.ngoCampaigns); app.post('/ngo/campaigns',authenticate,authorize('NGO'),c.createCampaign); app.put('/ngo/campaigns/:id',authenticate,authorize('NGO'),c.updateCampaign); app.delete('/ngo/campaigns/:id',authenticate,authorize('NGO'),c.deleteCampaign); app.get('/ngo/donations',authenticate,authorize('NGO'),c.ngoDonations); app.patch('/ngo/donations/:id/status',authenticate,authorize('NGO'),c.donationStatus);
app.get('/donor/dashboard',authenticate,authorize('DONOR'),c.donorDashboard); app.get('/donor/donations',authenticate,authorize('DONOR'),c.donorDonations); app.post('/donor/donations',authenticate,authorize('DONOR'),c.createDonation);
app.use(notFound); app.use(errorHandler);
