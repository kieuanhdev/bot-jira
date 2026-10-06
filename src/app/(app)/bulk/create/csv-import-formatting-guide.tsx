import { Info } from "lucide-react";

export function CsvImportFormattingGuide() {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3.5 text-xs">
      <div className="flex items-center gap-2 font-semibold text-foreground">
        <Info className="h-4 w-4 text-primary" aria-hidden="true" />
        Bảng quy tắc cột chuẩn (Canonical Columns)
      </div>
      <p className="text-muted-foreground leading-relaxed text-[11px]">
        Hệ thống hỗ trợ cả tiêu đề tiếng Anh và tiếng Việt. Tiêu đề không phân biệt chữ hoa, chữ thường.
      </p>
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-muted/60 font-semibold text-muted-foreground">
            <tr>
              <th className="p-2">Cột chuẩn</th>
              <th className="p-2">Bắt buộc</th>
              <th className="p-2">Định dạng chấp nhận</th>
              <th className="p-2">Ví dụ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            <tr>
              <td className="p-2 font-mono font-medium">summary</td>
              <td className="p-2 text-destructive font-semibold">Có</td>
              <td className="p-2 text-muted-foreground">Văn bản 1–255 ký tự</td>
              <td className="p-2 font-mono">Sửa lỗi đăng nhập</td>
            </tr>
            <tr>
              <td className="p-2 font-mono font-medium">issueType</td>
              <td className="p-2 text-destructive font-semibold">Có</td>
              <td className="p-2 text-muted-foreground">Tên hoặc ID loại công việc (chọn từ dropdown trong file mẫu)</td>
              <td className="p-2 font-mono">Task [10001], Task</td>
            </tr>
            <tr>
              <td className="p-2 font-mono font-medium">clientRef</td>
              <td className="p-2 text-destructive font-semibold">Có</td>
              <td className="p-2 text-muted-foreground">Mã định danh duy nhất trong file (vd: TASK-001)</td>
              <td className="p-2 font-mono">TASK-001</td>
            </tr>
            <tr>
              <td className="p-2 font-mono font-medium">parentRef</td>
              <td className="p-2 text-muted-foreground">Không</td>
              <td className="p-2 text-muted-foreground">clientRef của task cha TRONG CÙNG BATCH</td>
              <td className="p-2 font-mono">TASK-001</td>
            </tr>
            <tr>
              <td className="p-2 font-mono font-medium">parentKey</td>
              <td className="p-2 text-muted-foreground">Không</td>
              <td className="p-2 text-muted-foreground">Jira key của task cha ĐÃ CÓ SẴN (không điền cùng parentRef)</td>
              <td className="p-2 font-mono">ABC-123</td>
            </tr>
            <tr>
              <td className="p-2 font-mono font-medium">description</td>
              <td className="p-2 text-muted-foreground">Không</td>
              <td className="p-2 text-muted-foreground">Văn bản chi tiết mô tả</td>
              <td className="p-2 font-mono">Mô tả tác vụ</td>
            </tr>
            <tr>
              <td className="p-2 font-mono font-medium">assignee</td>
              <td className="p-2 text-muted-foreground">Không</td>
              <td className="p-2 text-muted-foreground">Tên [username] hoặc username Jira</td>
              <td className="p-2 font-mono">Nguyễn Văn A [nguyenvana]</td>
            </tr>
            <tr>
              <td className="p-2 font-mono font-medium">priority</td>
              <td className="p-2 text-muted-foreground">Không</td>
              <td className="p-2 text-muted-foreground">Tên [ID] hoặc tên mức ưu tiên</td>
              <td className="p-2 font-mono">High [3], Medium</td>
            </tr>
            <tr>
              <td className="p-2 font-mono font-medium">labels</td>
              <td className="p-2 text-muted-foreground">Không</td>
              <td className="p-2 text-muted-foreground">Phân cách bằng dấu phẩy</td>
              <td className="p-2 font-mono">backend, api</td>
            </tr>
            <tr>
              <td className="p-2 font-mono font-medium">points</td>
              <td className="p-2 text-muted-foreground">Không</td>
              <td className="p-2 text-muted-foreground">Số nguyên không âm (0, 1, 2, 3...)</td>
              <td className="p-2 font-mono">3</td>
            </tr>
            <tr>
              <td className="p-2 font-mono font-medium">originalEstimate</td>
              <td className="p-2 text-muted-foreground">Không</td>
              <td className="p-2 text-muted-foreground">Thời gian theo chuẩn Jira</td>
              <td className="p-2 font-mono">1d 4h, 30m</td>
            </tr>
            <tr>
              <td className="p-2 font-mono font-medium">dueDate</td>
              <td className="p-2 text-muted-foreground">Không</td>
              <td className="p-2 text-muted-foreground">Định dạng YYYY-MM-DD</td>
              <td className="p-2 font-mono">2026-10-10</td>
            </tr>
            <tr>
              <td className="p-2 font-mono font-medium">fixVersions</td>
              <td className="p-2 text-muted-foreground">Không</td>
              <td className="p-2 text-muted-foreground">Tên hoặc ID phiên bản Jira</td>
              <td className="p-2 font-mono">Release 1.0 [10420]</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
