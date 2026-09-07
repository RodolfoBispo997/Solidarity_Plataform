import { prisma } from "../lib/prisma.js";
export async function recalculateCampaignProgress(campaignId: string) {
  const agg = await prisma.donation.aggregate({ where: { campaignId, status: "RECEIVED" }, _sum: { quantity: true } });
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return;
  const receivedQuantity = agg._sum.quantity ?? 0;
  const status = campaign.status === "CANCELED" || campaign.status === "DRAFT" ? campaign.status : receivedQuantity >= campaign.goalQuantity ? "COMPLETED" : "ACTIVE";
  await prisma.campaign.update({ where: { id: campaignId }, data: { receivedQuantity, status } });
}
