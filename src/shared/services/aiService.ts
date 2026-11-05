/**
 * AI Service — Gemini via Vercel Serverless Proxy (/api/ai)
 * API Key giấu ở server-side, frontend không bao giờ nhìn thấy key.
 *
 * - Các khối có cấu trúc (báo cáo đầy đủ, kế hoạch, phân tích comment, báo cáo tuần)
 *   yêu cầu Gemini trả JSON theo `responseSchema` → không phải bóc thẻ XML bằng regex.
 * - Các khối văn bản đơn (nhận xét, điểm nghẽn, đề xuất) và chat hỗ trợ streaming
 *   qua callback `onDelta` để hiện chữ dần khi AI đang viết.
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
    /** % so kỳ trước; null = kỳ trước không có dữ liệu để so sánh */
    deltaLinks: number | null;
    deltaPoints: number | null;
    deltaSubmits: number | null;
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
  /** Nội dung comment/nhận xét khách hàng thực tế, dạng thô (mỗi dòng 1 comment, KHÔNG tự đánh số). */
  customerCommentsRaw?: string;
  /** Thông tin bổ sung ngoài dữ liệu hệ thống (note họp, feedback thị trường...) do người dùng cung cấp. */
  additionalContext?: string;
}

export interface NextPlan {
  general: string;
  goals: string;
  topics: string;
  team: string;
  team_baiviet: string;
  team_sanpham: string;
  team_multimedia: string;
}

export interface CommentAnalysis {
  text: string;
  /** ID 1-based, khớp với `splitCommentLines(customerCommentsRaw)` */
  hotspotIds: number[];
  improvementIds: number[];
}

export interface AIGeneratedReport {
  insights: string;
  bottleneck: string;
  recommendation: string;
  customerCommentAnalysis?: CommentAnalysis;
  nextPlan: NextPlan;
}

