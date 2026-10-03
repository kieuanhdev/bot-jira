import { Metadata } from "next";
import { ProjectPortfolioClient } from "./project-portfolio-client";

export const metadata: Metadata = {
  title: "Báo cáo dự án | Team Task Web",
  description: "Báo cáo tiến độ, sức khỏe, điểm nghẽn và rủi ro danh mục dự án Jira.",
};

export default function ProjectPortfolioPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <ProjectPortfolioClient />
    </div>
  );
}
