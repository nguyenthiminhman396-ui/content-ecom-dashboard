# Content Intelligence — bản gọn (nhập kết quả từ ChatGPT)

Bản đầy đủ (crawler, OpenAI, cron, benchmark đối thủ, migration `ci_*`) được cất ở nhánh `ci-full-pipeline` (commit `3e8d040`).
Lý do chuyển sang bản gọn: Nhà thuốc Long Châu chặn truy cập tự động (Cloudflare 403), nên phần QC được làm bằng ChatGPT và dashboard chỉ nhận kết quả.

## Luồng
1. Copy prompt QC (tab **Nhập kết quả**) → chạy trong ChatGPT → ChatGPT trả các dòng TSV theo cột cố định.
2. Dán vào Google Sheet chung (dòng 1 = tiêu đề cột) → copy các dòng sang dashboard, hoặc tải file .csv/.xlsx, hoặc đọc link CSV "Publish to web".
3. **Review Queue**: quản lý xác nhận / bác bỏ (bắt buộc lý do) / cần xác minh y khoa, chấm 1–5.
4. Giao việc → tạo To-do thật (`hcms_todos`, gắn nhãn Content Intelligence); mỗi phát hiện chỉ giao một lần.
5. Nhân sự nộp URL → To-do được tick hoàn thành (người giao nhận thông báo như cũ).
6. Copy prompt kiểm tra lại (có sẵn mã lỗi cũ) → ChatGPT → nhập kết quả → dashboard đối chiếu đã xử lý / chưa xử lý / lỗi mới / không xác minh được.
7. Quản lý nghiệm thu / yêu cầu sửa thêm (mở lại To-do) / cần xác minh y khoa.
8. **Báo cáo** ngày/tuần tính từ dữ liệu đã nhập.

## Cột dữ liệu (Google Sheet)
`url, title, checked_at, check_type, medical_accuracy, reader_intent, completeness, evidence_quality, editorial_quality, actionability, total, summary, severity, category, location, quote, rationale, suggested_action, evidence_urls, verification, previous_finding_id, previous_status`

Mỗi dòng = 1 phát hiện. Tổng điểm luôn tính lại từ 6 tiêu chí. Chống nhập trùng theo `url + checked_at + check_type` và theo từng phát hiện. Chỉ nhận URL của nhathuoclongchau.com.vn / tiemchunglongchau.com.vn.

## Lưu trữ
Dùng kho dữ liệu chung hiện có (`global_store` qua `appStore`): `hcms_ci_checks`, `hcms_ci_findings`, `hcms_ci_tasks`, `hcms_ci_settings`. Không migration, không API mới, không biến môi trường mới, không đụng KPI.

## Giới hạn
- Dashboard không tự kiểm chứng trích dẫn/URL của ChatGPT — gắn nhãn "Nguồn ChatGPT, chưa kiểm chứng tự động"; quản lý duyệt là chốt chặn.
- Không có quét tự động 17:00 / thứ Hai 09:00; báo cáo xem theo ngày/tuần bất kỳ lúc nào.
- Phân quyền theo cơ chế hiện có của app (ẩn/hiện theo role ở giao diện).
