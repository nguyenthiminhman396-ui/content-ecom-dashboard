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
  customerCommentAnalysis?: string;
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

type AIBlockType = 'insights' | 'bottleneck' | 'recommendation' | 'nextPlan' | 'fullReport' | 'customerCommentAnalysis';

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
    const MAX_CHARS = 45000; // giữ prompt gọn (đủ cho vài nghìn comment ngắn), tránh request quá nặng/chậm

    let commentsForPrompt = allLines.join('\n');
    let sampleNote = '';
    if (commentsForPrompt.length > MAX_CHARS && allLines.length > 1) {
      // Lấy mẫu rải đều trên toàn bộ danh sách (không chỉ N dòng đầu) để đại diện cho cả tháng dữ liệu
      const avgLen = Math.max(1, commentsForPrompt.length / allLines.length);
      const targetCount = Math.max(1, Math.floor(MAX_CHARS / avgLen));
      const step = Math.max(1, Math.ceil(allLines.length / targetCount));
      const sampled = allLines.filter((_, i) => i % step === 0);
      commentsForPrompt = sampled.join('\n');
      sampleNote = ` — do số lượng lớn, đây là mẫu ${sampled.length}/${allLines.length} dòng lấy rải đều trên toàn bộ dữ liệu, hãy suy rộng nhận định cho cả tổng thể`;
    }

    lines.push(`### Nội dung comment khách hàng (dữ liệu thô, tổng cộng ${allLines.length} dòng, do người phụ trách cung cấp${sampleNote})`);
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

const SYSTEM_PROMPT = `Bạn là trợ lý phân tích nội dung chuyên sâu của phòng Content Ecom tại Long Châu (FPT Long Châu - chuỗi nhà thuốc và tiêm chủng).

Quy tắc CỐT LÕI (TUÂN THỦ 100%):
1. Viết bằng tiếng Việt, văn phong chuyên nghiệp, truyền cảm hứng, mang tính chiến lược cao.
2. LUÔN trích dẫn số liệu cụ thể từ data để chứng minh nhận định.
3. TUYỆT ĐỐI KHÔNG SỬ DỤNG: gạch đầu dòng (-), danh sách đánh số (1. 2.), in đậm (**), in nghiêng (*), biểu tượng cảm xúc (emoji).
4. CHỈ SỬ DỤNG VĂN XUÔI THUẦN TÚY (Plaintext): Viết thành các đoạn văn mạch lạc, phân tách nhau bằng cách xuống dòng. Các số liệu và tên người/team chỉ cần viết hoa hoặc để trong ngoặc kép nếu cần nhấn mạnh, không dùng markdown in đậm.
5. TẦM NHÌN & VAI TRÒ: Khi nhận xét, hãy mở rộng góc nhìn. Đừng chỉ đọc số liệu khô khan, hãy lồng ghép ý nghĩa của những con số đó vào bức tranh lớn: Vai trò của team Content Ecom tác động thế nào đến trải nghiệm khách hàng, uy tín thương hiệu Long Châu, và việc hỗ trợ ra quyết định mua hàng. Nhấn mạnh giá trị "Nội dung y tế chuẩn xác" và "Trải nghiệm mua sắm mượt mà".
6. Phân tích phải có chiều sâu: so sánh, tìm nguyên nhân, đưa ra insight mà người nhìn data thường bỏ qua.
7. Nếu dữ liệu có mục "Nội dung comment khách hàng" hoặc "Thông tin bổ sung do người phụ trách cung cấp", đây là thông tin định tính quý giá — PHẢI đọc kỹ và khai thác thực chất (trích ý cụ thể, gọi tên chủ đề lặp lại) thay vì chỉ nhắc qua loa hay bỏ qua để chỉ bám vào số liệu.`;