export interface WeeklyAIResult {
  insights: string;
  bottlenecks: string;
  aiAssessment: string;
  nextWeekPlan: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

type OnDelta = (fullTextSoFar: string) => void;

// ─── Model Config (stored client-side, no secret) ──────────

const AI_MODEL_STORAGE = 'ai_gemini_model';
const DEFAULT_MODEL = 'gemini-2.5-pro';

export function getStoredModel(): string {
  try { return localStorage.getItem(AI_MODEL_STORAGE) || DEFAULT_MODEL; } catch { return DEFAULT_MODEL; }
}

export function setStoredModel(model: string): void {
  try { localStorage.setItem(AI_MODEL_STORAGE, model); } catch { /* ignore */ }
}

/** Phân tích số liệu cần ổn định, ít "sáng tác"; chat cho phép tự nhiên hơn một chút. */
const ANALYSIS_TEMPERATURE = 0.3;
const CHAT_TEMPERATURE = 0.6;
/** Gemini 2.5 tính cả token "suy nghĩ" vào giới hạn này → để rộng tránh bị cắt giữa chừng. */
const MAX_OUTPUT_TOKENS = 32768;

// ─── Context Builder ───────────────────────────────────────

/** Tách comment thô thành các dòng không rỗng. ID gửi cho AI = vị trí trong mảng này + 1. */
export function splitCommentLines(raw?: string): string[] {
  return (raw || '').split('\n').map(l => l.trim()).filter(Boolean);
}

/** Đổi danh sách ID (1-based) AI trả về thành nội dung comment tương ứng. */
export function commentsByIds(raw: string | undefined, ids: number[]): string[] {
  const lines = splitCommentLines(raw);
  return ids.map(id => lines[id - 1]).filter((l): l is string => !!l);
}

function fmtDelta(d: number | null): string {
  if (d === null) return 'chưa có dữ liệu kỳ trước';
  return `${d > 0 ? '+' : ''}${d}%`;
}

export function buildContextString(ctx: ReportContext): string {
  const lines: string[] = [];

  lines.push(`## Kỳ báo cáo: ${ctx.periodLabel}`);
  lines.push('');

  lines.push('### Tổng quan số liệu');
  lines.push(`- Tổng link/sản phẩm: ${ctx.stats.totalLinks}`);
  lines.push(`- Tổng điểm: ${ctx.stats.totalPoints.toFixed(0)}`);
  lines.push(`- Lượt submit: ${ctx.stats.totalSubmits}`);
  lines.push(`- Số nhân viên: ${ctx.stats.employeeCount}`);
  lines.push(`- Điểm trung bình/nhân viên: ${ctx.stats.avgPointsPerEmp.toFixed(1)}`);
  lines.push(`- So kỳ trước — Link: ${fmtDelta(ctx.stats.deltaLinks)}, Điểm: ${fmtDelta(ctx.stats.deltaPoints)}, Submit: ${fmtDelta(ctx.stats.deltaSubmits)}`);
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

  const commentLines = splitCommentLines(ctx.customerCommentsRaw);
  if (commentLines.length > 0) {
    const MAX_CHARS = 45000;
    let shown = commentLines.map((l, i) => ({ id: i + 1, l }));
    let body = shown.map(c => `[ID: ${c.id}] ${c.l}`).join('\n');
    let sampleNote = '';
    if (body.length > MAX_CHARS && commentLines.length > 1) {
      const avgLen = Math.max(1, body.length / commentLines.length);
      const step = Math.max(1, Math.ceil(commentLines.length / Math.max(1, Math.floor(MAX_CHARS / avgLen))));
      shown = shown.filter((_, i) => i % step === 0);
      body = shown.map(c => `[ID: ${c.id}] ${c.l}`).join('\n');
      sampleNote = ` — đây là mẫu ${shown.length}/${commentLines.length} dòng, hãy suy rộng nhận định cho cả tổng thể`;
    }
    lines.push(`### Nội dung comment khách hàng (dữ liệu thô, đánh số ID, tổng ${commentLines.length} dòng${sampleNote})`);
    lines.push(body);
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

// ─── Prompts ───────────────────────────────────────────────

const SYSTEM_PROMPT = `Bạn là trợ lý phân tích nội dung chuyên sâu của phòng Content Ecom tại Long Châu.

Quy tắc CỐT LÕI:
1. Viết bằng tiếng Việt, văn phong chuyên nghiệp, chiến lược.
2. LUÔN trích dẫn số liệu cụ thể, và CHỈ dùng số liệu có trong dữ liệu được cung cấp — không tự bịa hay tự tính ra số mới không có căn cứ.
3. Nếu một mục ghi "chưa có dữ liệu kỳ trước" thì không được nhận định tăng/giảm cho mục đó.
4. Sử dụng markdown (in đậm, gạch đầu dòng), ngắn gọn, dễ scan.
5. Phân tích phải có chiều sâu, kết nối dữ liệu với giá trị thương hiệu.
6. Nếu có "Nội dung comment khách hàng", hãy đọc kỹ và trích dẫn theo [ID: x].
7. Viết trọn vẹn, không bỏ dở câu.`;

const TEXT_PROMPTS = {
  insights: 'Hãy viết phần "Nhận xét tổng quan" cho báo cáo kỳ này. Chỉ trả về nội dung markdown, không cần tiêu đề.',
  bottleneck: 'Hãy phân tích "Điểm nghẽn & Khó khăn" của kỳ này. Chỉ trả về nội dung markdown, không cần tiêu đề.',
  recommendation: 'Hãy viết phần "Mở rộng & Đề xuất" mang tính định hướng. Chỉ trả về nội dung markdown, không cần tiêu đề.',
} as const;

type TextBlock = keyof typeof TEXT_PROMPTS;

const COMMENT_RULES = `Phân tích comment khách hàng (các dòng đánh số [ID: x]):
- hotspotIds: ID comment "điểm nóng" (tiêu cực rõ ràng, phàn nàn gay gắt, rủi ro thương hiệu, cần xử lý khẩn).
- improvementIds: ID comment "cần cải thiện" (thắc mắc, thiếu thông tin, góp ý xây dựng, cơ hội tối ưu).
- Chỉ dùng ID có thật trong dữ liệu. Không có comment thì để mảng rỗng và text rỗng.
- text: bài phân tích markdown súc tích, BẮT BUỘC đủ 3 phần, mỗi phần có % ước tính và trích 1-2 comment tiêu biểu [ID: x]:
  **Điểm sáng** (hướng phát huy) · **Điểm nóng** (hành động xử lý) · **Cơ hội / Cần cải thiện** (hướng tối ưu).`;

const NEXT_PLAN_RULES = `Kế hoạch triển khai kỳ tới (mỗi trường là markdown gạch đầu dòng ngắn gọn, in đậm ý chính):
general = định hướng chung; goals = mục tiêu (có số cụ thể); topics = chủ đề focus; team = phát triển đội ngũ;
team_baiviet / team_sanpham / team_multimedia = công việc của từng team.`;

// ─── JSON Schemas (Gemini responseSchema) ──────────────────

const STR = { type: 'STRING' } as const;
const INT_ARR = { type: 'ARRAY', items: { type: 'INTEGER' } } as const;

function obj(props: Record<string, unknown>) {
  const keys = Object.keys(props);
  return { type: 'OBJECT', properties: props, required: keys, propertyOrdering: keys };
}

const NEXT_PLAN_SCHEMA = obj({
  general: STR, goals: STR, topics: STR, team: STR,
  team_baiviet: STR, team_sanpham: STR, team_multimedia: STR,
});

const COMMENT_SCHEMA = obj({ hotspotIds: INT_ARR, improvementIds: INT_ARR, text: STR });

const FULL_REPORT_SCHEMA = obj({
  insights: STR,
  bottleneck: STR,
  recommendation: STR,
  customerCommentAnalysis: COMMENT_SCHEMA,
  nextPlan: NEXT_PLAN_SCHEMA,
});

const WEEKLY_SCHEMA = obj({ insights: STR, bottlenecks: STR, aiAssessment: STR, nextWeekPlan: STR });

// ─── Transport ─────────────────────────────────────────────

interface GeminiContent { role: 'user' | 'model'; parts: { text: string }[] }
interface GeminiPart { text?: string; thought?: boolean }
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

interface CallOptions {
  contents: GeminiContent[];
  temperature: number;
  responseSchema?: unknown;
  onDelta?: OnDelta;
  systemPrompt?: string;
}

const TIMEOUT_MS = 180_000;

function partsText(r: GeminiResponse): string {
  return (r.candidates?.[0]?.content?.parts || [])
    .filter(p => !p.thought && typeof p.text === 'string')
    .map(p => p.text)
    .join('');
}

function finishProblem(r: GeminiResponse): string | null {
  if (r.promptFeedback?.blockReason) return `AI từ chối yêu cầu (${r.promptFeedback.blockReason}).`;
  const reason = r.candidates?.[0]?.finishReason;
  if (reason === 'MAX_TOKENS') return 'Câu trả lời của AI quá dài nên bị cắt. Hãy thử lại hoặc rút gọn dữ liệu bổ sung.';
  if (reason === 'SAFETY' || reason === 'RECITATION' || reason === 'PROHIBITED_CONTENT') return `AI dừng giữa chừng (${reason}).`;
  return null;
}

async function errorFromResponse(res: Response): Promise<Error> {
  const body = await res.json().catch(() => null) as { error?: string } | null;
  return new Error(body?.error || `Lỗi API (${res.status})`);
}

/** Đọc luồng SSE `data: {...}` từ proxy, gọi onDelta với toàn bộ văn bản đã nhận. */
async function readStream(res: Response, onDelta: OnDelta): Promise<{ text: string; last: GeminiResponse }> {
  if (!res.body) throw new Error('Trình duyệt không hỗ trợ streaming.');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
  let last: GeminiResponse = {};

  const handleEvent = (raw: string) => {
    const data = raw.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('');
    if (!data || data === '[DONE]') return;
    let chunk: GeminiResponse & { error?: { message?: string } | string };
    try { chunk = JSON.parse(data); } catch { return; }
    if (chunk.error) throw new Error(typeof chunk.error === 'string' ? chunk.error : chunk.error.message || 'Lỗi AI');
    last = chunk;
    const piece = partsText(chunk);
    if (piece) { text += piece; onDelta(text); }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      handleEvent(buf.slice(0, idx));
      buf = buf.slice(idx + 2);
    }
  }
  if (buf.trim()) handleEvent(buf);
  return { text, last };
}

async function callGemini({ contents, temperature, responseSchema, onDelta, systemPrompt = SYSTEM_PROMPT }: CallOptions): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const stream = !!onDelta && !responseSchema;

  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: getStoredModel(),
        stream,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          temperature,
          topP: 0.95,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          ...(responseSchema ? { responseMimeType: 'application/json', responseSchema } : {}),
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) throw await errorFromResponse(res);

