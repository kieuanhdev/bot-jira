import { Metadata } from "next";
import { ProjectReportClient } from "./project-report-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}): Promise<Metadata> {
  const { projectKey } = await params;
  return {
    title: `Báo cáo dự án ${projectKey} | Team Task Web`,
    description: `Báo cáo chi tiết tiến độ, khối lượng, điểm nghẽn và rủi ro dự án ${projectKey}.`,
  };
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}) {
  const { projectKey } = await params;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <ProjectReportClient projectKey={projectKey} />
    </div>
  );
}
