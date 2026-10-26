import type { CiFinding, CiTask } from '@/shared/types';
import { COLUMNS } from './importParser';

export const SHEET_HEADER = COLUMNS.join('\t');

const RUBRIC = `Thang 100 điểm:
- medical_accuracy (0–30): chính xác & an toàn y khoa
- reader_intent (0–25): giá trị cho người đọc & đúng search intent
- completeness (0–15): đầy đủ & chiều sâu
- evidence_quality (0–15): bằng chứng & nguồn
- editorial_quality (0–10): chất lượng biên tập
- actionability (0–5): hành động tiếp theo/CTA phù hợp
Mức độ (độc lập với điểm): P0 lời khuyên nguy hại khẩn cấp; P1 lỗi y khoa lớn; P2 lỗi nội dung/biên tập đáng kể; P3 chỉnh nhỏ.
category: quality_issue | content_opportunity | medical_verification.
Quy tắc biên tập: H2 không có H3 là hợp lệ; nếu H2 có H3 thì phải ≥ 2 H3; H3 nên < 10 từ; tránh H2 "Kết luận/Lời khuyên"; không bịa trích dẫn bác sĩ; tránh khẳng định tuyệt đối.`;

const OUTPUT_RULES = `ĐỊNH DẠNG TRẢ LỜI — chỉ trả về một khối TSV (phân tách bằng TAB), dòng đầu là tiêu đề cột y hệt:
${SHEET_HEADER}
- Mỗi dòng = 1 phát hiện; BẮT BUỘC lặp lại url đầy đủ (bắt đầu bằng https://), title, checked_at (giờ Việt Nam, dạng YYYY-MM-DD HH:mm, không ghi múi giờ), check_type và 6 cột điểm ở MỌI dòng của bài.
- total = tổng 6 tiêu chí. Bài không có phát hiện: 1 dòng, để trống severity.
- quote phải là trích dẫn NGUYÊN VĂN trong bài (hoặc để trống nếu lỗi là sự thiếu vắng).
- evidence_urls: chỉ URL bạn thực sự đã đọc; nhiều URL cách nhau bằng dấu cách. Không tự tạo URL.
- Không chắc về mặt y khoa → category medical_verification, verification "needs_verification".
- Khác biệt so với bài đối thủ là content_opportunity, không phải lỗi y khoa.
- Không có ký tự TAB hay xuống dòng bên trong một ô.
- Nếu không đọc được bài: 1 dòng với summary "insufficient_evidence", để trống điểm. Không tự tạo điểm.`;

export const QC_PROMPT = `Bạn là chuyên gia QC nội dung sức khoẻ tiếng Việt cho Long Châu. Hãy đánh giá bài viết sau (check_type = qc).
${RUBRIC}

${OUTPUT_RULES}

Bài cần đánh giá (URL + nội dung nếu bạn không truy cập được trang):
[DÁN URL VÀ NỘI DUNG BÀI Ở ĐÂY]`;

export function recheckPrompt(task: CiTask, findings: CiFinding[]) {
  const list = findings.map(f => `- ${f.id} | ${f.severity} | ${f.location} | ${f.quote ? `"${f.quote}" | ` : ''}${f.rationale}`).join('\n');
  return `Bạn là chuyên gia QC nội dung sức khoẻ tiếng Việt cho Long Châu. Đây là KIỂM TRA LẠI (check_type = recheck) sau khi biên tập viên đã sửa bài.
URL: ${task.resultUrl || task.url}

Các lỗi đã phát hiện trước đó:
${list}

Với MỖI lỗi cũ: thêm 1 dòng có previous_finding_id = mã lỗi, previous_status = resolved | unresolved | unable_to_verify, rationale = giải thích ngắn (nếu unresolved, quote = đoạn còn lỗi nguyên văn trong bản mới).
Lỗi MỚI phát sinh: thêm dòng bình thường, để trống previous_finding_id.
${RUBRIC}

${OUTPUT_RULES}

Nội dung bài sau khi sửa (nếu bạn không truy cập được trang):
[DÁN NỘI DUNG BÀI ĐÃ SỬA Ở ĐÂY]`;
}
