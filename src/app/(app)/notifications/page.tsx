import { NotificationsClient } from "./notifications-client";

export const metadata = {
  title: "Trung tâm thông báo",
  description: "Quản lý và xem lịch sử thông báo trong hệ thống Team Task Web",
};

export default function NotificationsPage() {
  return <NotificationsClient />;
}
