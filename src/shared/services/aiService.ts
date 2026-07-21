/**
 * AI Service — Gemini 2.5 Pro via Vercel Serverless Proxy
 * API Key giấu ở server-side (/api/ai), frontend không bao giờ nhìn thấy key
 */

// ─── Types ─────────────────────────────────────────────────

export interface ReportContext {
  periodLabel: string;
  stats: {
    totalLinks: number;
    totalPoints: number;
    totalSubmits: number;
    baiMoi: number;
    sku: number;
    multimedia: number;
    toiUu: number;
    employeeCount: number;
    avgPointsPerEmp: number;
    deltaLinks: number;
    deltaPoints: number;
    deltaSubmits: number;
  };
  teamBreakdown: [string, { links: number; points: number }][];
  topEmployees: { name: string; links: number; points: number }[];
  qualityStats: {
    avgScore: number;
    totalReviews: number;
    totalComments: number;
    pctPositive: number;
    pctNegative: number;
  };
  projectProgress: { name: string; progress: number }[];
  projectsFocus: { name: string; type: string; links: number }[];
  tasksBreakdown: { type: string; details: { name: string; links: number; points: number }[] }[];
  /** Nội dung comment/nhận xét khách hàng thực tế, do người phụ trách dán vào (mỗi dòng 1 comment). */
  customerCommentsRaw?: string;
  /** Thông tin bổ sung ngoài dữ liệu hệ thống (note họp, feedback thị trường...) do người dùng cung cấp để AI khai thác thêm. */
  additionalContext?: string;
}

export interface AIGeneratedReport {
  insights: string;
  bottleneck: string;
  recommendation: string;
  customerCommentAnalysis?: { text: string; hotspotIds: number[] };
  nextPlan: {
    general: string;
    goals: string;
    topics: string;
    team: string;
    team_baiviet: string;
    team_sanpham: string;
    team_multimedia: string;
  };
}

type AIBlockType = 'insights' | 'bottleneck' | 'recommendation' | 'nextPlan' | 'fullReport' | 'customerCommentAnalysis' | 'weeklyReport';

// ─── Model Config (stored client-side, no secret) ──────────

const AI_MODEL_STORAGE = 'ai_gemini_model';

export function getStoredModel(): string {
  return localStorage.getItem(AI_MODEL_STORAGE) || 'gemini-2.5-pro';
}

export function setStoredModel(model: string): void {
  localStorage.setItem(AI_MODEL_STORAGE, model);
}

// ─── Context Builder ───────────────────────────────────────

