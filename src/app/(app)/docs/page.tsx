import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ExternalLink, Bug, KeyRound, GitBranch, Rocket, ShieldCheck, ArrowRight, Webhook } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { USER_GUIDES, USER_GUIDE_BASE_PATH } from "@/lib/user-guides";

export const metadata: Metadata = {
  title: "Tài liệu & Hướng dẫn — Team Task Web",
  description: "Tổng hợp các tài liệu kỹ thuật, hướng dẫn cài đặt và tích hợp cho hệ thống Team Task Web.",
};

export default function DocsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={BookOpen}
        title="Tài liệu & Hướng dẫn"
        description="Tổng hợp các tài liệu kỹ thuật, hướng dẫn cấu hình tích hợp và quy trình vận hành cho đội ngũ phát triển."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild className="cursor-pointer gap-1.5">
              <Link href="/webhook-config-guide.html" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Hướng dẫn Webhook
              </Link>
            </Button>
            <Button size="sm" asChild className="cursor-pointer gap-1.5">
              <Link href="/sentry-config-guide.html" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Hướng dẫn Sentry
              </Link>
            </Button>
          </div>
        }
      />

      <section aria-labelledby="user-guides-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="user-guides-heading" className="text-base font-semibold text-foreground">
            Hướng dẫn sử dụng
          </h2>
          <p className="text-xs text-muted-foreground">
            {USER_GUIDES.length} tài liệu theo từng màn hình, kèm ảnh chụp giao diện thực tế.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {USER_GUIDES.map((guide, index) => (
            <Link
              key={guide.slug}
              href={`${USER_GUIDE_BASE_PATH}/${guide.slug}`}
              className="group flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors duration-150 hover:border-primary/60 hover:bg-accent"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground group-hover:bg-primary-soft group-hover:text-primary-soft-foreground">
                <guide.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-semibold text-foreground">
                  <span className="text-muted-foreground tabular-nums">{index + 1}.</span> {guide.title}
                </span>
                <span className="text-xs leading-snug text-muted-foreground">{guide.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <h2 className="text-base font-semibold text-foreground">Tài liệu kỹ thuật</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Sentry Configuration Guide - Featured Card */}
        <Card className="flex flex-col justify-between border-primary/40 bg-card/90 shadow-md relative overflow-hidden group hover:border-primary transition-all duration-200">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl pointer-events-none group-hover:bg-primary/20 transition-all duration-200" />
          <CardHeader className="space-y-3 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Bug className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="border-primary/40 text-primary font-semibold text-2xs">
                  Mới cập nhật
                </Badge>
                <Badge variant="secondary" className="text-2xs font-medium">
                  Light & Dark Mode
                </Badge>
              </div>
            </div>
            <div>
              <CardTitle className="text-lg font-bold group-hover:text-primary transition-colors">
                Hướng dẫn Cấu hình Sentry & Tự động tạo Task Jira
              </CardTitle>
              <CardDescription className="text-xs mt-1.5 leading-relaxed text-muted-foreground">
                Tài liệu chuẩn dành cho thành viên: Hướng dẫn lấy token trên Sentry nội bộ (<code className="text-primary font-mono text-2xs">sentry.easypos.vn</code>), cấu hình ánh xạ dự án (<code className="text-primary font-mono text-2xs">easy-hrm:MHRM</code>) và quy trình duyệt lỗi tự động sinh Jira Issue.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-2.5 text-xs text-muted-foreground pt-0">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span>Bao gồm <strong>hình ảnh thực tế</strong> chụp từ giao diện Web App.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span>Tích hợp <strong>Bộ mô phỏng (Live Simulator)</strong> kiểm tra cú pháp trước khi lưu.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span>Bảng tra cứu sự cố (Troubleshooting) giải quyết lỗi token 401, 404.</span>
            </div>
          </CardContent>

          <CardFooter className="pt-3 border-t border-border flex items-center justify-between">
            <span className="text-2xs text-muted-foreground">File: public/sentry-config-guide.html</span>
            <Button size="sm" asChild className="cursor-pointer gap-1.5">
              <Link href="/sentry-config-guide.html" target="_blank" rel="noopener noreferrer">
                Xem tài liệu
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </CardFooter>
        </Card>

        {/* Webhook Configuration Guide - Featured Card */}
        <Card className="flex flex-col justify-between border-cyan-500/40 bg-card/90 shadow-md relative overflow-hidden group hover:border-cyan-500 transition-all duration-200">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-cyan-500/20 transition-all duration-200" />
          <CardHeader className="space-y-3 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                <Webhook className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="border-cyan-500/40 text-cyan-600 dark:text-cyan-400 font-semibold text-2xs">
                  Mới cập nhật
                </Badge>
                <Badge variant="secondary" className="text-2xs font-medium">
                  Jira + Bitbucket
                </Badge>
              </div>
            </div>
            <div>
              <CardTitle className="text-lg font-bold group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                Hướng dẫn Cấu hình Webhook (Jira & Git Bitbucket)
              </CardTitle>
              <CardDescription className="text-xs mt-1.5 leading-relaxed text-muted-foreground">
                Tài liệu cấu hình Webhook cho Jira Data Center (<code className="text-cyan-600 dark:text-cyan-400 font-mono text-2xs">/api/webhooks/jira</code>) và Bitbucket Git (<code className="text-cyan-600 dark:text-cyan-400 font-mono text-2xs">/api/webhooks/bitbucket</code>), kèm cơ chế bảo mật HMAC SHA-256 và cảnh báo merge trái phép.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-2.5 text-xs text-muted-foreground pt-0">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
              <span>Bao gồm <strong>hình ảnh minh họa trực quan</strong> trên Jira & Bitbucket.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
              <span>Hướng dẫn sinh khóa bí mật (Secret Key) bằng lệnh <code className="font-mono text-2xs">openssl</code>.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
              <span>Tự động phát hiện và cảnh báo <strong>Unauthorized Merge</strong> tới Leader.</span>
            </div>
          </CardContent>

          <CardFooter className="pt-3 border-t border-border flex items-center justify-between">
            <span className="text-2xs text-muted-foreground">File: public/webhook-config-guide.html</span>
            <Button size="sm" asChild className="cursor-pointer gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white dark:bg-cyan-600 dark:hover:bg-cyan-500">
              <Link href="/webhook-config-guide.html" target="_blank" rel="noopener noreferrer">
                Xem tài liệu Webhook
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </CardFooter>
        </Card>

        {/* Jira PAT Guide */}
        <Card className="flex flex-col justify-between border-border bg-card/90 shadow-sm hover:border-border/80 transition-all duration-200">
          <CardHeader className="space-y-3 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground border border-border">
                <KeyRound className="h-5 w-5" aria-hidden="true" />
              </div>
              <Badge variant="outline" className="text-2xs font-medium">
                Xác thực Jira
              </Badge>
            </div>
            <div>
              <CardTitle className="text-lg font-bold">
                Kết nối Tài khoản & Personal Access Token (PAT)
              </CardTitle>
              <CardDescription className="text-xs mt-1.5 leading-relaxed text-muted-foreground">
                Hướng dẫn tạo và quản lý Jira Personal Access Token trên Jira Data Center (<code className="font-mono text-2xs">jira-sds.softdreams.vn:8080</code>) để đồng bộ công việc, log time và cập nhật trạng thái nhiệm vụ.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-2.5 text-xs text-muted-foreground pt-0">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              <span>Cách tạo token an toàn trên Jira Profile mà không cần mật khẩu.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              <span>Mã hóa AES-256-GCM bảo vệ token tại máy chủ nội bộ.</span>
            </div>
          </CardContent>

          <CardFooter className="pt-3 border-t border-border flex items-center justify-between">
            <span className="text-2xs text-muted-foreground">Trang Cài đặt</span>
            <Button variant="outline" size="sm" asChild className="cursor-pointer gap-1.5">
              <Link href="/settings">
                Vào Cài đặt
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </CardFooter>
        </Card>

        {/* Bitbucket Integration Guide */}
        <Card className="flex flex-col justify-between border-border bg-card/90 shadow-sm hover:border-border/80 transition-all duration-200">
          <CardHeader className="space-y-3 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground border border-border">
                <GitBranch className="h-5 w-5" aria-hidden="true" />
              </div>
              <Badge variant="outline" className="text-2xs font-medium">
                Git & Code Review
              </Badge>
            </div>
            <div>
              <CardTitle className="text-lg font-bold">
                Tích hợp Bitbucket Server & Tạo nhánh Git
              </CardTitle>
              <CardDescription className="text-xs mt-1.5 leading-relaxed text-muted-foreground">
                Kết nối Bitbucket Server (<code className="font-mono text-2xs">git-sds.softdreams.vn:7990</code>) để hỗ trợ tạo nhanh branch tính năng từ task Jira và liên kết Pull Request.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-2.5 text-xs text-muted-foreground pt-0">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              <span>Cấp quyền đọc danh sách 80+ repositories của công ty.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              <span>Tự động liên kết commit và PR vào mã Jira Task tương ứng.</span>
            </div>
          </CardContent>

          <CardFooter className="pt-3 border-t border-border flex items-center justify-between">
            <span className="text-2xs text-muted-foreground">Branches & Delivery</span>
            <Button variant="outline" size="sm" asChild className="cursor-pointer gap-1.5">
              <Link href="/branches">
                Xem nhánh
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </CardFooter>
        </Card>

        {/* Release Management & Policy Guide */}
        <Card className="flex flex-col justify-between border-border bg-card/90 shadow-sm hover:border-border/80 transition-all duration-200">
          <CardHeader className="space-y-3 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground border border-border">
                <Rocket className="h-5 w-5" aria-hidden="true" />
              </div>
              <Badge variant="outline" className="text-2xs font-medium">
                Vận hành
              </Badge>
            </div>
            <div>
              <CardTitle className="text-lg font-bold">
                Quy trình Phát hành & Điều kiện Release Gate
              </CardTitle>
              <CardDescription className="text-xs mt-1.5 leading-relaxed text-muted-foreground">
                Quy tắc kiểm duyệt chất lượng phiên bản phần mềm, điều kiện khóa release (không còn lỗi Sentry blocker chưa giải quyết) trước khi triển khai sản phẩm.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-2.5 text-xs text-muted-foreground pt-0">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              <span>Tiêu chí Release Gate: kiểm tra task đã test và không có blocker.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              <span>Hỗ trợ gửi thông báo phát hành tự động qua Discord và Web Push.</span>
            </div>
          </CardContent>

          <CardFooter className="pt-3 border-t border-border flex items-center justify-between">
            <span className="text-2xs text-muted-foreground">Quản lý phát hành</span>
            <Button variant="outline" size="sm" asChild className="cursor-pointer gap-1.5">
              <Link href="/release">
                Xem phát hành
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
