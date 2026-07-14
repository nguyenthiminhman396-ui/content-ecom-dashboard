# Prompt: Dashboard Báo cáo tháng — Team Nội dung Long Châu

> Copy toàn bộ phần dưới đây (từ `--- BẮT ĐẦU PROMPT ---`) và dán vào công cụ vibe code.

---

--- BẮT ĐẦU PROMPT ---

## Bối cảnh & mục tiêu

Xây một **dashboard báo cáo tháng** cho Team Nội dung của FPT Long Châu (chuỗi nhà thuốc + tiêm chủng). Người xem chính là **lãnh đạo** — nên báo cáo phải kể được câu chuyện *giá trị team tạo ra*, không chỉ đếm số bài. Dashboard hiện tại chỉ hiển thị link / điểm / submit / nhân viên (toàn chỉ số khối lượng), nhìn sơ sài và tự giới hạn team thành "xưởng viết bài". Bản mới phải làm nổi bật **năng suất, chất lượng, và rủi ro compliance chặn được**.

## Yêu cầu kỹ thuật

- Xuất ra **1 file HTML tự chứa** (self-contained), dùng **Chart.js** load từ CDN. Không cần backend.
- Dữ liệu để ở **1 object JS ở đầu file** (biến `REPORT_DATA`) để tôi dễ thay bằng dữ liệu thật từ Google Sheets. Tách bạch phần dữ liệu và phần render.
- Responsive, chạy tốt trên MacBook + in ra PDF được (tránh màu nền quá đậm khi in).
- Tông màu: nền trắng/xám nhạt, card bo góc 12px, viền mảnh. Điểm nhấn tím (`#534AB7`) cho thương hiệu. Dùng màu coral/cam cho khối cảnh báo, teal/xanh lá cho khối tích cực.
- Font hệ thống (system-ui), sạch, không đổ bóng nặng.

## Cấu trúc dashboard — 6 khối, xếp từ trên xuống theo mạch kể

### Khối 0 — Header
- Tiêu đề "Báo cáo tháng — Team Nội dung", dòng phụ ghi tháng + "tổng hợp tự động từ N submissions".
- Góc phải: 3 nút export giả lập (HTML / PDF / Slide) — chỉ cần UI, chưa cần chức năng.

### Khối 1 — Tóm tắt điều hành (quan trọng nhất, đọc đầu tiên)
- 1 khối nền tím nhạt, có icon ✨.
- 3 ý trong 1 đoạn ngắn: (a) tháng này làm được gì đáng kể, (b) chặn được rủi ro gì, (c) cần lãnh đạo quyết gì.
- Nội dung lấy từ trường `REPORT_DATA.summary` (string). Đây là phần AI sẽ sinh, không tính tự động.

### Khối 2 — Năng suất & tăng trưởng theo nhóm ⭐ (có bộ lọc + biểu đồ)
Đây là khối tôi cần đầu tư nhất.

**Bộ lọc:** 3 nút bo tròn — `Tất cả` / `Nhà thuốc` / `Tiêm chủng`. Nút đang chọn nền tím nhạt viền tím, các nút khác trong suốt. Bấm nút → cập nhật cả metric cards lẫn 2 biểu đồ (chỉ ẩn/hiện dataset, không vẽ lại từ đầu).

**Metric cards (4 ô, cập nhật theo bộ lọc):**
1. Bài mới — tổng, dòng phụ "NT ... · TC ..."
2. Sản phẩm (SKU) — tổng, dòng phụ tương tự
3. Multimedia — tổng, dòng phụ tương tự
4. Tổng output — nền tím nhạt, kèm % so kỳ trước

Khi lọc theo 1 nhóm, metric cards chỉ tính nhóm đó; dòng phụ đổi thành tên nhóm.

**Biểu đồ cột (grouped bar):**
- Trục X: Bài mới / SKU / Multimedia. Hai series: Nhà thuốc (`#2a78d6`) và Tiêm chủng (`#1baf7a`).
- Legend tự làm bằng HTML (ô vuông nhỏ + tên), đặt phía trên canvas, tắt legend mặc định của Chart.js.
- Bo góc đầu cột 4px, cột dày tối đa 28px.

**Biểu đồ đường (line):**
- Trục X: các tuần (T1–T5). Hai đường: Nhà thuốc (nét liền), Tiêm chủng (nét đứt `borderDash:[5,4]` để in đen trắng vẫn phân biệt được).
- Tiêu đề nhỏ phía trên "Xu hướng output theo tuần".

### Khối 3 — Chất lượng & Compliance (khối "nặng ký" với ngành dược)
4 metric cards, tô màu theo ý nghĩa:
1. Điểm QC trung bình (thang /10) — nền teal nhạt
2. % pass HĐYK/BS ngay lần 1 — nền teal nhạt
3. Số ca compliance chặn (nhắc brand thuốc kê đơn / sai liều) — nền coral nhạt, đây là điểm nhấn
4. Lỗi phát hiện ở Spot Check sau publish — nền xám nhạt

Có badge nhỏ "rủi ro quản trị" cạnh tiêu đề khối. Thêm 1 dòng chú thích: mỗi ca compliance chặn được = 1 rủi ro pháp lý/thương hiệu tránh được.