    let text: string;
    let last: GeminiResponse;
    if (stream) {
      ({ text, last } = await readStream(res, onDelta!));
    } else {
      last = await res.json() as GeminiResponse;
      text = partsText(last);
    }

    const problem = finishProblem(last);
    if (problem && (responseSchema || !text.trim())) throw new Error(problem);
    if (!text.trim()) throw new Error('AI không trả về kết quả. Vui lòng thử lại.');
    return text.trim();
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Quá thời gian chờ (${TIMEOUT_MS / 1000}s). Vui lòng thử lại.`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Gemini đôi khi bọc JSON trong ```json … ``` dù đã yêu cầu JSON thuần. */
export function parseJsonResponse<T>(raw: string): T {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error('AI trả về dữ liệu không đúng định dạng. Vui lòng thử lại.');
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const ids = (v: unknown) => (Array.isArray(v) ? v.map(Number).filter(n => Number.isInteger(n) && n > 0) : []);

function normalizeNextPlan(v: unknown): NextPlan {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    general: str(o.general), goals: str(o.goals), topics: str(o.topics), team: str(o.team),
    team_baiviet: str(o.team_baiviet), team_sanpham: str(o.team_sanpham), team_multimedia: str(o.team_multimedia),
  };
}

function normalizeComments(v: unknown): CommentAnalysis {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return { text: str(o.text), hotspotIds: ids(o.hotspotIds), improvementIds: ids(o.improvementIds) };
}

function userTurn(instruction: string, ctx: ReportContext): GeminiContent[] {
  return [{ role: 'user', parts: [{ text: `${instruction}\n\n---\n\nDỮ LIỆU BÁO CÁO:\n${buildContextString(ctx)}` }] }];
}

async function generateJson<T>(instruction: string, ctx: ReportContext, schema: unknown): Promise<T> {
  const raw = await callGemini({ contents: userTurn(instruction, ctx), temperature: ANALYSIS_TEMPERATURE, responseSchema: schema });
  return parseJsonResponse<T>(raw);
}

// ─── Public API ────────────────────────────────────────────

export async function generateTextBlock(block: TextBlock, ctx: ReportContext, onDelta?: OnDelta): Promise<string> {
  return callGemini({ contents: userTurn(TEXT_PROMPTS[block], ctx), temperature: ANALYSIS_TEMPERATURE, onDelta });
}

export const generateInsights = (ctx: ReportContext, onDelta?: OnDelta) => generateTextBlock('insights', ctx, onDelta);
export const generateBottleneck = (ctx: ReportContext, onDelta?: OnDelta) => generateTextBlock('bottleneck', ctx, onDelta);
export const generateRecommendation = (ctx: ReportContext, onDelta?: OnDelta) => generateTextBlock('recommendation', ctx, onDelta);

export async function generateCustomerCommentAnalysis(ctx: ReportContext): Promise<CommentAnalysis> {
  if (splitCommentLines(ctx.customerCommentsRaw).length === 0) {
    throw new Error('Chưa có comment khách hàng để phân tích.');
  }
  const result = normalizeComments(await generateJson<unknown>(COMMENT_RULES, ctx, COMMENT_SCHEMA));
  if (!result.text) throw new Error('AI trả về thiếu nội dung phân tích. Vui lòng thử lại.');
  return result;
}

export async function generateNextPlan(ctx: ReportContext): Promise<NextPlan> {
  const plan = normalizeNextPlan(await generateJson<unknown>(
    `Dựa trên dữ liệu kỳ này, hãy gợi ý kế hoạch kỳ tới.\n${NEXT_PLAN_RULES}`, ctx, NEXT_PLAN_SCHEMA,
  ));
  if (!plan.general) throw new Error('AI trả về thiếu thông tin. Vui lòng thử lại.');
  return plan;
}

export async function generateFullReport(ctx: ReportContext): Promise<AIGeneratedReport> {
  const instruction = `Hãy sinh toàn bộ nội dung phân tích cho báo cáo kỳ này. Mỗi trường văn bản là markdown gạch đầu dòng ngắn gọn, in đậm ý chính.
- insights: Nhận xét tổng quan.
- bottleneck: Điểm nghẽn & khó khăn.
- recommendation: Mở rộng & đề xuất.
- customerCommentAnalysis: ${COMMENT_RULES}
- nextPlan: ${NEXT_PLAN_RULES}`;
  const o = await generateJson<Record<string, unknown>>(instruction, ctx, FULL_REPORT_SCHEMA);
  const report: AIGeneratedReport = {
    insights: str(o.insights),
    bottleneck: str(o.bottleneck),
    recommendation: str(o.recommendation),
    customerCommentAnalysis: normalizeComments(o.customerCommentAnalysis),
    nextPlan: normalizeNextPlan(o.nextPlan),
  };
  if (!report.insights) throw new Error('AI trả về thiếu thông tin. Vui lòng thử lại.');
  return report;
}

export async function generateWeeklyReport(ctx: ReportContext): Promise<WeeklyAIResult> {
  const instruction = `Hãy phân tích và sinh nội dung đánh giá cho báo cáo TUẦN này. Mỗi trường là markdown gạch đầu dòng ngắn gọn, in đậm ý chính, có số liệu cụ thể:
- insights: Nhận xét từ số liệu tuần — năng suất, sản lượng, so với tuần trước, so sánh giữa các nhóm việc và nhân sự nổi bật.
- bottlenecks: Điểm nghẽn & rủi ro tuần — dự án chậm tiến độ, rủi ro KPI hoặc chất lượng.
- aiAssessment: Đánh giá chung — kết quả, rủi ro tiềm ẩn và hành động thiết thực ngay tuần tới.
- nextWeekPlan: Kế hoạch tuần tới — hành động cụ thể, mỗi dòng có mức ưu tiên và người phụ trách gợi ý.`;
  const o = await generateJson<Record<string, unknown>>(instruction, ctx, WEEKLY_SCHEMA);
  const result: WeeklyAIResult = {
    insights: str(o.insights), bottlenecks: str(o.bottlenecks),
    aiAssessment: str(o.aiAssessment), nextWeekPlan: str(o.nextWeekPlan),
  };
  if (!result.insights && !result.aiAssessment) throw new Error('AI trả về thiếu thông tin. Vui lòng thử lại.');
  return result;
}

// ─── Chat (conversational, streaming) ──────────────────────

export async function chatWithAI(messages: ChatMessage[], ctx: ReportContext, onDelta?: OnDelta): Promise<string> {
  const systemPrompt = `${SYSTEM_PROMPT}

Dưới đây là dữ liệu báo cáo hiện tại mà bạn có thể tham chiếu khi trả lời:

${buildContextString(ctx)}

Khi user hỏi, hãy trả lời dựa trên dữ liệu này. Nếu user hỏi ngoài phạm vi data, hãy trả lời theo kiến thức chung nhưng luôn liên hệ lại với context công việc Content Ecom, và nói rõ phần nào không có trong dữ liệu.`;

  return callGemini({
    systemPrompt,
    contents: messages.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
    temperature: CHAT_TEMPERATURE,
    onDelta,
  });
}
