"use client";

import { useState } from "react";
import {
  Palette,
  Sparkles,
  Layers,
  Type,
  LayoutGrid,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Clock,
  Filter,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { JiraAvatar } from "@/components/jira-avatar";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { PageContainer } from "@/components/shared/page-container";

export function UIGalleryClient() {
  const [selectedMetric, setSelectedMetric] = useState<string>("active");
  const [checkboxChecked, setCheckboxChecked] = useState(true);
  const [popoverValue, setPopoverValue] = useState<string>("");

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
      <PageContainer size="wide" className="flex flex-col gap-8">
        {/* Gallery Header */}
        <PageHeader
          eyebrow="Development Only"
          icon={Palette}
          title="UI Component Gallery"
          description="Thư viện kiểm thử trực quan toàn bộ primitives, typography và token màu ở cả chế độ Sáng và Tối."
          actions={
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-muted-foreground">Chế độ giao diện:</span>
              <ThemeToggle />
            </div>
          }
        />

        {/* 1. Typography Hierarchy */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Type className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>1. Phân cấp cỡ chữ (Typography Scale)</CardTitle>
            </div>
            <CardDescription>
              Thang chữ mới: mọi nhãn phụ ≥ 12px. text-xs = 13px, text-sm = 15px.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-1 border-b pb-3">
              <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                Page Title — text-2xl font-bold tracking-tight
              </span>
              <h1 className="text-2xl font-bold tracking-tight">Bảng công việc dự án ABC</h1>
            </div>
            <div className="flex flex-col gap-1 border-b pb-3">
              <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                Section / Card Title — text-base font-semibold
              </span>
              <h2 className="text-base font-semibold">Danh sách công việc cần xử lý</h2>
            </div>
            <div className="flex flex-col gap-1 border-b pb-3">
              <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                Body / Table Cell — text-sm (15px)
              </span>
              <p className="text-sm">
                Nội dung thẻ và mô tả chi tiết công việc. Hiển thị rõ ràng với độ tương phản cao, dễ đọc trên cả nền sáng và nền tối.
              </p>
            </div>
            <div className="flex flex-col gap-1 border-b pb-3">
              <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                Meta / Label — text-xs (13px)
              </span>
              <p className="text-xs text-muted-foreground">
                Cập nhật lần cuối: 5 phút trước • Người tạo: Nguyễn Văn A • Trạng thái: Đang tiến hành
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                Badge / Micro-label — text-2xs (12px, font-medium)
              </span>
              <p className="text-2xs font-medium text-muted-foreground">
                Độ ưu tiên: Cao • Sprint 42 • Nhánh: feature/board-refresh
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 2. Badges */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>2. Huy hiệu ngữ nghĩa (Badges)</CardTitle>
            </div>
            <CardDescription>
              Tất cả badge đạt chuẩn tương phản WCAG AA (≥ 4.5:1) ở cả Light và Dark mode.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2.5 items-center">
            <Badge variant="default">Default Primary</Badge>
            <Badge variant="success">Hoàn thành (Success)</Badge>
            <Badge variant="warning">Cảnh báo (Warning)</Badge>
            <Badge variant="info">Thông tin (Info)</Badge>
            <Badge variant="danger">Khẩn cấp (Danger)</Badge>
            <Badge variant="neutral">Trung tính (Neutral)</Badge>
            <Badge variant="outline">Đường viền (Outline)</Badge>
            <Badge variant="primary-soft">Primary Soft</Badge>
          </CardContent>
        </Card>

        {/* 3. Buttons */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>3. Nút bấm (Buttons)</CardTitle>
            </div>
            <CardDescription>
              Kích thước chuẩn: default h-10, sm h-9, lg h-11, icon h-10, icon-sm h-8.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="default">Nút chính (Default)</Button>
              <Button variant="outline">Đường viền (Outline)</Button>
              <Button variant="secondary">Nút phụ (Secondary)</Button>
              <Button variant="ghost">Trong suốt (Ghost)</Button>
              <Button variant="destructive">Nguy hiểm (Destructive)</Button>
              <Button variant="link">Dạng link</Button>
            </div>
            <div className="flex flex-wrap gap-3 items-center pt-2 border-t">
              <Button size="lg">Size Lg (h-11)</Button>
              <Button size="default">Size Default (h-10)</Button>
              <Button size="sm">Size Sm (h-9)</Button>
              <Button size="icon" aria-label="Icon default">
                <Search className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button size="icon-sm" variant="outline" aria-label="Icon sm">
                <Filter className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button disabled>Vô hiệu hóa (Disabled)</Button>
            </div>
          </CardContent>
        </Card>

        {/* 4. KPI Metric Cards */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>4. Thẻ chỉ số tổng quan (MetricCards)</CardTitle>
            </div>
            <CardDescription>
              Các tone ngữ nghĩa: primary, info, success, warning, danger, neutral. Có trạng thái active.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard
              label="Tổng task"
              value={128}
              tone="primary"
              icon={Sparkles}
              selected={selectedMetric === "total"}
              onClick={() => setSelectedMetric("total")}
            />
            <MetricCard
              label="Đang mở"
              value={42}
              tone="info"
              icon={Info}
              selected={selectedMetric === "active"}
              onClick={() => setSelectedMetric("active")}
            />
            <MetricCard
              label="Hoàn thành"
              value={76}
              tone="success"
              icon={CheckCircle2}
              selected={selectedMetric === "done"}
              onClick={() => setSelectedMetric("done")}
            />
            <MetricCard
              label="Có cảnh báo"
              value={8}
              tone="warning"
              icon={AlertTriangle}
              selected={selectedMetric === "warn"}
              onClick={() => setSelectedMetric("warn")}
            />
            <MetricCard
              label="Bị chặn"
              value={2}
              tone="danger"
              icon={XCircle}
              selected={selectedMetric === "danger"}
              onClick={() => setSelectedMetric("danger")}
            />
            <MetricCard
              label="Chờ xử lý"
              value={15}
              tone="neutral"
              icon={Clock}
              selected={selectedMetric === "neutral"}
              onClick={() => setSelectedMetric("neutral")}
            />
          </CardContent>
        </Card>

        {/* 5. Avatars */}
        <Card>
          <CardHeader>
            <CardTitle>5. Avatar thành viên (JiraAvatar)</CardTitle>
            <CardDescription>
              Bảng kích thước mới: xs (h-5), sm (h-6), md (h-7), lg (h-9), xl (h-12).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-6">
            <div className="flex flex-col items-center gap-1.5">
              <JiraAvatar displayName="Anh Kieu" size="xs" />
              <span className="text-2xs text-muted-foreground">xs (20px)</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <JiraAvatar displayName="Bao Tran" size="sm" />
              <span className="text-2xs text-muted-foreground">sm (24px)</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <JiraAvatar displayName="Cuong Le" size="md" />
              <span className="text-2xs text-muted-foreground">md (28px)</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <JiraAvatar displayName="Dung Pham" size="lg" />
              <span className="text-2xs text-muted-foreground">lg (36px)</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <JiraAvatar displayName="Emma Watson" size="xl" />
              <span className="text-2xs text-muted-foreground">xl (48px)</span>
            </div>
          </CardContent>
        </Card>

        {/* 6. Form Controls */}
        <Card>
          <CardHeader>
            <CardTitle>6. Điều khiển nhập liệu (Form Controls)</CardTitle>
            <CardDescription>
              Input h-10, viền border-input rõ ràng, focus ring chuẩn teal primary.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">Tiêu đề công việc</label>
              <Input placeholder="Nhập tên task..." defaultValue="Làm mới UI/UX toàn app" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">Jira Key</label>
              <Input placeholder="PROJ-123" defaultValue="TEAM-502" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-semibold text-foreground">Mô tả công việc</label>
              <Textarea placeholder="Nhập ghi chú chi tiết..." rows={3} defaultValue="Tối ưu kích thước chữ, tăng tương phản WCAG và kích hoạt dark mode." />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Checkbox
                id="gallery-checkbox"
                checked={checkboxChecked}
                onCheckedChange={(checked) => setCheckboxChecked(Boolean(checked))}
              />
              <label htmlFor="gallery-checkbox" className="text-sm cursor-pointer select-none">
                Áp dụng thay đổi cho toàn bộ dự án
              </label>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Checkbox id="gallery-checkbox-indeterminate" checked="indeterminate" />
              <label htmlFor="gallery-checkbox-indeterminate" className="text-sm cursor-pointer select-none">
                Chọn một phần (indeterminate)
              </label>
            </div>
            <div className="space-y-2 md:col-span-2 pt-2">
              <label className="text-xs font-semibold text-foreground">Popover + Command</label>
              <div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline">{popoverValue || "Chọn thành viên..."}</Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0">
                    <Command>
                      <CommandInput placeholder="Tìm thành viên..." />
                      <CommandList>
                        <CommandEmpty>Không có kết quả</CommandEmpty>
                        <CommandGroup heading="Thành viên">
                          {["An", "Bình", "Chi"].map((name) => (
                            <CommandItem key={name} value={name} onSelect={setPopoverValue}>
                              {name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="space-y-1.5 md:col-span-2 pt-2">
              <div className="flex justify-between text-xs font-medium">
                <span>Tiến độ hoàn thành</span>
                <span className="text-primary font-semibold">100% (Phase 5)</span>
              </div>
              <Progress value={100} className="h-2" />
            </div>
          </CardContent>
        </Card>

        {/* 7. Data Table */}
        <Card>
          <CardHeader>
            <CardTitle>7. Bảng dữ liệu (Table Primitive)</CardTitle>
            <CardDescription>
              Header h-11 uppercase text-xs font-semibold, hàng cao ≥ 44px text-sm.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Mã Task</TableHead>
                    <TableHead>Tiêu đề</TableHead>
                    <TableHead className="w-36">Người thực hiện</TableHead>
                    <TableHead className="w-32">Trạng thái</TableHead>
                    <TableHead className="w-24 text-right">Estimate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-mono font-semibold text-xs text-primary">TEAM-101</TableCell>
                    <TableCell className="font-medium">Nâng cấp token màu và thang chữ Tailwind v4</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <JiraAvatar displayName="Kieu Anh" size="sm" />
                        <span className="text-xs">Kieu Anh</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="success">Hoàn thành</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">4h</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-mono font-semibold text-xs text-primary">TEAM-102</TableCell>
                    <TableCell className="font-medium">Chuyển đổi toàn bộ component sang design tokens</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <JiraAvatar displayName="Dev Bot" size="sm" />
                        <span className="text-xs">Dev Bot</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="success">Hoàn thành</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">6h</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-mono font-semibold text-xs text-primary">TEAM-103</TableCell>
                    <TableCell className="font-medium">Kích hoạt chuyển đổi giao diện Sáng / Tối / Hệ thống</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <JiraAvatar displayName="Super Power" size="sm" />
                        <span className="text-xs">Super Power</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="info">Đang kiểm thử</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">2h</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* 8. Empty State & Skeletons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>8a. Trạng thái trống (EmptyState)</CardTitle>
              <CardDescription>Icon vòng tròn bg-muted, tiêu đề và gợi ý một dòng.</CardDescription>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={Search}
                title="Không tìm thấy task phù hợp"
                hint="Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm trên thanh công cụ."
                action={
                  <Button variant="outline" size="sm">
                    Xóa bộ lọc
                  </Button>
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>8b. Skeleton Loading</CardTitle>
              <CardDescription>Hiển thị placeholder tải trang chuẩn kích thước.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <Skeleton className="h-20 w-full rounded-lg" />
              <div className="flex gap-2">
                <Skeleton className="h-9 w-24 rounded-md" />
                <Skeleton className="h-9 w-24 rounded-md" />
              </div>
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    </div>
  );
}
