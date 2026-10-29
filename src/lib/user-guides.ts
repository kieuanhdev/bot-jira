import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  BarChart3,
  Bell,
  BookOpen,
  Bug,
  ChartNoAxesCombined,
  CheckSquare,
  Eye,
  FileText,
  GitBranch,
  KeyRound,
  LayoutGrid,
  ListChecks,
  Rocket,
  Settings,
  ShieldCheck,
  Trophy,
  type LucideIcon,
} from "lucide-react";

export type UserGuide = {
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

/** End-user guides, in the reading order of the source README. Markdown lives in `content/huong-dan/<slug>.md`. */
export const USER_GUIDES: UserGuide[] = [
  { slug: "huong-dan-dang-nhap", title: "Đăng nhập", description: "Đăng nhập bằng Jira PAT, tạo token, xử lý sự cố đăng nhập.", icon: KeyRound },
  { slug: "huong-dan-loi-sentry", title: "Lỗi Sentry", description: "Theo dõi lỗi Sentry, phân tích AI, chuyển lỗi thành task Jira.", icon: Bug },
  { slug: "huong-dan-khong-gian-lam-viec-ca-nhan", title: "Việc của tôi", description: "Nhiệm vụ, hiệu suất, timeline và hoạt động cá nhân.", icon: CheckSquare },
  { slug: "huong-dan-xep-hang", title: "Xếp hạng", description: "Bảng Phong Thần: tu vi, cảnh giới, top 3, tổng sắp.", icon: Trophy },
  { slug: "huong-dan-bao-cao-du-an", title: "Báo cáo dự án", description: "Danh mục dự án, sức khỏe dự án, 5 tab phân tích, burndown.", icon: ChartNoAxesCombined },
  { slug: "huong-dan-quan-ly-phat-hanh", title: "Quản lý phát hành", description: "Fix Version, Release Gate, tiến độ và phát hành trên Jira.", icon: Rocket },
  { slug: "huong-dan-nhanh-delivery", title: "Nhánh & Delivery", description: "Nhánh Bitbucket, PR, duyệt gợi ý liên kết tự động.", icon: GitBranch },
  { slug: "huong-dan-cap-nhat-hang-loat", title: "Cập nhật/Tạo hàng loạt", description: "Wizard cập nhật 3 bước, tạo task hàng loạt từ Excel, CSV.", icon: ListChecks },
  { slug: "huong-dan-bang-cong-viec", title: "Bảng công việc", description: "Kanban: kéo-thả, bộ lọc, quick panel, danh sách, tạo task.", icon: LayoutGrid },
  { slug: "huong-dan-chi-tiet-task", title: "Chi tiết task", description: "5 tab, chuyển trạng thái, AI chấm điểm, nhánh Git.", icon: FileText },
  { slug: "huong-dan-cai-dat", title: "Cài đặt", description: "Token Jira/Bitbucket/Sentry, thông báo, Leader, vai trò.", icon: Settings },
  { slug: "huong-dan-task-can-xu-ly", title: "Task cần xử lý", description: "Chuẩn hóa dữ liệu task, SLA, hàng đợi xử lý.", icon: BarChart3 },
  { slug: "huong-dan-task-theo-doi", title: "Task theo dõi", description: "Theo dõi/bỏ theo dõi task, nhận thông báo thay đổi.", icon: Eye },
  { slug: "huong-dan-thong-bao", title: "Thông báo", description: "Trung tâm thông báo, lọc theo danh mục, các kênh nhận.", icon: Bell },
  { slug: "huong-dan-quan-tri", title: "Quản trị (Admin)", description: "Tổng quan hệ thống, đồng bộ dự án, impersonation, hoạt động.", icon: ShieldCheck },
  { slug: "huong-dan-tai-lieu-guide", title: "Tài liệu & Guide", description: "Thư viện tài liệu cấu hình kỹ thuật của hệ thống.", icon: BookOpen },
];

export const USER_GUIDE_BASE_PATH = "/docs/huong-dan";
/** Public folder holding the guides' screenshots (`images/`) and videos (`videos/`). */
export const USER_GUIDE_ASSET_PATH = "/huong-dan";

const CONTENT_DIR = path.join(process.cwd(), "content", "huong-dan");

export function findUserGuide(slug: string): UserGuide | undefined {
  return USER_GUIDES.find((guide) => guide.slug === slug);
}

export async function readUserGuide(slug: string): Promise<string | null> {
  if (!findUserGuide(slug)) return null;
  return readFile(path.join(CONTENT_DIR, `${slug}.md`), "utf8");
}
