# Mục tiêu AutoImprove

Cải thiện tính dễ bảo trì và độ tin cậy của code hiện có mà không thay
đổi hành vi sản phẩm.

Trong mỗi lần chạy, chỉ chọn **một** vấn đề nhỏ, tác động rõ ràng, rủi ro
thấp và có thể kiểm chứng tự động. Ưu tiên theo thứ tự:

1. Lỗi tiềm ẩn hoặc xử lý biên thiếu an toàn.
2. Kiểu dữ liệu không chặt chẽ có thể che giấu lỗi.
3. Logic trùng lặp hoặc quá phức tạp trong một phạm vi hẹp.
4. Thiếu test cho hành vi quan trọng đã tồn tại.
5. Anti-pattern hiệu năng có bằng chứng trực tiếp trong code.

Không chọn thay đổi dependency, migration, secret, hạ tầng/deploy, hoặc refactor
rộng. Có thể sửa nội dung file này trước khi chạy `/auto-improve` để đặt
mục tiêu cụ thể hơn.
