-- CreateEnum
CREATE TYPE "CampaignCompletionReason" AS ENUM ('GOAL_REACHED', 'MANUAL');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "completionReason" "CampaignCompletionReason";