const PROMPTS: Record<AIBlockType, string> = {
  insights: `Dựa trên dữ liệu báo cáo bên dưới, hãy viết phần "Nhận xét tổng quan" cho báo cáo kỳ này.

Yêu cầu:
- Trình bày dưới dạng văn xuôi (2-3 đoạn văn dài). Không dùng bất kỳ ký tự đặc biệt hay markdown nào.
- Nêu bật thành tựu, xu hướng so với kỳ trước, sự đóng góp nổi bật của các cá nhân/team.
- ĐẶC BIỆT: Gắn kết thành tựu với tầm nhìn dài hạn và vai trò cốt lõi của team Content Ecom (định hình trải nghiệm y tế số, tạo niềm tin cho khách hàng).
- Trích dẫn số liệu một cách tự nhiên vào câu văn.

Chỉ trả về nội dung nhận xét, không cần tiêu đề.`,

  bottleneck: `Dựa trên dữ liệu báo cáo bên dưới, hãy phân tích và chỉ ra các "Điểm nghẽn & Khó khăn" của kỳ này.

Yêu cầu:
- Trình bày dưới dạng văn xuôi mạch lạc (2-3 đoạn văn dài). Không dùng bất kỳ ký tự đặc biệt hay markdown nào.
- Phân tích sâu 1-2 điểm nghẽn cốt lõi (dự án chậm tiến độ, chất lượng giảm sút, mất cân đối nhân lực...). Nêu rõ bằng chứng từ data.
- Nhìn nhận điểm nghẽn này dưới góc độ chiến lược: Nó cản trở mục tiêu chung của Ecom như thế nào?
- Đề xuất hướng khắc phục cụ thể.

Chỉ trả về nội dung phân tích, không cần tiêu đề.`,

  recommendation: `Dựa trên dữ liệu báo cáo bên dưới, hãy viết phần "Mở rộng & Đề xuất" mang tính định hướng.

Yêu cầu:
- Trình bày dưới dạng văn xuôi truyền cảm hứng. Không dùng bất kỳ ký tự đặc biệt hay markdown nào.
- Đưa ra 2-3 chiến lược/đề xuất nhằm nâng tầm vai trò của team (ví dụ: tối ưu quy trình, ứng dụng AI, mở rộng độ phủ nội dung chất lượng cao).
- Giải thích tại sao đề xuất này lại quan trọng đối với sự phát triển của chuỗi Long Châu.

Chỉ trả về nội dung đề xuất, không cần tiêu đề.`,

  customerCommentAnalysis: `Dựa trên dữ liệu báo cáo bên dưới, hãy viết phần "Phân tích Comment khách hàng" đào sâu vào phần "Nội dung comment khách hàng (dữ liệu thô)" và "Thông tin bổ sung" nếu có.

Yêu cầu:
- Trình bày dưới dạng văn xuôi mạch lạc (2-4 đoạn văn). Không dùng bất kỳ ký tự đặc biệt hay markdown nào (không gạch đầu dòng, không in đậm, không emoji).
- Đọc kỹ toàn bộ nội dung comment thô được cung cấp (nếu phần dữ liệu ghi rõ đây là "mẫu" do số lượng lớn, hãy suy rộng nhận định cho cả tổng số dòng đã nêu, đừng chỉ nói về vài dòng lấy mẫu), tự nhóm chúng thành các chủ đề/xu hướng lặp lại (ví dụ: tốc độ duyệt bài, độ chính xác y khoa, văn phong, hình ảnh, trải nghiệm phối hợp...). Nêu rõ chủ đề nào xuất hiện nhiều nhất, ước lượng tỉ lệ tương đối nếu có thể.
- Trích dẫn nguyên văn hoặc gần nguyên văn 2-3 comment tiêu biểu (đặt trong ngoặc kép) để minh hoạ cho cả điểm khen và điểm cần cải thiện.
- Đối chiếu với số liệu định lượng (tổng lượt đánh giá, điểm trung bình, % tích cực/tiêu cực) để cho thấy bức tranh định tính có khớp với con số hay không, và nếu có Thông tin bổ sung do người phụ trách cung cấp thì phải lồng ghép vào phân tích.
- Kết thúc bằng 1-2 đề xuất hành động cụ thể để cải thiện trải nghiệm/phản hồi từ khách hàng trong kỳ tới.
- Nếu không có dữ liệu comment thô nào được cung cấp, hãy nói rõ điều này và chỉ phân tích dựa trên số liệu tổng hợp (% tích cực/tiêu cực, tổng lượt đánh giá) cùng Thông tin bổ sung nếu có, đồng thời gợi ý nên thu thập thêm dữ liệu comment chi tiết cho kỳ sau.

Chỉ trả về nội dung phân tích, không cần tiêu đề.`,

  nextPlan: `Dựa trên dữ liệu báo cáo kỳ này bên dưới, hãy gợi ý "Kế hoạch triển khai kỳ tới".

Trả về kết quả bằng cách sử dụng đúng các thẻ XML sau (bên trong mỗi thẻ CHỈ viết một đoạn văn xuôi duy nhất, TUYỆT ĐỐI không dùng gạch đầu dòng, dấu sao hay emoji):

<general>Định hướng chung cho kỳ tới gắn với tầm nhìn team</general>
<goals>Mục tiêu nội dung cụ thể (trích dẫn target số liệu)</goals>
<topics>Chủ đề Focus nên tập trung chiến lược</topics>
<team>Kế hoạch phát triển và nâng tầm đội ngũ</team>
<team_baiviet>Công việc cốt lõi cho Team Bài viết</team_baiviet>
<team_sanpham>Công việc cốt lõi cho Team Sản phẩm</team_sanpham>
<team_multimedia>Công việc cốt lõi cho Team Multimedia</team_multimedia>

Quy tắc:
- BẮT BUỘC sử dụng đúng tên thẻ mở và đóng như mẫu.
- KHÔNG sử dụng JSON, chỉ dùng định dạng thẻ XML.`,

  fullReport: `Dựa trên dữ liệu báo cáo bên dưới, hãy sinh toàn bộ nội dung phân tích cho báo cáo kỳ này.

Trả về kết quả bằng cách sử dụng đúng các thẻ XML sau:

<insights>Nhận xét tổng quan (viết 1 đoạn văn xuôi dài, lồng ghép số liệu và tầm nhìn team)</insights>
<bottleneck>Điểm nghẽn & Khó khăn (viết 1 đoạn văn xuôi dài, có bằng chứng data)</bottleneck>
<recommendation>Mở rộng & Đề xuất (viết 1 đoạn văn xuôi dài mang tính định hướng chiến lược)</recommendation>
<customerCommentAnalysis>Phân tích Comment khách hàng: đọc kỹ mục "Nội dung comment khách hàng (dữ liệu thô)" và "Thông tin bổ sung" nếu có, nhóm chủ đề lặp lại, trích dẫn 2-3 comment tiêu biểu trong ngoặc kép, đối chiếu với số liệu % tích cực/tiêu cực, và đề xuất hành động cải thiện. Nếu không có comment thô, nói rõ và chỉ dựa vào số liệu tổng hợp.</customerCommentAnalysis>
<nextPlan>
  <general>Định hướng chung (2-3 bullets)</general>
  <goals>Mục tiêu nội dung (2-3 bullets với target số)</goals>
  <topics>Chủ đề Focus (2-3 chủ đề cụ thể)</topics>
  <team>Phát triển đội ngũ</team>
  <team_baiviet>Công việc Team Bài viết</team_baiviet>
  <team_sanpham>Công việc Team Sản phẩm</team_sanpham>
  <team_multimedia>Công việc Team Multimedia</team_multimedia>
</nextPlan>

Quy tắc:
- BẮT BUỘC viết dưới dạng ĐOẠN VĂN XUÔI (plaintext) hoàn toàn.
- TUYỆT ĐỐI KHÔNG dùng bất kỳ ký tự đặc biệt nào: KHÔNG in đậm (**), KHÔNG gạch đầu dòng (-), KHÔNG emoji.
- PHẢI trích dẫn số liệu cụ thể tự nhiên vào câu.
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

export async function generateCustomerCommentAnalysis(context: ReportContext): Promise<string> {
  return generateBlock('customerCommentAnalysis', context);
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
    customerCommentAnalysis: extractTag(raw, 'customerCommentAnalysis'),
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
