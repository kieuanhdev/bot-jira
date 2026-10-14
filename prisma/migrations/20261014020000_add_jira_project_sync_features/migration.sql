-- AlterTable
ALTER TABLE "JiraProject" ADD COLUMN "syncFeatures" JSONB NOT NULL DEFAULT '{}';
