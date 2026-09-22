-- AlterTable
ALTER TABLE "AiScore" ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "missingInformation" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "promptVersion" TEXT,
ADD COLUMN     "similarTasks" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "AiEstimateDecision" (
    "id" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "scoreId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "finalPoints" INTEGER,
    "decidedById" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiEstimateDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiEstimateDecision_jiraKey_decidedAt_idx" ON "AiEstimateDecision"("jiraKey", "decidedAt");

-- CreateIndex
CREATE INDEX "AiEstimateDecision_decision_idx" ON "AiEstimateDecision"("decision");

-- CreateIndex
CREATE INDEX "AiEstimateDecision_decidedById_idx" ON "AiEstimateDecision"("decidedById");

-- CreateIndex
CREATE INDEX "AiScore_scoredAt_idx" ON "AiScore"("scoredAt");

-- AddForeignKey
ALTER TABLE "AiEstimateDecision" ADD CONSTRAINT "AiEstimateDecision_scoreId_fkey" FOREIGN KEY ("scoreId") REFERENCES "AiScore"("id") ON DELETE CASCADE ON UPDATE CASCADE;