function buildContextString(ctx: ReportContext): string {
  const lines: string[] = [];

  lines.push(`## Kỳ báo cáo: ${ctx.periodLabel}`);
  lines.push('');

  lines.push('### Tổng quan số liệu');
  lines.push(`- Tổng link/sản phẩm: ${ctx.stats.totalLinks}`);
  lines.push(`- Tổng điểm: ${ctx.stats.totalPoints.toFixed(0)}`);
  lines.push(`- Lượt submit: ${ctx.stats.totalSubmits}`);
  lines.push(`- Số nhân viên: ${ctx.stats.employeeCount}`);
  lines.push(`- Điểm trung bình/nhân viên: ${ctx.stats.avgPointsPerEmp.toFixed(1)}`);
  lines.push(`- So kỳ trước — Link: ${ctx.stats.deltaLinks > 0 ? '+' : ''}${ctx.stats.deltaLinks}%, Điểm: ${ctx.stats.deltaPoints > 0 ? '+' : ''}${ctx.stats.deltaPoints}%`);
  lines.push('');

  lines.push('### Phân bổ theo nhóm công việc');
  lines.push(`- Bài viết (Góc sức khỏe, Bệnh lý): ${ctx.stats.baiMoi} link`);
  lines.push(`- Sản phẩm (SKU): ${ctx.stats.sku} link`);
  lines.push(`- Multimedia (Video, Ảnh, Tin nhanh): ${ctx.stats.multimedia} link`);
  lines.push(`- Tối ưu SP - Bài viết: ${ctx.stats.toiUu} link`);
  lines.push('');

  if (ctx.teamBreakdown.length > 0) {
    lines.push('### Phân bổ theo team');
    ctx.teamBreakdown.forEach(([team, data]) => {
      lines.push(`- ${team}: ${data.links} link, ${data.points.toFixed(0)} điểm`);
    });
    lines.push('');
  }

  if (ctx.topEmployees.length > 0) {
    lines.push('### Top nhân viên (theo điểm)');
    ctx.topEmployees.slice(0, 5).forEach((e, i) => {
      lines.push(`${i + 1}. ${e.name}: ${e.links} link, ${e.points.toFixed(0)} điểm`);
    });
    lines.push('');
  }

  if (ctx.qualityStats.totalReviews > 0) {
    lines.push('### Chất lượng & Compliance');
    lines.push(`- Tổng lượt đánh giá: ${ctx.qualityStats.totalReviews}`);
    lines.push(`- Điểm trung bình: ${ctx.qualityStats.avgScore.toFixed(1)}/10`);
    lines.push(`- Tổng comment: ${ctx.qualityStats.totalComments}`);
    lines.push(`- Tích cực: ${ctx.qualityStats.pctPositive}%, Tiêu cực: ${ctx.qualityStats.pctNegative}%`);
    lines.push('');
  }

  if (ctx.customerCommentsRaw && ctx.customerCommentsRaw.trim()) {
    const allLines = ctx.customerCommentsRaw.split('\n').map(l => l.trim()).filter(Boolean);
    const MAX_CHARS = 45000; 

    let commentsForPrompt = allLines.map((l, i) => `[ID: ${i + 1}] ${l}`).join('\n');
    let sampleNote = '';
    if (commentsForPrompt.length > MAX_CHARS && allLines.length > 1) {
      const avgLen = Math.max(1, commentsForPrompt.length / allLines.length);
      const targetCount = Math.max(1, Math.floor(MAX_CHARS / avgLen));
      const step = Math.max(1, Math.ceil(allLines.length / targetCount));
      const sampled = allLines.map((l, i) => ({l, i})).filter((_, i) => i % step === 0);
      commentsForPrompt = sampled.map(item => `[ID: ${item.i + 1}] ${item.l}`).join('\n');
      sampleNote = ` — đây là mẫu ${sampled.length}/${allLines.length} dòng, hãy suy rộng nhận định cho cả tổng thể`;
    }

    lines.push(`### Nội dung comment khách hàng (dữ liệu thô, đánh số ID, tổng ${allLines.length} dòng${sampleNote})`);
    lines.push(commentsForPrompt);
    lines.push('');
  }

  if (ctx.projectProgress.length > 0) {
    lines.push('### Tiến độ dự án');
    ctx.projectProgress.forEach(p => {
      const status = p.progress >= 80 ? '✅' : p.progress >= 50 ? '🟡' : '🔴';
      lines.push(`- ${status} ${p.name}: ${p.progress}%`);
    });
    lines.push('');
  }

  if (ctx.projectsFocus.length > 0) {
    lines.push('### Dự án focus trong kỳ');
    ctx.projectsFocus.forEach(p => {
      lines.push(`- ${p.name} (${p.type}): ${p.links} link`);
    });
    lines.push('');
  }

  if (ctx.tasksBreakdown.length > 0) {
    lines.push('### Chi tiết đầu việc');
    ctx.tasksBreakdown.forEach(t => {
      lines.push(`**${t.type}**`);
      t.details.slice(0, 5).forEach(d => {
        lines.push(`  - ${d.name}: ${d.links} link, ${d.points.toFixed(0)} điểm`);
      });
    });
    lines.push('');
  }

  if (ctx.additionalContext && ctx.additionalContext.trim()) {
    lines.push('### Thông tin bổ sung do người phụ trách cung cấp (ngoài số liệu hệ thống)');
    lines.push(ctx.additionalContext.trim());
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Prompt Templates ──────────────────────────────────────

const SYSTEM_PROMPT = `Bạn là trợ lý phân tích nội dung chuyên sâu của phòng Content Ecom tại Long Châu.

Quy tắc CỐT LÕI:
1. Viết bằng tiếng Việt, văn phong chuyên nghiệp, chiến lược.
2. LUÔN trích dẫn số liệu cụ thể.
3. Sử dụng markdown (in đậm, gạch đầu dòng).
4. Phân tích phải có chiều sâu, kết nối dữ liệu với giá trị thương hiệu.
5. Nếu có "Nội dung comment khách hàng", hãy đọc kỹ ID và khai thác thực chất.`;

const PROMPTS: Record<AIBlockType, string> = {
  insights: `Dựa trên dữ liệu báo cáo bên dưới, hãy viết phần "Nhận xét tổng quan" cho báo cáo kỳ này. Chỉ trả về nội dung, không cần tiêu đề.`,

  bottleneck: `Dựa trên dữ liệu báo cáo bên dưới, hãy phân tích "Điểm nghẽn & Khó khăn". Chỉ trả về nội dung, không cần tiêu đề.`,

  recommendation: `Dựa trên dữ liệu báo cáo bên dưới, hãy viết phần "Mở rộng & Đề xuất" mang tính định hướng. Chỉ trả về nội dung, không cần tiêu đề.`,

   customerCommentAnalysis: `Đọc kỹ mục "Nội dung comment khách hàng (dữ liệu thô)" và "Thông tin bổ sung" (nếu có). Dữ liệu comment thô đã được đánh số [ID: x].

Yêu cầu:
1. Đầu tiên, lọc ra các ID của những comment thuộc nhóm "điểm nóng" (tiêu cực, phàn nàn, cần xử lý) hoặc nhóm "cần cải thiện/cơ hội" (khách thắc mắc, thiếu thông tin, ý kiến đóng góp) và đưa vào thẻ <hotspot_ids>...</hotspot_ids>. Phân tách ID bằng dấu phẩy (VD: <hotspot_ids>1, 5, 23</hotspot_ids>). Nếu không có, hãy để trống thẻ này.
2. Tiếp theo, viết phân tích tổng quan vào thẻ <customerCommentAnalysis>...</customerCommentAnalysis>: nhóm chủ đề lặp lại, trích dẫn tối đa 2 comment tiêu biểu cho mỗi nhóm trong ngoặc kép, đối chiếu với số liệu, và đề xuất hành động. Dùng gạch đầu dòng. Viết ngắn gọn, súc tích (mỗi phần phân tích của mỗi chủ đề chỉ tối đa 2-3 câu).`,

  nextPlan: `Dựa trên dữ liệu báo cáo kỳ này bên dưới, hãy gợi ý "Kế hoạch triển khai kỳ tới" sử dụng thẻ XML: <general>, <goals>, <topics>, <team>, <team_baiviet>, <team_sanpham>, <team_multimedia>.`,

  fullReport: `Dựa trên dữ liệu báo cáo bên dưới, hãy sinh toàn bộ nội dung phân tích cho báo cáo kỳ này.
Trả về kết quả bằng cách sử dụng đúng các thẻ XML theo thứ tự sau:
<insights>Nhận xét tổng quan</insights>
<bottleneck>Điểm nghẽn</bottleneck>
<recommendation>Mở rộng & Đề xuất</recommendation>
<hotspot_ids>ID các comment tiêu cực/điểm nóng hoặc cần cải thiện/cơ hội (VD: 1, 5, 23). Nếu không có, để trống.</hotspot_ids>
<customerCommentAnalysis>Phân tích comment khách hàng chi tiết (ngắn gọn, mỗi chủ đề tối đa 2-3 câu)</customerCommentAnalysis>
<nextPlan>
  <general>Định hướng chung</general>
  <goals>Mục tiêu</goals>
  <topics>Chủ đề Focus</topics>
  <team>Phát triển đội ngũ</team>
  <team_baiviet>Công việc Team Bài viết</team_baiviet>
  <team_sanpham>Công việc Team Sản phẩm</team_sanpham>
  <team_multimedia>Công việc Team Multimedia</team_multimedia>
</nextPlan>

Quy tắc:
- BẮT BUỘC viết dưới dạng ngắn gọn, dễ scan, súc tích.
- TÍCH CỰC dùng định dạng markdown: in đậm (**), gạch đầu dòng (-) cho các ý chính.
- PHẢI trích dẫn số liệu cụ thể tự nhiên.
- BẮT BUỘC dùng thẻ XML (ví dụ: <insights>...</insights>).`,

  weeklyReport: `Dựa trên dữ liệu báo cáo tuần bên dưới, hãy phân tích và sinh nội dung đánh giá cho báo cáo tuần này.

Trả về kết quả bằng cách sử dụng đúng các thẻ XML sau (bên trong mỗi thẻ viết dưới dạng gạch đầu dòng ngắn gọn, dễ hiểu, in đậm các ý chính):

<insights>Nhận xét từ số liệu tuần: tóm tắt ngắn gọn năng suất, sản lượng, so sánh giữa các nhóm việc và top nhân sự nổi bật</insights>
<bottleneck>Điểm nghẽn & Rủi ro tuần: nhận diện các vấn đề chậm tiến độ dự án, rủi ro về KPI hoặc chất lượng</bottleneck>
<aiAssessment>Đánh giá AI: Nhận định chính về kết quả chung, rủi ro tiềm ẩn và đề xuất hành động thiết thực ngay trong tuần tới</aiAssessment>
<nextWeekPlan>Kế hoạch tuần tới: định hướng hành động cụ thể cho tuần tới</nextWeekPlan>

Quy tắc:
- Trình bày ngắn gọn, chuyên nghiệp, dễ scan.
- Sử dụng markdown: gạch đầu dòng (-) và in đậm (**) để làm nổi bật ý.
- PHẢI trích dẫn số liệu cụ thể.
- BẮT BUỘC dùng thẻ XML (ví dụ: <insights>...</insights>).`
};

// ─── API Call via Vercel Proxy ─────────────────────────────

async function callAIProxy(
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout for Gemini 2.5 Pro

  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n---\n\n${userPrompt}` }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 4096,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(errBody.error || `Lỗi API (${res.status})`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('AI không trả về kết quả. Vui lòng thử lại.');
    return text.trim();
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Request timeout (120s). Vui lòng thử lại.');
    }
    throw err;
  }
}



// ─── Public API ────────────────────────────────────────────

export async function generateBlock(
  blockType: AIBlockType,
  context: ReportContext
): Promise<string> {
  const model = getStoredModel();
  const contextStr = buildContextString(context);
  const prompt = `${PROMPTS[blockType]}\n\n---\n\nDỮ LIỆU BÁO CÁO:\n${contextStr}`;

  return callAIProxy(model, SYSTEM_PROMPT, prompt);
}

export async function generateInsights(context: ReportContext): Promise<string> {
  return generateBlock('insights', context);
}

export async function generateBottleneck(context: ReportContext): Promise<string> {
  return generateBlock('bottleneck', context);
}

export async function generateRecommendation(context: ReportContext): Promise<string> {
  return generateBlock('recommendation', context);
}

export async function generateCustomerCommentAnalysis(context: ReportContext): Promise<{ text: string; hotspotIds: number[] }> {
  const raw = await generateBlock('customerCommentAnalysis', context);
  const text = extractTag(raw, 'customerCommentAnalysis');
  const idsStr = extractTag(raw, 'hotspot_ids');
  const hotspotIds = idsStr ? idsStr.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)) : [];
  return { text, hotspotIds };
}

function extractTag(text: string, tag: string): string {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  if (match) return match[1].trim();
  // Fallback if tag is missing closing tag or capitalized
  const fallback = text.match(new RegExp(`<${tag}>(.*)`, 'is'));
  return fallback ? fallback[1].trim() : '';
}

export async function generateNextPlan(context: ReportContext): Promise<AIGeneratedReport['nextPlan']> {
  const raw = await generateBlock('nextPlan', context);
  
  const general = extractTag(raw, 'general');
  if (!general) throw new Error('AI trả về thiếu thông tin. Vui lòng thử lại. (Lỗi: ' + raw.substring(0, 50) + ')');

  return {
    general,
    goals: extractTag(raw, 'goals'),
    topics: extractTag(raw, 'topics'),
    team: extractTag(raw, 'team'),
    team_baiviet: extractTag(raw, 'team_baiviet'),
    team_sanpham: extractTag(raw, 'team_sanpham'),
    team_multimedia: extractTag(raw, 'team_multimedia'),
  };
}

export async function generateFullReport(context: ReportContext): Promise<AIGeneratedReport> {
  const raw = await generateBlock('fullReport', context);
  
  const insights = extractTag(raw, 'insights');
  if (!insights) throw new Error('AI trả về thiếu thông tin. Vui lòng thử lại. (Lỗi: ' + raw.substring(0, 50) + ')');

  return {
    insights,
    bottleneck: extractTag(raw, 'bottleneck'),
    recommendation: extractTag(raw, 'recommendation'),
    customerCommentAnalysis: {
      text: extractTag(raw, 'customerCommentAnalysis'),
      hotspotIds: extractTag(raw, 'hotspot_ids').split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
    },
    nextPlan: {
      general: extractTag(raw, 'general'),
      goals: extractTag(raw, 'goals'),
      topics: extractTag(raw, 'topics'),
      team: extractTag(raw, 'team'),
      team_baiviet: extractTag(raw, 'team_baiviet'),
      team_sanpham: extractTag(raw, 'team_sanpham'),
      team_multimedia: extractTag(raw, 'team_multimedia'),
    }
  };
}

export async function generateWeeklyReport(context: ReportContext): Promise<{
  insights: string;
  bottlenecks: string;
  aiAssessment: string;
  nextWeekPlan: string;
}> {
  const raw = await generateBlock('weeklyReport', context);
  return {
    insights: extractTag(raw, 'insights'),
    bottlenecks: extractTag(raw, 'bottleneck'),
    aiAssessment: extractTag(raw, 'aiAssessment'),
    nextWeekPlan: extractTag(raw, 'nextWeekPlan')
  };
}

// ─── Chat (conversational) ─────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export async function chatWithAI(
  messages: ChatMessage[],
  context: ReportContext
): Promise<string> {
  const model = getStoredModel();
  const contextStr = buildContextString(context);

  const systemWithContext = `${SYSTEM_PROMPT}

Dưới đây là dữ liệu báo cáo hiện tại mà bạn có thể tham chiếu khi trả lời:

${contextStr}

Khi user hỏi, hãy trả lời dựa trên dữ liệu này. Nếu user hỏi ngoài phạm vi data, hãy trả lời theo kiến thức chung nhưng luôn liên hệ lại với context công việc Content Ecom.`;

  const contents = messages.map(m => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));

  // Prepend system context
  if (contents.length > 0 && contents[0].role === 'user') {
    contents[0].parts[0].text = `${systemWithContext}\n\n---\n\nCâu hỏi: ${contents[0].parts[0].text}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        contents,
        generationConfig: {
          temperature: 0.8,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 4096,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(errBody.error || `Lỗi API (${res.status})`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('AI không trả về kết quả.');
    return text.trim();
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Request timeout. Vui lòng thử lại.');
    }
    throw err;
  }
}
