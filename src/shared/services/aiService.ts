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
}

export interface AIGeneratedReport {
  insights: string;
  bottleneck: string;
  recommendation: string;
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

type AIBlockType = 'insights' | 'bottleneck' | 'recommendation' | 'nextPlan' | 'fullReport';

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

  return lines.join('\n');
}

// ─── Prompt Templates ──────────────────────────────────────

const SYSTEM_PROMPT = `Bạn là trợ lý phân tích nội dung chuyên sâu của phòng Content Ecom tại Long Châu (FPT Long Châu - chuỗi nhà thuốc và tiêm chủng).

Quy tắc:
- Viết bằng tiếng Việt, văn phong chuyên nghiệp, ngắn gọn, sắc sảo
- LUÔN trích dẫn số liệu cụ thể từ data để chứng minh nhận định
- Không dùng từ ngữ chung chung, mơ hồ
- Phân tích phải có chiều sâu: so sánh, tìm nguyên nhân, đưa ra insight mà người nhìn data thường bỏ qua
- Output dùng bullet points, dấu gạch đầu dòng (-), emoji phù hợp
- Khi phân tích team: chú ý đến tỷ lệ đóng góp, hiệu suất/nhân viên, xu hướng tăng/giảm`;

const PROMPTS: Record<AIBlockType, string> = {
  insights: `Dựa trên dữ liệu báo cáo bên dưới, hãy viết phần "Nhận xét tổng quan" cho báo cáo kỳ này.

Yêu cầu:
- 4-6 bullet points
- Mỗi bullet phải có số liệu cụ thể
- Nêu bật: (1) Thành tựu nổi bật, (2) Xu hướng so với kỳ trước, (3) Phân bổ lực lượng giữa các team, (4) Highlight nhân viên xuất sắc
- Kết thúc bằng 1 câu đánh giá tổng thể

Chỉ trả về nội dung nhận xét, không cần tiêu đề hay heading.`,

  bottleneck: `Dựa trên dữ liệu báo cáo bên dưới, hãy phân tích và chỉ ra các "Điểm nghẽn & Khó khăn" của kỳ này.

Yêu cầu:
- 2-4 điểm nghẽn cụ thể
- Mỗi điểm phải: (1) Nêu vấn đề rõ ràng, (2) Chỉ ra bằng chứng từ data, (3) Phân tích nguyên nhân có thể, (4) Đề xuất ngắn gọn hướng khắc phục
- Ưu tiên: dự án chậm tiến độ, team sụt giảm, chất lượng review kém, mất cân đối nhân lực

Chỉ trả về nội dung phân tích, không cần tiêu đề.`,

  recommendation: `Dựa trên dữ liệu báo cáo bên dưới, hãy viết phần "Mở rộng & Đề xuất" cho Leader.

Yêu cầu:
- 2-4 đề xuất cụ thể, khả thi
- Mỗi đề xuất phải: (1) Nêu rõ hành động, (2) Giải thích tại sao dựa trên data, (3) Kết quả kỳ vọng
- Có thể đề xuất: mở rộng team, tập trung vào nhóm nội dung nào, cải thiện quy trình, ứng dụng công nghệ
- Giọng văn mang tính xây dựng, hướng tới hành động

Chỉ trả về nội dung đề xuất, không cần tiêu đề.`,

  nextPlan: `Dựa trên dữ liệu báo cáo kỳ này bên dưới, hãy gợi ý "Kế hoạch triển khai kỳ tới".

Trả về JSON với đúng 7 trường sau (mỗi trường là string, viết dạng bullet points):
{
  "general": "Định hướng chung cho kỳ tới (2-3 bullet points)",
  "goals": "Mục tiêu nội dung cụ thể (2-3 bullet points với số liệu target)",
  "topics": "Chủ đề Focus nên tập trung (2-3 chủ đề/bệnh lý cụ thể)",
  "team": "Kế hoạch phát triển đội ngũ (đào tạo, tuyển dụng, phân công)",
  "team_baiviet": "Công việc cụ thể cho Team Bài viết kỳ tới",
  "team_sanpham": "Công việc cụ thể cho Team Sản phẩm kỳ tới",
  "team_multimedia": "Công việc cụ thể cho Team Multimedia kỳ tới"
}

CHỈ trả về JSON, không có text nào khác bên ngoài JSON.`,

  fullReport: `Dựa trên dữ liệu báo cáo bên dưới, hãy sinh toàn bộ nội dung phân tích cho báo cáo kỳ này.

Trả về JSON với đúng cấu trúc sau:
{
  "insights": "Nhận xét tổng quan (4-6 bullet points, mỗi bullet có số liệu)",
  "bottleneck": "Điểm nghẽn & Khó khăn (2-4 điểm, có bằng chứng và nguyên nhân)",
  "recommendation": "Mở rộng & Đề xuất (2-4 đề xuất khả thi)",
  "nextPlan": {
    "general": "Định hướng chung (2-3 bullets)",
    "goals": "Mục tiêu nội dung (2-3 bullets với target số)",
    "topics": "Chủ đề Focus (2-3 chủ đề cụ thể)",
    "team": "Phát triển đội ngũ",
    "team_baiviet": "Công việc Team Bài viết",
    "team_sanpham": "Công việc Team Sản phẩm",
    "team_multimedia": "Công việc Team Multimedia"
  }
}

Quy tắc:
- Mỗi field là string, viết dạng bullet points dấu gạch đầu dòng (-)
- PHẢI trích dẫn số liệu cụ thể
- CHỈ trả về JSON, không có text nào khác bên ngoài JSON.`,
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

// ─── Parse Helpers ─────────────────────────────────────────

function extractJSON(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0].trim();

  return text;
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

export async function generateNextPlan(context: ReportContext): Promise<AIGeneratedReport['nextPlan']> {
  const raw = await generateBlock('nextPlan', context);
  const json = extractJSON(raw);
  try {
    return JSON.parse(json);
  } catch {
    throw new Error('AI trả về format không hợp lệ. Vui lòng thử lại.');
  }
}

export async function generateFullReport(context: ReportContext): Promise<AIGeneratedReport> {
  const raw = await generateBlock('fullReport', context);
  const json = extractJSON(raw);
  try {
    return JSON.parse(json);
  } catch {
    throw new Error('AI trả về format không hợp lệ. Vui lòng thử lại.');
  }
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