### Khối 4 — Top chủ đề đang focus
Danh sách 4 chủ đề, mỗi chủ đề là 1 hàng có:
- Tên chủ đề + badge phân loại (campaign trọng điểm / E-E-A-T / launching...)
- Số bài + % tỷ trọng (căn phải)
- Thanh bar ngang thể hiện tỷ trọng (màu theo chủ đề)
- Dòng phụ: "Vì sao ưu tiên: ... · Giai đoạn: ..."

Dữ liệu từ `REPORT_DATA.topics` (mảng object).

### Khối 5 — Dự án & Phân bổ theo người (2 cột)
- Cột trái "Phân bổ theo người": danh sách nhân viên, mỗi người có avatar chữ cái + số output + điểm QC. Mục đích: thấy ai làm nhiều *mà vẫn giữ chất lượng*.
- Cột phải "Trạng thái dự án": danh sách dự án + badge trạng thái (đang chạy / % mục tiêu / pilot).

### Khối 6 — Mở rộng & Đề xuất
1 khối nền cam/amber nhạt, icon mũi tên đi lên. Nội dung từ `REPORT_DATA.recommendation` (string): dự báo volume tháng sau, hệ thống đáp ứng tới đâu, cần gì (người/tool/quyết định), và 1 câu đề nghị lãnh đạo duyệt cụ thể.

## Cấu trúc dữ liệu mẫu (dùng đúng shape này)

```js
const REPORT_DATA = {
  meta: { month: "Tháng 7 / 2026", submissions: 214 },
  summary: "Tháng 7 đội hoàn tất 198 bài + 340 SKU cho campaign tiêm chủng, đạt 106% kế hoạch với chỉ 3 người vận hành nhờ pipeline medLC. Chặn 11 ca compliance trước khi publish. Cần lãnh đạo quyết: mở rộng medLC sang website xét nghiệm.",
  productivity: {
    pharma:  { baiMoi: 118, sku: 210, multimedia: 64 },
    vaccine: { baiMoi: 80,  sku: 130, multimedia: 48 },
    growthPct: 18,
    weekly: {
      labels: ["T1","T2","T3","T4","T5"],
      pharma:  [78, 92, 88, 96, 48],
      vaccine: [52, 64, 60, 58, 24]
    }
  },
  quality: { qcAvg: 8.6, passRate: 84, complianceBlocked: 11, spotCheckErrors: 3 },
  topics: [
    { name: "Vắc-xin & tiêm chủng", tag: "campaign trọng điểm", count: 186, pct: 35, color: "#D85A30", why: "mùa cao điểm + campaign công ty", stage: "đang chạy nước rút" },
    { name: "Hỏi đáp cùng bác sĩ", tag: "E-E-A-T", count: 142, pct: 26, color: "#185FA5", why: "xây uy tín + AI-visibility", stage: "mở rộng đều tay" },
    { name: "Bệnh mạn tính & thuốc thế hệ mới", tag: "launching", count: 98, pct: 18, color: "#534AB7", why: "ra mắt SP mới (không nêu brand)", stage: "định hướng nhận thức" },
    { name: "Sức khỏe thường thức & SKU", tag: "", count: 112, pct: 21, color: "#888780", why: "nền tảng vận hành đều", stage: "duy trì" }
  ],
  people: [
    { name: "Nguyễn M.", initials: "NM", output: 214, qc: 8.9 },
    { name: "Trần L.", initials: "TL", output: 186, qc: 8.5 },
    { name: "Phạm H.", initials: "PH", output: 138, qc: 8.4 }
  ],
  projects: [
    { name: "medLC pipeline", status: "đang chạy", type: "ok" },
    { name: "Hỏi đáp cùng BS", status: "96% mục tiêu", type: "ok" },
    { name: "Web xét nghiệm", status: "pilot", type: "warn" }
  ],
  recommendation: "Volume tháng 8 dự kiến x1.8 khi campaign tiêm chủng mở rộng + pilot web xét nghiệm. Hệ thống hiện đáp ứng tới ~x1.4 với 3 người; vượt mức đó cần +1 vận hành hoặc mở QC Bot lớp 2. Đề nghị lãnh đạo duyệt: scale medLC sang web xét nghiệm trong tháng 8."
};
```

## Lưu ý khi render
- Mọi số hiển thị phải làm tròn (dùng `Math.round` hoặc `toLocaleString('vi-VN')`), tránh lỗi số thực lẻ.
- Canvas không đọc được biến CSS, nên hard-code mã hex cho màu biểu đồ.
- Wrap mỗi canvas trong div có `position:relative` và chiều cao cố định; Chart.js đặt `responsive:true, maintainAspectRatio:false`.
- Mỗi canvas có `role="img"` + `aria-label` mô tả nội dung.
- Bản Slide/PDF nên rút gọn: khối metric chỉ chiếu 3–4 ô đắt giá nhất, tránh "biển số" làm loãng thông điệp.

## Mở rộng sau (không bắt buộc lần này)
- Thêm donut % đóng góp mỗi nhóm.
- Nút "so sánh kỳ trước" hiển thị delta ± cho từng chỉ số.
- Sinh tự động `summary` và `recommendation` bằng cách gọi Gemini/Claude API với đầu vào là các con số trong `REPORT_DATA`.

--- KẾT THÚC PROMPT ---
