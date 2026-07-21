import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useAppStore } from '@/shared/store/appStore';
import {
  CalendarRange, Calendar, TrendingUp, TrendingDown, Minus,
  FileText, BarChart3, Target,
  ChevronLeft, ChevronRight, Presentation, FileDown,
  ArrowRight, Hash, Edit3, Save, ShieldCheck,
  Eye, EyeOff, LayoutTemplate, ExternalLink, Package, Settings, KeyRound, PieChart,
  Bot, Sparkles, AlertTriangle, Send, Loader2, X, Compass, MessageSquare, CheckCircle, Activity, Image, Upload, Share2
, Download, Trash2 } from 'lucide-react';
import {
  generateFullReport, generateInsights, generateBottleneck,
  generateRecommendation, generateNextPlan, generateCustomerCommentAnalysis,
  chatWithAI, getStoredModel, setStoredModel,
  type ReportContext, type AIGeneratedReport, type ChatMessage
} from '@/shared/services/aiService';
import { readTabularFile, detectFreeTextColumn } from '@/shared/utils/csvImport';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, RadialLinearScale, Filler,
  Tooltip, Legend,
} from 'chart.js';
import { Line, Doughnut, Bar, Radar, Pie } from 'react-chartjs-2';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import toast from 'react-hot-toast';

// Register Chart.js components
ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, RadialLinearScale, Filler,
  Tooltip, Legend,
);

/* ─────────────────────────────────── constants ── */

const TEAM_COLORS: Record<string, string> = {
  'Bài viết': '#6366f1',
  'Sản phẩm': '#8b5cf6',
  'Multimedia - Tin nhanh': '#f59e0b',
  'Khác': '#64748b',
};
const CHART_PALETTE = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6', '#f97316', '#84cc16'];

type ViewMode = 'month' | 'quarter';

/* ─────────────────────────────────── helpers ── */

function getMonthLabel(period: string): string {
  const [y, m] = period.split('-');
  return `Tháng ${parseInt(m)}/${y}`;
}

function getQuarterLabel(quarter: number, year: number): string {
  return `Quý ${quarter}/${year}`;
}

function getQuarterMonths(quarter: number, year: number): string[] {
  const startMonth = (quarter - 1) * 3 + 1;
  return [0, 1, 2].map(i => {
    const m = startMonth + i;
    return `${year}-${String(m).padStart(2, '0')}`;
  });
}

function getPrevPeriod(mode: ViewMode, period: string, quarter: number, year: number): { period?: string; quarter?: number; year?: number } {
  if (mode === 'month') {
    const d = new Date(period + '-01');
    d.setMonth(d.getMonth() - 1);
    return { period: d.toISOString().slice(0, 7) };
  }
  if (quarter === 1) return { quarter: 4, year: year - 1 };
  return { quarter: quarter - 1, year };
}

function pct(a: number, b: number): number {
  if (b === 0) return a > 0 ? 100 : 0;
  return Math.round(((a - b) / b) * 100);
}

function DeltaBadge({ value }: { value: number }) {
  const normalizedVal = value + 0;
  if (normalizedVal === 0 || isNaN(normalizedVal)) return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', background: '#f1f5f9', borderRadius: '999px', padding: '2px 8px' }}>
      <Minus size={10} /> 0%
    </span>
  );
  const up = normalizedVal > 0;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.72rem', fontWeight: 700,
      color: up ? '#16a34a' : '#dc2626',
      background: up ? '#dcfce7' : '#fee2e2',
      borderRadius: '999px', padding: '2px 8px' }}>
      {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {up ? '+' : ''}{normalizedVal}%
    </span>
  );
}

/* ═════════════════════════════════════════════════════ MAIN ═════ */

export default function MonthlyQuarterlyReportPage({ isShareMode = false }: { isShareMode?: boolean }) {
  const { currentUser, submissions, projects, projectTasks, monthlyReports, updateMonthlyReport } = useAppStore();
  const reportRef = useRef<HTMLDivElement>(null);

  const [searchParams] = useSearchParams();
  const isPublicShare = isShareMode || searchParams.get('share') === 'true';

  const isManager = currentUser?.role === 'Manager';

  /* ── state ── */
  const now = new Date();
  const [mode, setMode] = useState<ViewMode>('month');
  const [selectedMonth, setSelectedMonth] = useState(() => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [selectedQuarter, setSelectedQuarter] = useState(() => Math.ceil((now.getMonth() + 1) / 3));
  const [selectedYear, setSelectedYear] = useState(() => now.getFullYear());

  useEffect(() => {
    const periodParam = searchParams.get('period');
    if (periodParam) {
      const monthMatch = periodParam.match(/Tháng\s+(\d{1,2})\/(\d{4})/i);
      if (monthMatch) {
        setMode('month');
        const m = String(monthMatch[1]).padStart(2, '0');
        setSelectedMonth(`${monthMatch[2]}-${m}`);
      } else {
        const quarterMatch = periodParam.match(/Quý\s+(\d)\/(\d{4})/i);
        if (quarterMatch) {
          setMode('quarter');
          setSelectedQuarter(parseInt(quarterMatch[1], 10));
          setSelectedYear(parseInt(quarterMatch[2], 10));
        }
      }
    }
  }, [searchParams]);

  const [siteFilter, setSiteFilter] = useState<'all' | 's_nhathuoc' | 's_tiemchung'>('all');
  
  // Executive summary states
  const [summaryText, setSummaryText] = useState('Tháng này đội hoàn thành xuất sắc mục tiêu, đặc biệt ở nhóm Tiêm chủng nhờ campaign mùa hè. Đã ứng dụng AI vào 133 bài viết giúp giảm 40% thời gian. Cần lãnh đạo quyết định sớm ngân sách mở rộng pilot hệ thống quản trị.');
  const [recommendationText, setRecommendationText] = useState('Volume dự kiến tháng tới x1.5 khi vào cao điểm. Hệ thống hiện đáp ứng x1.2. Đề nghị lãnh đạo duyệt bổ sung +1 nhân sự QC hoặc mở rộng tự động hóa lớp 2.');
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [bottleneckText, setBottleneckText] = useState('Khâu duyệt nội dung y khoa của team nhà thuốc đang chậm 1-2 ngày so với dự kiến. Cần có quy trình duyệt nhanh hơn cho các dạng tin ngắn.');
  const [isEditingBottleneck, setIsEditingBottleneck] = useState(false);
  const [isEditingRec, setIsEditingRec] = useState(false);
  const [selectedFocusProjects, setSelectedFocusProjects] = useState<string[]>([]);

  // Customer comment analysis + extra AI context
  const [additionalContextText, setAdditionalContextText] = useState('');
  const [customerCommentsRawText, setCustomerCommentsRawText] = useState('');
  const [customerCommentAnalysisText, setCustomerCommentAnalysisText] = useState('');
  const [hotspotComments, setHotspotComments] = useState<string[]>([]);
  const [improvementComments, setImprovementComments] = useState<string[]>([]);
  const [isEditingCustomerComments, setIsEditingCustomerComments] = useState(false);
  const [commentImportInfo, setCommentImportInfo] = useState<{ fileName: string; totalRows: number; columnUsed: string } | null>(null);
  const [isImportingComments, setIsImportingComments] = useState(false);
  const commentFileInputRef = useRef<HTMLInputElement | null>(null);

  // AI states
  const [aiModel, setAiModel] = useState(() => getStoredModel());
  const [showAISettings, setShowAISettings] = useState(false);
  const [aiLoading, setAiLoading] = useState<string | null>(null); // block being loaded, or 'full'
  const [showAIReview, setShowAIReview] = useState(false);
  const [aiReviewData, setAiReviewData] = useState<AIGeneratedReport | null>(null);
  const [showAIChat, setShowAIChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Visibility toggle
  const [visibleBlocks, setVisibleBlocks] = useState({
    summary: true,
    productivity: true,
    quality: true,
    customerComments: true,
    topics: true,
    teamTasks: true,
    teamAndProject: true,
    bottleneck: true,
    recommendation: true,
    nextPlan: true,
  });
  const [showBlockSettings, setShowBlockSettings] = useState(false);

  // Editable Metrics & Drill-down
  const [metricOverrides, setMetricOverrides] = useState<Record<string, string>>({});
  const [isEditingMetrics, setIsEditingMetrics] = useState(false);
  const [drillDownData, setDrillDownData] = useState<{ title: string; subs: typeof submissions } | null>(null);

  const displayVal = (key: string, computed: number | string) => {
    return metricOverrides[key] !== undefined ? metricOverrides[key] : computed;
  };
  const setOverride = (key: string, val: string) => setMetricOverrides(p => ({ ...p, [key]: val }));

  /* ── period helpers ── */
  const currentMonths = useMemo(() => {
    if (mode === 'month') return [selectedMonth];
    return getQuarterMonths(selectedQuarter, selectedYear);
  }, [mode, selectedMonth, selectedQuarter, selectedYear]);

  const prevMonths = useMemo(() => {
    const prev = getPrevPeriod(mode, selectedMonth, selectedQuarter, selectedYear);
    if (mode === 'month' && prev.period) return [prev.period];
    if (prev.quarter && prev.year) return getQuarterMonths(prev.quarter, prev.year);
    return [];
  }, [mode, selectedMonth, selectedQuarter, selectedYear]);

  const periodLabel = mode === 'month' ? getMonthLabel(selectedMonth) : getQuarterLabel(selectedQuarter, selectedYear);

  /* ── load/save config ── */
  const reportId = `report_config_${periodLabel}`;
  
  useEffect(() => {
    try {
      const saved = monthlyReports.find(r => r.id === reportId);
      if (saved) {
        if (saved.summaryText) setSummaryText(saved.summaryText);
        if (saved.recommendationText) setRecommendationText(saved.recommendationText);
        if (saved.bottleneckText) setBottleneckText(saved.bottleneckText);
        if (saved.metricOverrides) setMetricOverrides(saved.metricOverrides);
        if (saved.selectedFocusProjects) setSelectedFocusProjects(saved.selectedFocusProjects);
        if (saved.customerCommentAnalysisText) setCustomerCommentAnalysisText(saved.customerCommentAnalysisText);
        if (saved.additionalContextText) setAdditionalContextText(saved.additionalContextText);
        if (saved.hotspotComments) setHotspotComments(saved.hotspotComments);
        else setHotspotComments([]);
        if (saved.improvementComments) setImprovementComments(saved.improvementComments);
        else setImprovementComments([]);
      } else {
        setSummaryText('');
        setRecommendationText('');
        setBottleneckText('');
        setMetricOverrides({});
        setSelectedFocusProjects([]);
        setCustomerCommentAnalysisText('');
        setAdditionalContextText('');
        setHotspotComments([]);
        setImprovementComments([]);
      }
    } catch (e) {
      console.error(e);
    }
  }, [reportId, monthlyReports]);

  const isMounted = useRef(false);
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    handleSaveConfig(false); // auto-save silently
  }, [summaryText, recommendationText, bottleneckText, metricOverrides, selectedFocusProjects, customerCommentAnalysisText, additionalContextText, reportId, hotspotComments, improvementComments]);

  const handleSaveConfig = (showToast?: boolean | any) => {
    const shouldToast = showToast === true;
    const config = {
      id: reportId,
      summaryText, recommendationText, bottleneckText, metricOverrides, selectedFocusProjects,
      customerCommentAnalysisText, additionalContextText,
      hotspotComments,
      improvementComments,
      updatedAt: new Date().toISOString(),
    };
    updateMonthlyReport(config);
    if (shouldToast) {
      toast.success('Đã lưu cấu hình báo cáo cho kỳ này!');
    }
  };

  /** Export điểm nóng ra CSV */
  const handleExportHotspots = () => {
    if (hotspotComments.length === 0) return;
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + "Comment Điểm Nóng (cần xử lý khẩn)\n" + hotspotComments.map(c => `"${c.replace(/"/g, '""')}"`).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `diem-nong-${periodLabel.replace(/\s+/g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /** Export cần cải thiện ra CSV */
  const handleExportImprovements = () => {
    if (improvementComments.length === 0) return;
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + "Comment Cần Cải Thiện (cơ hội tối ưu)\n" + improvementComments.map(c => `"${c.replace(/"/g, '""')}"`).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `can-cai-thien-${periodLabel.replace(/\s+/g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClearHotspots = () => {
    setHotspotComments([]);
    toast.success('Đã xóa danh sách điểm nóng!');
  };

  const handleClearImprovements = () => {
    setImprovementComments([]);
    toast.success('Đã xóa danh sách cần cải thiện!');
  };

  const handleImportCommentsFile = async (file: File) => {
    setIsImportingComments(true);
    try {
      const grid = await readTabularFile(file);
      if (grid.length < 1) { toast.error('File không có dữ liệu'); return; }

      const hasHeader = grid.length > 1;
      const detected = detectFreeTextColumn(grid, [
        'nhận xét', 'nhan xet', 'comment', 'feedback', 'phản hồi', 'phan hoi',
        'ghi chú', 'ghi chu', 'note', 'nội dung', 'noi dung', 'đánh giá của khách', 'khách hàng',
      ]);
      if (!detected) {
        toast.error('Không tìm được cột chứa nội dung comment trong file. Hãy đảm bảo file có 1 cột văn bản tự do (VD: "Nhận xét khách hàng").');
        return;
      }

      const dataRows = hasHeader ? grid.slice(1) : grid;
      const values = dataRows
        .map(r => (r[detected.colIndex] ?? '').toString().trim())
        .filter(v => v.length > 0);

      if (values.length === 0) {
        toast.error(`Cột "${detected.colName}" không có dữ liệu.`);
        return;
      }

      setCustomerCommentsRawText(values.join('\n'));
      setCommentImportInfo({ fileName: file.name, totalRows: values.length, columnUsed: detected.colName });
      toast.success(`Đã import ${values.length.toLocaleString('vi-VN')} dòng comment từ cột "${detected.colName}".`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lỗi đọc file');
    } finally {
      setIsImportingComments(false);
      if (commentFileInputRef.current) commentFileInputRef.current.value = '';
    }
  };

  /* ── filter submissions by period ── */
  const filterByMonths = useCallback((months: string[]) => {
    return submissions.filter(s => {
      if (s.employeeName === 'manntm3') return false; // Loại bỏ tài khoản Manager
      const d = new Date(s.submittedAt);
      if (isNaN(d.getTime())) return false;
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return months.includes(ym);
    });
  }, [submissions]);

  const currentSubs = useMemo(() => filterByMonths(currentMonths), [filterByMonths, currentMonths]);
  const prevSubs = useMemo(() => filterByMonths(prevMonths), [filterByMonths, prevMonths]);

  /* ── local filtered subs for productivity block ── */
  const prodSubs = useMemo(() => currentSubs.filter(s => siteFilter === 'all' || s.siteId === siteFilter), [currentSubs, siteFilter]);
  const prevProdSubs = useMemo(() => prevSubs.filter(s => siteFilter === 'all' || s.siteId === siteFilter), [prevSubs, siteFilter]);

  /* ── aggregate data (productivity) ── */
  
  // Categorize by exact match in taskType (which maps to config category)
  const categorizeSubmission = useCallback((s: typeof prodSubs[0]) => {
    const t = s.taskType || '';
    
    if (t === 'Bài Góc sức khỏe - Bệnh lý - Thành phần') return 'baiMoi';
    if (t === 'Sản phẩm') return 'sku';
    if (t === 'Multimedia' || t === 'Tin nhanh') return 'multimedia';
    if (t === 'Tối ưu Sản phẩm - Bài viết') return 'toiUu';
    
    // Fallback
    const tl = t.toLowerCase();
    if (tl.includes('bài góc sức khỏe') || (tl.includes('bài viết') && !tl.includes('tối ưu'))) return 'baiMoi';
    if (tl.includes('sản phẩm') && !tl.includes('tối ưu')) return 'sku';
    if (tl.includes('multimedia') || tl.includes('tin nhanh')) return 'multimedia';
    if (tl.includes('tối ưu')) return 'toiUu';
    
    return 'khac';
  }, []);

  const stats = useMemo(() => {
    const getQty = (s: typeof prodSubs[0]) => s.links?.length || 0;

    const baiMoi = prodSubs.filter(s => categorizeSubmission(s) === 'baiMoi').reduce((sum, s) => sum + getQty(s), 0);
    const sku = prodSubs.filter(s => categorizeSubmission(s) === 'sku').reduce((sum, s) => sum + getQty(s), 0);
    const multimedia = prodSubs.filter(s => categorizeSubmission(s) === 'multimedia').reduce((sum, s) => sum + getQty(s), 0);
    const toiUu = prodSubs.filter(s => categorizeSubmission(s) === 'toiUu').reduce((sum, s) => sum + getQty(s), 0);
    
    const toiUu_SP = prodSubs.filter(s => {
      if (categorizeSubmission(s) !== 'toiUu') return false;
      const detail = (s.taskDetail || '').toLowerCase();
      return detail.includes('sản phẩm') || detail.includes('product') || detail.includes('sku');
    }).reduce((sum, s) => sum + getQty(s), 0);
    
    const toiUu_BV = prodSubs.filter(s => {
      if (categorizeSubmission(s) !== 'toiUu') return false;
      const detail = (s.taskDetail || '').toLowerCase();
      return detail.includes('bài viết') || detail.includes('faq') || detail.includes('article') || detail.includes('trực ban');
    }).reduce((sum, s) => sum + getQty(s), 0);

    const totalLinks = prodSubs.reduce((s, x) => s + getQty(x), 0);
    const totalPoints = prodSubs.reduce((s, x) => s + x.totalPoints, 0);
    const totalSubmits = prodSubs.length;
    const employees = new Set(prodSubs.map(s => s.employeeName));
    const avgPointsPerEmp = employees.size > 0 ? totalPoints / employees.size : 0;

    const prevLinks = prevProdSubs.reduce((s, x) => s + getQty(x), 0);
    const prevPoints = prevProdSubs.reduce((s, x) => s + x.totalPoints, 0);
    const prevSubmits = prevProdSubs.length;

    // Site breakdowns for subtitles
    const getSiteLinks = (kind: string, siteId: string) => prodSubs.filter(s => categorizeSubmission(s) === kind && s.siteId === siteId).reduce((sum, s) => sum + getQty(s), 0);

    return {
      totalLinks, totalPoints, totalSubmits,
      baiMoi, sku, multimedia, toiUu, toiUu_SP, toiUu_BV,
      baiMoi_NT: getSiteLinks('baiMoi', 's_nhathuoc'), baiMoi_TC: getSiteLinks('baiMoi', 's_tiemchung'),
      sku_NT: getSiteLinks('sku', 's_nhathuoc'), sku_TC: getSiteLinks('sku', 's_tiemchung'),
      mm_NT: getSiteLinks('multimedia', 's_nhathuoc'), mm_TC: getSiteLinks('multimedia', 's_tiemchung'),
      toiUu_NT: getSiteLinks('toiUu', 's_nhathuoc'), toiUu_TC: getSiteLinks('toiUu', 's_tiemchung'),
      employeeCount: employees.size, avgPointsPerEmp,
      deltaLinks: pct(totalLinks, prevLinks),
      deltaPoints: pct(totalPoints, prevPoints),
      deltaSubmits: pct(totalSubmits, prevSubmits),
    };
  }, [prodSubs, prevProdSubs]);

  /* ── quality & compliance ── */
  const qualityStats = useMemo(() => {
    const withQc = currentSubs.filter(s => s.qualityCheck != null);
    const qcScores = withQc.map(s => s.qualityCheck!.score);
    
    const totalReviews = withQc.length;
    
    // avg /5 (score is 1-5, native scale)
    const avgScore = totalReviews > 0 ? (qcScores.reduce((a, b) => a + b, 0) / totalReviews) : 0;

    const comments = withQc.filter(s => s.qualityCheck!.note && s.qualityCheck!.note.trim().length > 0);
    const totalComments = comments.length;

    let positiveCount = 0;
    let negativeCount = 0;

    comments.forEach(s => {
      const note = s.qualityCheck!.note!.toLowerCase();
      // Positive words
      if (/(tốt|ok|duyệt|hay|xuất sắc|đạt)/i.test(note)) {
        positiveCount++;
      }
      // Negative words
      else if (/(lỗi|sai|chậm|thiếu|chưa đạt|vi phạm|sửa|cảnh báo|chặn)/i.test(note)) {
        negativeCount++;
      }
    });

    const pctPositive = totalComments > 0 ? Math.round((positiveCount / totalComments) * 100) : 0;
    const pctNegative = totalComments > 0 ? Math.round((negativeCount / totalComments) * 100) : 0;

    const hasQualityData = totalReviews > 0;
    return { avgScore, totalReviews, totalComments, pctPositive, pctNegative, hasQualityData };
  }, [currentSubs]);

  /* ── tasks breakdown ── */
  const tasksBreakdown = useMemo(() => {
    const map = new Map<string, Map<string, { links: number; points: number }>>();
    currentSubs.forEach(s => {
      const type = s.taskType || 'Khác';
      const detail = s.taskDetail || s.taskType || 'Khác';
      if (!map.has(type)) map.set(type, new Map());
      const typeMap = map.get(type)!;
      const prev = typeMap.get(detail) || { links: 0, points: 0 };
      typeMap.set(detail, { links: prev.links + s.links.length, points: prev.points + s.totalPoints });
    });
    return Array.from(map.entries()).map(([type, details]) => ({
      type,
      details: Array.from(details.entries())
        .map(([name, data]) => ({ name, links: data.links, points: data.points }))
        .sort((a, b) => b.points - a.points)
    })).sort((a, b) => a.type.localeCompare(b.type));
  }, [currentSubs]);

  /* ── weekly trend data (using prodSubs for filtering) ── */
  const weeklyTrend = useMemo(() => {
    // Group submissions by ISO week
    const weekMap = new Map<string, { nt: number; tc: number; label: string }>();
    prodSubs.forEach(s => {
      const d = new Date(s.submittedAt);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.getFullYear(), d.getMonth(), diff);
      const key = monday.toISOString().slice(0, 10);
      const end = new Date(monday); end.setDate(monday.getDate() + 6);
      const label = `${monday.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} — ${end.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;
      const prev = weekMap.get(key) || { nt: 0, tc: 0, label };
      if (s.siteId === 's_tiemchung') prev.tc += s.links.length;
      else prev.nt += s.links.length; // defaults to nt or others
      weekMap.set(key, prev);
    });
    return Array.from(weekMap.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [prodSubs]);

  /* ── team breakdown ── */
  const teamBreakdown = useMemo(() => {
    const map = new Map<string, { links: number; points: number }>();
    currentSubs.forEach(s => {
      const team = s.teamGroup || 'Khác';
      const prev = map.get(team) || { links: 0, points: 0 };
      map.set(team, { links: prev.links + s.links.length, points: prev.points + s.totalPoints });
    });
    return Array.from(map.entries()).sort((a, b) => b[1].points - a[1].points);
  }, [currentSubs]);

  /* ── top employees with QC ── */
  const topEmployees = useMemo(() => {
    const map = new Map<string, { links: number; points: number; qcSum: number; qcCount: number }>();
    currentSubs.forEach(s => {
      const prev = map.get(s.employeeName) || { links: 0, points: 0, qcSum: 0, qcCount: 0 };
      if (s.qualityCheck) {
        prev.qcSum += s.qualityCheck.score * 2;
        prev.qcCount += 1;
      }
      map.set(s.employeeName, { 
        links: prev.links + s.links.length, 
        points: prev.points + s.totalPoints,
        qcSum: prev.qcSum, qcCount: prev.qcCount 
      });
    });
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, links: v.links, points: v.points, qcAvg: v.qcCount > 0 ? v.qcSum / v.qcCount : 0 }))
      .sort((a, b) => b.points - a.points).slice(0, 10);
  }, [currentSubs]);

  /* ── project progress ── */
  const projectProgress = useMemo(() => {
    const activeProjects = projects.filter(p => p.status === 'Đang chạy');
    return activeProjects.map(p => {
      const tasks = projectTasks.filter(t => t.projectId === p.id);
      const allSubs = submissions.filter(s => s.projectId === p.id);
      const periodSubs = currentSubs.filter(s => s.projectId === p.id);
      let totalDone = 0;
      let totalTarget = 0;

      const progress = tasks.map(t => {
        const mode = t.trackingMode || 'link';
        const matched = allSubs.filter(s => {
          if (s.projectTaskId === t.id) return true;
          if (s.projectTaskId) return false;
          if (t.taskType && s.taskType !== t.taskType) return false;
          if (t.taskDetail && s.taskDetail !== t.taskDetail) return false;
          return !!t.taskType || !!t.taskDetail;
        });
        
        if (mode === 'quantity' && t.targetQuantity && t.targetQuantity > 0) {
          const done = matched.reduce((sum, s) => sum + (s.quantity ?? 0), 0);
          totalDone += done;
          totalTarget += t.targetQuantity;
          return Math.min(100, Math.round((done / t.targetQuantity) * 100));
        }
        const done = matched.reduce((sum, s) => sum + s.links.length, 0);
        totalDone += done;
        totalTarget += t.targetLinks || 0;
        return Math.min(100, Math.round((done / Math.max(t.targetLinks, 1)) * 100));
      });
      const avgProgress = Math.round(progress.reduce((s, x) => s + x, 0) / progress.length);
      return { 
        name: p.name, 
        progress: avgProgress, 
        periodLinks: periodSubs.reduce((s, x) => s + x.links.length, 0), 
        totalTarget: totalTarget,
        totalDone: totalDone
      };
    }).sort((a, b) => Math.max(b.totalTarget, b.periodLinks) - Math.max(a.totalTarget, a.periodLinks));
  }, [projects, projectTasks, submissions, currentSubs]);

  /* ── radar: current vs prev ── */
  const radarData = useMemo(() => {
    const curLinks = currentSubs.reduce((s, x) => s + x.links.length, 0);
    const curPoints = currentSubs.reduce((s, x) => s + x.totalPoints, 0);
    const curSubmits = currentSubs.length;
    const curEmps = new Set(currentSubs.map(s => s.employeeName)).size;
    const curProjects = new Set(currentSubs.filter(s => s.projectId).map(s => s.projectId)).size;

    const prevLinks = prevSubs.reduce((s, x) => s + x.links.length, 0);
    const prevPoints = prevSubs.reduce((s, x) => s + x.totalPoints, 0);
    const prevSubmits = prevSubs.length;
    const prevEmps = new Set(prevSubs.map(s => s.employeeName)).size;
    const prevProjects = new Set(prevSubs.filter(s => s.projectId).map(s => s.projectId)).size;

    // Normalize to max = 100
    const maxVals = [
      Math.max(curLinks, prevLinks, 1),
      Math.max(curPoints, prevPoints, 1),
      Math.max(curSubmits, prevSubmits, 1),
      Math.max(curEmps, prevEmps, 1),
      Math.max(curProjects, prevProjects, 1),
    ];
    return {
      current: [curLinks / maxVals[0] * 100, curPoints / maxVals[1] * 100, curSubmits / maxVals[2] * 100, curEmps / maxVals[3] * 100, curProjects / maxVals[4] * 100],
      prev: [prevLinks / maxVals[0] * 100, prevPoints / maxVals[1] * 100, prevSubmits / maxVals[2] * 100, prevEmps / maxVals[3] * 100, prevProjects / maxVals[4] * 100],
    };
  }, [currentSubs, prevSubs]);

  /* ── top projects focus ── */
  const projectsFocus = useMemo(() => {
    const activeProjects = projects.filter(p => p.status === 'Đang chạy');
    
    let focusProjects = activeProjects;
    if (selectedFocusProjects.length > 0) {
      focusProjects = activeProjects.filter(p => selectedFocusProjects.includes(p.id));
    }

    const projData = focusProjects.map(p => {
      const pSubs = currentSubs.filter(s => s.projectId === p.id);
      return {
        id: p.id,
        name: p.name,
        type: p.type,
        links: pSubs.reduce((s, x) => s + ((x.quantity && x.quantity > 0) ? x.quantity : x.links.length), 0),
        points: pSubs.reduce((s, x) => s + x.totalPoints, 0),
      };
    }).sort((a, b) => b.links - a.links);

    if (selectedFocusProjects.length === 0) {
      return projData.slice(0, 5); // default to top 5
    }
    return projData;
  }, [currentSubs, projects, selectedFocusProjects]);

  /* ── heatmap: project × week matrix ── */
  const heatmapData = useMemo(() => {
    // Get all weeks in period
    const weekSet = new Map<string, string>(); // key -> label
    const projWeekMap = new Map<string, Map<string, number>>(); // projId -> (weekKey -> count)

    const topProjs = projectsFocus.slice(0, 6).map(p => p.id);

    currentSubs.forEach(s => {
      if (!s.projectId || !topProjs.includes(s.projectId)) return;

      const d = new Date(s.submittedAt);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.getFullYear(), d.getMonth(), diff);
      const weekKey = monday.toISOString().slice(0, 10);
      const end = new Date(monday); end.setDate(monday.getDate() + 6);
      const weekLabel = `${monday.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} — ${end.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;
      weekSet.set(weekKey, weekLabel);

      if (!projWeekMap.has(s.projectId)) projWeekMap.set(s.projectId, new Map());
      const wm = projWeekMap.get(s.projectId)!;
      wm.set(weekKey, (wm.get(weekKey) || 0) + ((s.quantity && s.quantity > 0) ? s.quantity : s.links.length));
    });

    const weeks = Array.from(weekSet.entries()).sort(([a], [b]) => a.localeCompare(b));
    const maxVal = Math.max(1, ...Array.from(projWeekMap.values()).flatMap(wm => Array.from(wm.values())));

    return {
      topics: topProjs.map(id => projectsFocus.find(p => p.id === id)?.name || id),
      weeks,
      matrix: topProjs.map(id => {
        const wm = projWeekMap.get(id) || new Map();
        return weeks.map(([wk]) => wm.get(wk) || 0);
      }),
      maxVal,
    };
  }, [currentSubs, projectsFocus]);

  /* ── auto insights ── */
  const autoInsights = useMemo(() => {
    const lines: string[] = [];
    lines.push(`📊 ${periodLabel}: ${stats.totalLinks} link, ${stats.totalPoints.toFixed(0)} điểm từ ${stats.employeeCount} nhân viên.`);
    
    const dL = stats.deltaLinks;
    const dP = stats.deltaPoints;
    if (dL > 0 && dP > 0) lines.push(`🌟 So với kỳ trước: Vùng phủ hoạt động đang mở rộng tích cực. Cả khối lượng công việc (+${dL}%) và điểm số (+${dP}%) đều đà tăng.`);
    else if (dL <= 0 && dP > 0) lines.push(`🌟 So với kỳ trước: Số lượng link giảm (${dL}%), nhưng điểm lại tăng (+${dP}%), team đang tập trung task khó, nhiều chất xám.`);
    else if (dL > 0 && dP <= 0) lines.push(`🌟 So với kỳ trước: Số lượng link tăng (+${dL}%), nhưng điểm lại giảm (${dP}%), team đang làm nhiều việc dễ, trọng số thấp.`);
    else if (dL < 0 && dP < 0) lines.push(`🌟 So với kỳ trước: Cả số lượng (${dL}%) và điểm số (${dP}%) đều sụt giảm. Cần rà soát lại nguyên nhân.`);
    else lines.push(`🌟 So với kỳ trước: Nhịp độ hoạt động đang được duy trì ổn định ngang bằng với kỳ trước.`);

    if (topEmployees.length > 0) {
      lines.push(`🏆 Top 3: ${topEmployees.slice(0, 3).map(e => `${e.name} (${e.points.toFixed(0)}đ)`).join(', ')}.`);
    }
    if (teamBreakdown.length > 0) {
      lines.push(`👥 Phân bổ: ${teamBreakdown.map(([t, v]) => `${t}: ${v.links} link`).join(' | ')}`);
    }
    if (projectsFocus.length > 0) {
      lines.push(`🔥 Dự án focus: ${projectsFocus.slice(0, 3).map(p => `${p.name}`).join(', ')}`);
    }
    const slowProjects = projectProgress.filter(p => p.progress < 30 && p.totalTarget > 0);
    if (slowProjects.length > 0) {
      lines.push(`⚠️ Dự án chậm tiến độ: ${slowProjects.map(p => `${p.name} (${p.progress}%)`).join(', ')}`);
    }
    return lines.join('\n');
  }, [periodLabel, stats, topEmployees, teamBreakdown, projectsFocus, projectProgress]);

  /* ── navigation helpers ── */
  const goNext = () => {
    if (mode === 'month') {
      const d = new Date(selectedMonth + '-01');
      d.setMonth(d.getMonth() + 1);
      setSelectedMonth(d.toISOString().slice(0, 7));
    } else {
      if (selectedQuarter === 4) { setSelectedQuarter(1); setSelectedYear(y => y + 1); }
      else setSelectedQuarter(q => q + 1);
    }
  };
  const goPrev = () => {
    if (mode === 'month') {
      const d = new Date(selectedMonth + '-01');
      d.setMonth(d.getMonth() - 1);
      setSelectedMonth(d.toISOString().slice(0, 7));
    } else {
      if (selectedQuarter === 1) { setSelectedQuarter(4); setSelectedYear(y => y - 1); }
      else setSelectedQuarter(q => q - 1);
    }
  };

  /* ── export handlers ── */
  const getOverriddenData = () => {
    const ovStats = { ...stats };
    if (metricOverrides['baiMoi']) ovStats.baiMoi = Number(metricOverrides['baiMoi']);
    if (metricOverrides['sku']) ovStats.sku = Number(metricOverrides['sku']);
    if (metricOverrides['multimedia']) ovStats.multimedia = Number(metricOverrides['multimedia']);
    if (metricOverrides['toiUu']) ovStats.toiUu = Number(metricOverrides['toiUu']);

    const ovQuality = { ...qualityStats };
    if (metricOverrides['qc_totalReviews']) ovQuality.totalReviews = Number(metricOverrides['qc_totalReviews']);
    if (metricOverrides['qc_avgScore']) ovQuality.avgScore = Number(metricOverrides['qc_avgScore']);
    if (metricOverrides['qc_totalComments']) ovQuality.totalComments = Number(metricOverrides['qc_totalComments']);
    if (metricOverrides['qc_pctPositive']) ovQuality.pctPositive = Number(metricOverrides['qc_pctPositive']);
    if (metricOverrides['qc_pctNegative']) ovQuality.pctNegative = Number(metricOverrides['qc_pctNegative']);

    const ovProjects = projectsFocus.map(p => ({
      name: p.name, type: p.type, links: Number(metricOverrides[`topic_links_${p.name}`] || p.links)
    }));

    const driveLink = metricOverrides['qc_driveLink'] || '';

    return { ovStats, ovQuality, ovProjects, driveLink };
  };

  const handleExportHTML = () => {
    const { ovStats, ovQuality, ovProjects, driveLink } = getOverriddenData();
    const nextPlan = visibleBlocks.nextPlan
      ? {
          general: metricOverrides['plan_general'] || 'Chưa cập nhật',
          goals: metricOverrides['plan_goals'] || 'Chưa cập nhật',
          topics: metricOverrides['plan_topics'] || 'Chưa cập nhật',
          team: metricOverrides['plan_team'] || 'Chưa cập nhật',
          team_baiviet: metricOverrides['plan_team_baiviet'] || 'Chưa cập nhật',
          team_sanpham: metricOverrides['plan_team_sanpham'] || 'Chưa cập nhật',
          team_multimedia: metricOverrides['plan_team_multimedia'] || 'Chưa cập nhật',
        }
      : undefined;

    const html = buildPeriodicReportHtml({
      title: `Báo cáo ${periodLabel}`,
      periodLabel,
      stats: ovStats, qualityStats: ovQuality,
      teamBreakdown, tasksBreakdown,
      topEmployees, projectProgress, projectsFocus: ovProjects,
      insights: autoInsights,
      bottleneck: bottleneckText,
      customerCommentAnalysis: visibleBlocks.customerComments ? customerCommentAnalysisText : undefined,
      driveLink,
      nextPlan,
    });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bao-cao-${mode === 'month' ? selectedMonth : `Q${selectedQuarter}-${selectedYear}`}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    toast.success('Đã export HTML!');
  };

  const handleExportPDF = async () => {
    // Dynamic import html2pdf.js
    const html2pdfModule = await import('html2pdf.js');
    const html2pdf = html2pdfModule.default;
    if (!reportRef.current) return;
    toast.loading('Đang tạo PDF...', { id: 'pdf' });
    try {
      await html2pdf().set({
        margin: [10, 10, 10, 10],
        filename: `bao-cao-${mode === 'month' ? selectedMonth : `Q${selectedQuarter}-${selectedYear}`}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }).from(reportRef.current).save();
      toast.success('Đã export PDF!', { id: 'pdf' });
    } catch {
      toast.error('Lỗi tạo PDF', { id: 'pdf' });
    }
  };

  const handleExportPPTX = () => {
    const { ovStats, ovQuality, ovProjects, driveLink } = getOverriddenData();
    const nextPlan = visibleBlocks.nextPlan
      ? {
          general: metricOverrides['plan_general'] || 'Chưa cập nhật',
          goals: metricOverrides['plan_goals'] || 'Chưa cập nhật',
          topics: metricOverrides['plan_topics'] || 'Chưa cập nhật',
          team: metricOverrides['plan_team'] || 'Chưa cập nhật',
          team_baiviet: metricOverrides['plan_team_baiviet'] || 'Chưa cập nhật',
          team_sanpham: metricOverrides['plan_team_sanpham'] || 'Chưa cập nhật',
          team_multimedia: metricOverrides['plan_team_multimedia'] || 'Chưa cập nhật',
        }
      : undefined;

    // Build a multi-slide HTML that mimics PPTX presentation style
    const html = buildPresentationHtml({
      title: `Báo cáo ${periodLabel}`,
      periodLabel,
      stats: ovStats, qualityStats: ovQuality,
      teamBreakdown, tasksBreakdown,
      topEmployees, projectProgress, projectsFocus: ovProjects,
      insights: autoInsights,
      bottleneck: bottleneckText,
      customerCommentAnalysis: visibleBlocks.customerComments ? customerCommentAnalysisText : undefined,
      driveLink,
      nextPlan,
    });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `presentation-${mode === 'month' ? selectedMonth : `Q${selectedQuarter}-${selectedYear}`}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    toast.success('Đã export Presentation HTML! Mở bằng trình duyệt → Ctrl+P để in slide.');
  };

  /* ── AI helpers ── */
  const buildReportContext = useCallback((): ReportContext => ({
    periodLabel,
    stats: {
      totalLinks: stats.totalLinks,
      totalPoints: stats.totalPoints,
      totalSubmits: stats.totalSubmits,
      baiMoi: stats.baiMoi,
      sku: stats.sku,
      multimedia: stats.multimedia,
      toiUu: stats.toiUu,
      employeeCount: stats.employeeCount,
      avgPointsPerEmp: stats.avgPointsPerEmp,
      deltaLinks: stats.deltaLinks,
      deltaPoints: stats.deltaPoints,
      deltaSubmits: stats.deltaSubmits,
    },
    teamBreakdown,
    topEmployees,
    qualityStats,
    projectProgress,
    projectsFocus,
    tasksBreakdown,
    customerCommentsRaw: customerCommentsRawText.trim() ? customerCommentsRawText.split('\n').map((l, i) => `[ID: ${i+1}] ${l}`).join('\n') : '',
    additionalContext: additionalContextText,
  }), [periodLabel, stats, teamBreakdown, topEmployees, qualityStats, projectProgress, projectsFocus, tasksBreakdown, customerCommentsRawText, additionalContextText]);

  const handleAIFullReport = async () => {
    setAiLoading('full');
    try {
      const result = await generateFullReport(buildReportContext());
      setAiReviewData(result);
      setShowAIReview(true);
      toast.success('AI đã phân tích xong!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lỗi không xác định');
    } finally {
      setAiLoading(null);
    }
  };

  const handleAIBlock = async (block: 'insights' | 'bottleneck' | 'recommendation' | 'nextPlan' | 'customerCommentAnalysis') => {
    setAiLoading(block);
    try {
      const ctx = buildReportContext();
      if (block === 'insights') {
        const result = await generateInsights(ctx);
        setSummaryText(result);
        toast.success('AI đã viết nhận xét!');
      } else if (block === 'bottleneck') {
        const result = await generateBottleneck(ctx);
        setBottleneckText(result);
        toast.success('AI đã phân tích điểm nghẽn!');
      } else if (block === 'recommendation') {
        const result = await generateRecommendation(ctx);
        setRecommendationText(result);
        toast.success('AI đã viết đề xuất!');
      } else if (block === 'customerCommentAnalysis') {
        const result = await generateCustomerCommentAnalysis(ctx);
        setCustomerCommentAnalysisText(result.text);
        const rawLines = customerCommentsRawText.split('\n');
        setHotspotComments(
          result.hotspotIds.map(id => rawLines[id - 1]?.trim()).filter(Boolean)
        );
        setImprovementComments(
          result.improvementIds.map(id => rawLines[id - 1]?.trim()).filter(Boolean)
        );
        toast.success('AI đã phân tích comment khách hàng!');
      } else if (block === 'nextPlan') {
        const result = await generateNextPlan(ctx);
        setOverride('plan_general', result.general);
        setOverride('plan_goals', result.goals);
        setOverride('plan_topics', result.topics);
        setOverride('plan_team', result.team);
        setOverride('plan_team_baiviet', result.team_baiviet);
        setOverride('plan_team_sanpham', result.team_sanpham);
        setOverride('plan_team_multimedia', result.team_multimedia);
        toast.success('AI đã gợi ý kế hoạch!');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lỗi không xác định');
    } finally {
      setAiLoading(null);
    }
  };

  const applyAIReview = () => {
    if (!aiReviewData) return;
    setSummaryText(aiReviewData.insights);
    setBottleneckText(aiReviewData.bottleneck);
    setRecommendationText(aiReviewData.recommendation);
    if (aiReviewData.customerCommentAnalysis) {
      setCustomerCommentAnalysisText(aiReviewData.customerCommentAnalysis.text);
      const rawLines = customerCommentsRawText.split('\n');
      setHotspotComments(
        (aiReviewData.customerCommentAnalysis.hotspotIds || []).map(id => rawLines[id - 1]?.trim()).filter(Boolean)
      );
      setImprovementComments(
        (aiReviewData.customerCommentAnalysis.improvementIds || []).map(id => rawLines[id - 1]?.trim()).filter(Boolean)
      );
    }
    if (aiReviewData.nextPlan) {
      setOverride('plan_general', aiReviewData.nextPlan.general);
      setOverride('plan_goals', aiReviewData.nextPlan.goals);
      setOverride('plan_topics', aiReviewData.nextPlan.topics);
      setOverride('plan_team', aiReviewData.nextPlan.team);
      setOverride('plan_team_baiviet', aiReviewData.nextPlan.team_baiviet);
      setOverride('plan_team_sanpham', aiReviewData.nextPlan.team_sanpham);
      setOverride('plan_team_multimedia', aiReviewData.nextPlan.team_multimedia);
    }
    setShowAIReview(false);
    toast.success('Đã áp dụng kết quả AI vào báo cáo!');
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: ChatMessage = { role: 'user', text: chatInput.trim() };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput('');
    setChatLoading(true);
    try {
      const reply = await chatWithAI(newMessages, buildReportContext());
      setChatMessages(prev => [...prev, { role: 'model', text: reply }]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lỗi chat');
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const AIBlockButton = ({ block, label }: { block: 'insights' | 'bottleneck' | 'recommendation' | 'nextPlan' | 'customerCommentAnalysis'; label?: string }) => {
    if (isPublicShare) return null;
    return (
      <button className="btn btn-ghost btn-icon" onClick={() => handleAIBlock(block)}
        disabled={aiLoading !== null} title={label || 'AI gợi ý'}
        style={{ color: '#10b981' }}>
        {aiLoading === block ? <Loader2 size={16} className="spin" /> : <Bot size={16} />}
      </button>
    );
  };

  /* ── chart configs (computed inside render to use theme) ── */
  const chartTextColor = 'var(--text-primary)';
  const chartGridColor = 'rgba(148,163,184,.15)';

  if (!isManager && !isPublicShare) {
    return (
      <div className="card" style={{ padding: '60px', textAlign: 'center', marginTop: '20px' }}>
        <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🔒</div>
        <h3 style={{ fontWeight: 700, marginBottom: '8px' }}>Không có quyền truy cập</h3>
        <p style={{ color: 'var(--text-tertiary)' }}>Chỉ Manager mới xem được báo cáo tháng/quý.</p>
      </div>
    );
  }

  /* ══════════════════════ RENDER ══════════════════════ */
  return (
    <div style={{ padding: isPublicShare ? '24px 32px' : 0, maxWidth: isPublicShare ? '1400px' : '100%', margin: isPublicShare ? '0 auto' : 0 }}>
      {isPublicShare && (
        <div style={{
          background: 'linear-gradient(90deg, #eff6ff 0%, #e0f2fe 100%)',
          border: '1px solid #bfdbfe',
          borderRadius: '12px',
          padding: '12px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#1e40af',
          fontWeight: 600,
          boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Eye size={20} color="#2563eb" />
            <span style={{ fontSize: '0.95rem' }}>BÁO CÁO CÔNG KHAI (CHỈ XEM) — <strong>{periodLabel}</strong></span>
          </div>
          <span style={{ fontSize: '0.8rem', background: '#dbeafe', color: '#1e3a8a', padding: '4px 12px', borderRadius: '20px', fontWeight: 700 }}>
            Read-Only
          </span>
        </div>
      )}

      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <span className="icon"><CalendarRange size={20} /></span>Báo cáo {mode === 'month' ? 'tháng' : 'quý'}
          </h2>
          <p className="page-subtitle">Tổng hợp tự động · Biểu đồ trực quan · Xuất HTML / PDF / Presentation</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {!isPublicShare && (
            <>
              <button className="btn" onClick={handleSaveConfig} style={{ background: '#3b82f6', color: '#fff', border: 'none', fontWeight: 700, boxShadow: '0 2px 8px rgba(59,130,246,.3)' }}>
                <Save size={14} /> Lưu thay đổi
              </button>
              <button className="btn" onClick={handleAIFullReport}
                disabled={aiLoading !== null}
                style={{ background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 'none', fontWeight: 700, boxShadow: '0 2px 8px rgba(16,185,129,.3)' }}>
                {aiLoading === 'full' ? <Loader2 size={14} className="spin" /> : <Bot size={14} />} ✨ Phân tích AI
              </button>
              <button className="btn btn-secondary" onClick={() => setShowAIChat(true)}
                style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '1px solid #86efac', color: '#15803d' }}>
                <MessageSquare size={14} /> Chat AI
              </button>
              <button className="btn btn-icon btn-ghost" onClick={() => setShowAISettings(true)} title="Cài đặt AI">
                <KeyRound size={14} />
              </button>
              <button className="btn btn-secondary" onClick={() => {
                const shareUrl = `${window.location.origin}/share/report?period=${encodeURIComponent(periodLabel)}`;
                navigator.clipboard.writeText(shareUrl);
                toast.success('Đã sao chép link báo cáo công khai vào clipboard!');
              }} title="Chia sẻ link báo cáo chỉ xem (không cần đăng nhập)"
                style={{ background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '1px solid #93c5fd', color: '#1d4ed8', fontWeight: 600 }}>
                <Share2 size={14} /> Chia sẻ link
              </button>
              <div style={{ width: '1px', background: 'var(--border-light)', margin: '0 4px' }} />
            </>
          )}
          <button className="btn btn-secondary" onClick={handleExportHTML} title="Export HTML">
            <FileText size={14} /> HTML
          </button>
          <button className="btn btn-secondary" onClick={handleExportPDF} title="Export PDF">
            <FileDown size={14} /> PDF
          </button>
          <button className="btn btn-secondary" onClick={handleExportPPTX} title="Export Presentation"
            style={{ background: 'linear-gradient(135deg,#faf5ff,#ede9fe)', border: '1px solid #c4b5fd', color: '#7c3aed' }}>
            <Presentation size={14} /> Slide
          </button>
        </div>
      </div>

      {/* ── Mode Toggle + Period Selector ── */}
      <div className="card" style={{ padding: '14px 20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        {isPublicShare ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.05rem', fontWeight: 800, color: '#1e3a8a', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '6px 16px', borderRadius: '8px' }}>
            <Calendar size={16} color="#2563eb" /> {periodLabel}
          </div>
        ) : (
          <>
            {/* mode tabs */}
            <div style={{ display: 'flex', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
              {(['month', 'quarter'] as ViewMode[]).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  style={{
                    padding: '6px 16px', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                    background: mode === m ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'var(--bg-primary)',
                    color: mode === m ? '#fff' : 'var(--text-secondary)',
                    transition: 'all .2s',
                  }}>
                  {m === 'month' ? '📅 Tháng' : '📊 Quý'}
                </button>
              ))}
            </div>

            {/* period navigation */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button className="btn btn-icon btn-ghost" onClick={goPrev}><ChevronLeft size={16} /></button>
              {mode === 'month' ? (
                <input type="month" className="form-input" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                  style={{ width: 'auto', fontSize: '0.88rem', fontWeight: 700 }} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <select className="form-input" value={selectedQuarter} onChange={e => setSelectedQuarter(Number(e.target.value))}
                    style={{ width: 'auto', fontSize: '0.88rem', fontWeight: 700 }}>
                    {[1, 2, 3, 4].map(q => <option key={q} value={q}>Quý {q}</option>)}
                  </select>
                  <select className="form-input" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
                    style={{ width: 'auto', fontSize: '0.88rem', fontWeight: 700 }}>
                    {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map(y =>
                      <option key={y} value={y}>{y}</option>
                    )}
                  </select>
                </div>
              )}
              <button className="btn btn-icon btn-ghost" onClick={goNext}><ChevronRight size={16} /></button>
            </div>
          </>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={14} color="var(--primary-500)" />
            <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
              Tự động tổng hợp từ {currentSubs.length} submissions
            </span>
          </div>
          {!isPublicShare && (
            <>
              <button className={`btn btn-secondary ${isEditingMetrics ? 'btn-active' : ''}`} 
                onClick={() => setIsEditingMetrics(!isEditingMetrics)}
                style={{ border: isEditingMetrics ? '1px solid #8b5cf6' : '', background: isEditingMetrics ? '#f5f3ff' : '', color: isEditingMetrics ? '#7c3aed' : '' }}>
                <Edit3 size={14} /> Chỉnh sửa số liệu
              </button>
              
              <button className="btn btn-secondary" onClick={() => setShowBlockSettings(!showBlockSettings)}>
                <LayoutTemplate size={14} /> Tuỳ chỉnh hiển thị
              </button>
            </>
          )}
        </div>
      </div>

      {showBlockSettings && (
        <div className="card" style={{ padding: '16px', marginBottom: '16px', background: '#f8fafc', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ width: '100%', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Hiển thị các khối báo cáo:</div>
          {Object.entries({
            summary: 'Tóm tắt điều hành',
            productivity: 'Năng suất & Tăng trưởng',
            quality: 'Chất lượng & Compliance',
            customerComments: 'Comment khách hàng',
            topics: 'Top chủ đề focus',
            teamAndProject: 'Phân bổ theo người & Dự án',
            bottleneck: 'Điểm nghẽn & Khó khăn',
            recommendation: 'Mở rộng & Đề xuất',
            nextPlan: 'Kế hoạch kỳ tới',
          }).map(([key, label]) => {
            const k = key as keyof typeof visibleBlocks;
            const active = visibleBlocks[k];
            return (
              <button key={k} onClick={() => setVisibleBlocks(p => ({ ...p, [k]: !p[k] }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '999px',
                  border: `1px solid ${active ? '#cbd5e1' : '#e2e8f0'}`, cursor: 'pointer',
                  background: active ? '#fff' : '#f1f5f9', color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  fontSize: '0.8rem', fontWeight: 600, transition: 'all .2s'
                }}>
                {active ? <Eye size={14} color="#3b82f6" /> : <EyeOff size={14} />} {label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Report Content (ref for PDF export) ── */}
      <div ref={reportRef}>

      {/* ── Block 1: Executive Summary ── */}
      {visibleBlocks.summary && (
      <div className="card" style={{ padding: '24px', marginBottom: '20px', background: 'linear-gradient(to right, #f5f3ff, #ede9fe)', border: '1px solid #ddd6fe' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ padding: '8px', background: '#8b5cf6', borderRadius: '50%', color: '#fff' }}><Sparkles size={16} /></div>
            <h3 style={{ fontWeight: 800, fontSize: '1.2rem', color: '#4c1d95', margin: 0 }}>Tóm tắt điều hành</h3>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <AIBlockButton block="insights" label="AI viết nhận xét" />
            {!isPublicShare && (
              <button className="btn btn-ghost btn-icon" onClick={() => setIsEditingSummary(!isEditingSummary)} style={{ color: '#6d28d9' }}>
                {isEditingSummary ? <Save size={18} /> : <Edit3 size={18} />}
              </button>
            )}
          </div>
        </div>
        {isEditingSummary && !isPublicShare ? (
          <textarea className="form-input" value={summaryText} onChange={e => setSummaryText(e.target.value)} rows={3} style={{ width: '100%', fontSize: '1rem', lineHeight: 1.6 }} />
        ) : (
          <div style={{ fontSize: '1rem', lineHeight: 1.7, color: '#312e81', fontWeight: 500 }}>
              <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{summaryText}</ReactMarkdown></div>
            </div>
        )}
      </div>
      )}

      {/* ── Block 2: Productivity & Growth ── */}
      {visibleBlocks.productivity && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, flex: 1 }}>Năng suất & Tăng trưởng</h3>
            {/* Local Filter */}
            <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: '999px', padding: '4px' }}>
              {(['all', 's_nhathuoc', 's_tiemchung'] as const).map(f => (
                <button key={f} onClick={() => setSiteFilter(f)}
                  style={{
                    padding: '6px 16px', borderRadius: '999px', border: 'none', cursor: 'pointer',
                    fontSize: '0.85rem', fontWeight: 600, transition: 'all .2s',
                    background: siteFilter === f ? '#f3e8ff' : 'transparent',
                    color: siteFilter === f ? '#7c3aed' : 'var(--text-secondary)',
                    boxShadow: siteFilter === f ? 'inset 0 0 0 1px #d8b4fe' : 'none',
                  }}>
                  {f === 'all' ? 'Tất cả' : f === 's_nhathuoc' ? 'Nhà thuốc' : 'Tiêm chủng'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <StatCard icon="📝" label="Bài mới" value={displayVal('baiMoi', stats.baiMoi)} subtitle={`NT: ${stats.baiMoi_NT} · TC: ${stats.baiMoi_TC}`}
              gradient="var(--bg-primary)" accent="#3b82f6" border="var(--border-light)"
              isEditing={isEditingMetrics} onValueChange={(v) => setOverride('baiMoi', v)}
              onClickDetails={() => setDrillDownData({ title: 'Chi tiết Bài mới', subs: prodSubs.filter(s => categorizeSubmission(s) === 'baiMoi') })} />
            <StatCard icon="📦" label="Sản phẩm (SKU)" value={displayVal('sku', stats.sku)} subtitle={`NT: ${stats.sku_NT} · TC: ${stats.sku_TC}`}
              gradient="var(--bg-primary)" accent="#8b5cf6" border="var(--border-light)"
              isEditing={isEditingMetrics} onValueChange={(v) => setOverride('sku', v)}
              onClickDetails={() => setDrillDownData({ title: 'Chi tiết Sản phẩm (SKU)', subs: prodSubs.filter(s => categorizeSubmission(s) === 'sku') })} />
            <StatCard icon="🎨" label="Multimedia" value={displayVal('multimedia', stats.multimedia)} subtitle={`NT: ${stats.mm_NT} · TC: ${stats.mm_TC}`}
              gradient="var(--bg-primary)" accent="#f59e0b" border="var(--border-light)"
              isEditing={isEditingMetrics} onValueChange={(v) => setOverride('multimedia', v)}
              onClickDetails={() => setDrillDownData({ title: 'Chi tiết Multimedia', subs: prodSubs.filter(s => categorizeSubmission(s) === 'multimedia') })} />
            <StatCard icon="🔧" label="Tối ưu SP - Bài viết" value={displayVal('toiUu', stats.toiUu)} subtitle={`SP: ${stats.toiUu_SP} · BV: ${stats.toiUu_BV}`}
              gradient="var(--bg-primary)" accent="#10b981" border="var(--border-light)"
              isEditing={isEditingMetrics} onValueChange={(v) => setOverride('toiUu', v)}
              onClickDetails={() => setDrillDownData({ title: 'Chi tiết Tối ưu Sản phẩm - Bài viết', subs: prodSubs.filter(s => categorizeSubmission(s) === 'toiUu') })} />
          </div>

          {/* ── NEW: Target vs Actual ── */}
          <div className="card" style={{ padding: '20px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <ChartHeader icon={<Target size={14} color="#fff" />} title="Mục tiêu vs Thực tế (Target vs Actual)" color="#ec4899" />
            
            {/* Target Links */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Tổng Link hoàn thành</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#6366f1', fontWeight: 800 }}>{displayVal('totalLinks', stats.totalLinks)}</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>/</span>
                  {isEditingMetrics ? (
                    <input type="text" value={metricOverrides['target_links'] || ''} placeholder="Set target..."
                      onChange={e => setOverride('target_links', e.target.value)}
                      style={{ width: '80px', textAlign: 'right', border: '1px solid var(--border-light)', borderRadius: '4px', padding: '2px 4px', fontSize: '0.9rem' }} />
                  ) : (
                    <span style={{ color: 'var(--text-primary)' }}>{metricOverrides['target_links'] || '2000'}</span>
                  )}
                </div>
              </div>
              <div style={{ height: '10px', borderRadius: '999px', background: 'var(--border-light)', overflow: 'hidden' }}>
                <div style={{ 
                  height: '100%', 
                  width: `${Math.min(100, (stats.totalLinks / (Number(metricOverrides['target_links']) || 2000)) * 100)}%`, 
                  background: '#6366f1', borderRadius: '999px', transition: 'width 0.5s' 
                }} />
              </div>
            </div>

            {/* Target Points */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Tổng Điểm hoàn thành</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#f59e0b', fontWeight: 800 }}>{displayVal('totalPoints', stats.totalPoints.toFixed(0))}</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>/</span>
                  {isEditingMetrics ? (
                    <input type="text" value={metricOverrides['target_points'] || ''} placeholder="Set target..."
                      onChange={e => setOverride('target_points', e.target.value)}
                      style={{ width: '80px', textAlign: 'right', border: '1px solid var(--border-light)', borderRadius: '4px', padding: '2px 4px', fontSize: '0.9rem' }} />
                  ) : (
                    <span style={{ color: 'var(--text-primary)' }}>{metricOverrides['target_points'] || '5000'}</span>
                  )}
                </div>
              </div>
              <div style={{ height: '10px', borderRadius: '999px', background: 'var(--border-light)', overflow: 'hidden' }}>
                <div style={{ 
                  height: '100%', 
                  width: `${Math.min(100, (stats.totalPoints / (Number(metricOverrides['target_points']) || 5000)) * 100)}%`, 
                  background: '#f59e0b', borderRadius: '999px', transition: 'width 0.5s' 
                }} />
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '14px', marginBottom: '24px' }}>
            {/* Grouped Bar chart */}
            <div className="card" style={{ padding: '20px' }}>
              <ChartHeader icon={<BarChart3 size={14} color="#fff" />} title="Output theo nhóm nội dung" color="#3b82f6" />
              <div style={{ height: '260px' }}>
                <Bar
                  data={{
                    labels: ['Bài mới', 'SKU', 'Multimedia', 'Tối ưu nội dung'],
                    datasets: [
                      {
                        label: 'Nhà thuốc',
                        data: [stats.baiMoi_NT, stats.sku_NT, stats.mm_NT, stats.toiUu_NT],
                        backgroundColor: '#2a78d6',
                        borderRadius: 4,
                        barPercentage: 0.8, categoryPercentage: 0.7,
                      },
                      {
                        label: 'Tiêm chủng',
                        data: [stats.baiMoi_TC, stats.sku_TC, stats.mm_TC, stats.toiUu_TC],
                        backgroundColor: '#1baf7a',
                        borderRadius: 4,
                        barPercentage: 0.8, categoryPercentage: 0.7,
                      }
                    ],
                  }}
                  options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                      legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, font: { size: 12, weight: 'bold' } } },
                      tooltip: { backgroundColor: 'rgba(15,23,42,.92)', padding: 12, cornerRadius: 8 },
                    },
                    scales: {
                      x: { grid: { display: false }, ticks: { color: chartTextColor, font: { size: 11, weight: 'bold' } } },
                      y: { grid: { color: chartGridColor }, ticks: { color: chartTextColor, font: { size: 10 } } },
                    },
                  }}
                />
              </div>
            </div>

            {/* Line chart — weekly trend */}
            <div className="card" style={{ padding: '20px' }}>
              <ChartHeader icon={<TrendingUp size={14} color="#fff" />} title="Xu hướng output theo tuần" color="#8b5cf6" />
              {weeklyTrend.length > 0 ? (
                <div style={{ height: '260px' }}>
                  <Line
                    data={{
                      labels: weeklyTrend.map(([, d]) => d.label),
                      datasets: [
                        {
                          label: 'Nhà thuốc',
                          data: weeklyTrend.map(([, d]) => d.nt),
                          borderColor: '#2a78d6',
                          backgroundColor: 'rgba(42,120,214,.08)',
                          fill: true, tension: 0.4,
                          pointRadius: 4, pointHoverRadius: 6,
                        },
                        {
                          label: 'Tiêm chủng',
                          data: weeklyTrend.map(([, d]) => d.tc),
                          borderColor: '#1baf7a',
                          borderDash: [5, 4],
                          backgroundColor: 'rgba(27,175,122,.08)',
                          fill: true, tension: 0.4,
                          pointRadius: 4, pointHoverRadius: 6,
                        },
                      ],
                    }}
                    options={{
                      responsive: true, maintainAspectRatio: false,
                      interaction: { mode: 'index', intersect: false },
                      plugins: {
                        legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, font: { size: 12, weight: 'bold' } } },
                        tooltip: { backgroundColor: 'rgba(15,23,42,.92)', padding: 12, cornerRadius: 8 },
                      },
                      scales: {
                        x: { grid: { display: false }, ticks: { color: chartTextColor, font: { size: 10 }, maxRotation: 45 } },
                        y: { grid: { color: chartGridColor }, ticks: { color: chartTextColor, font: { size: 10 } } },
                      },
                    }}
                  />
                </div>
              ) : <EmptyChart />}
            </div>
          </div>
        </>
      )}

      {/* ── Block 3: Quality & Compliance ── */}
      {visibleBlocks.quality && (
        <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Chất lượng & Compliance</h3>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <AlertTriangle size={12} /> Rủi ro quản trị
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', margin: 0 }}>Mỗi ca compliance chặn được = 1 rủi ro pháp lý/thương hiệu tránh được.</p>
            {isEditingMetrics ? (
              <input
                type="text"
                placeholder="Dán link quản lý (Google Drive, Docs...)"
                value={metricOverrides['qc_driveLink'] ?? ''}
                onChange={e => setOverride('qc_driveLink', e.target.value)}
                style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem', width: '280px', outline: 'none' }}
              />
            ) : (
              metricOverrides['qc_driveLink'] && (
                <a href={metricOverrides['qc_driveLink']} target="_blank" rel="noreferrer" style={{ fontSize: '0.85rem', color: '#0ea5e9', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', background: '#f0f9ff', padding: '6px 12px', borderRadius: '6px' }}>
                  <ExternalLink size={14} /> Mở file quản lý
                </a>
              )
            )}
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <StatCard icon={<ShieldCheck size={24} color="#0f766e" />} label="Số lượt đánh giá" 
              value={displayVal('qc_totalReviews', qualityStats.hasQualityData ? qualityStats.totalReviews : 'N/A')} 
              gradient="#f0fdf4" accent="#0f766e" border="#bbf7d0" subtitle="Đánh giá từ khách hàng"
              isEditing={isEditingMetrics} onValueChange={v => setOverride('qc_totalReviews', v)} />
            
            <StatCard icon={<CheckCircle size={24} color="#0f766e" />} label="Tổng điểm trung bình" 
              value={(() => {
                const v = displayVal('qc_avgScore', qualityStats.hasQualityData ? qualityStats.avgScore.toFixed(1) : 'N/A');
                if (isEditingMetrics) return v === 'N/A' ? '' : v;
                return v === 'N/A' ? 'N/A' : `${v}/5`;
              })()} 
              gradient="#f0fdf4" accent="#0f766e" border="#bbf7d0" subtitle="Điểm số chất lượng"
              isEditing={isEditingMetrics} onValueChange={v => setOverride('qc_avgScore', v.replace('/5', ''))} />
              
            <StatCard icon={<MessageSquare size={24} color="#475569" />} label="Tổng lượt comment" 
              value={displayVal('qc_totalComments', qualityStats.hasQualityData ? qualityStats.totalComments : 'N/A')} 
              gradient="#f8fafc" accent="#475569" border="#e2e8f0" subtitle="Nhận xét từ khách hàng"
              isEditing={isEditingMetrics} onValueChange={v => setOverride('qc_totalComments', v)} />
              
            <StatCard icon={<Activity size={24} color="#b91c1c" />} label="Comment Tích cực/Tiêu cực" 
              value={(() => {
                const pos = displayVal('qc_pctPositive', qualityStats.hasQualityData ? qualityStats.pctPositive : 'N/A');
                const neg = displayVal('qc_pctNegative', qualityStats.hasQualityData ? qualityStats.pctNegative : 'N/A');
                if (isEditingMetrics) return (pos === 'N/A' && neg === 'N/A') ? '' : `${pos}/${neg}`;
                return pos === 'N/A' ? 'N/A' : `${pos}% / ${neg}%`;
              })()} 
              gradient="#fef2f2" accent="#b91c1c" border="#fecaca" subtitle="Đánh giá tự động qua từ khoá"
              isEditing={isEditingMetrics} onValueChange={v => {
                const parts = v.replace(/%/g, '').split('/');
                setOverride('qc_pctPositive', parts[0]?.trim() || '');
                setOverride('qc_pctNegative', parts[1]?.trim() || '');
              }} />
          </div>
        </div>
      )}

      {/* ── Block 3.5: Customer Comment Analysis ── */}
      {visibleBlocks.customerComments && (
        <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ padding: '8px', background: '#475569', borderRadius: '50%', color: '#fff' }}><MessageSquare size={16} /></div>
              <h3 style={{ fontWeight: 800, fontSize: '1.2rem', margin: 0 }}>Phân tích Comment khách hàng</h3>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input
                ref={commentFileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,.tsv,text/csv"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImportCommentsFile(f); }}
              />
              {!isPublicShare && (
                <button className="btn btn-secondary" onClick={() => commentFileInputRef.current?.click()}
                  disabled={isImportingComments} title="Import file CSV/Excel chứa comment khách hàng">
                  {isImportingComments ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} Import CSV/Excel
                </button>
              )}
              <AIBlockButton block="customerCommentAnalysis" label="AI phân tích comment" />
              {hotspotComments.length > 0 && (
                <>
                  <button className="btn" onClick={handleExportHotspots}
                    style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontWeight: 600 }}
                    title="Xuất comment tiêu cực, rủi ro thương hiệu, cần xử lý khẩn">
                    <Download size={14} /> 🔴 Điểm Nóng ({hotspotComments.length})
                  </button>
                  {!isPublicShare && (
                    <button className="btn btn-ghost btn-icon" onClick={handleClearHotspots} title="Xóa danh sách điểm nóng" style={{ color: '#ef4444' }}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </>
              )}
              {improvementComments.length > 0 && (
                <>
                  <button className="btn" onClick={handleExportImprovements}
                    style={{ background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', fontWeight: 600 }}
                    title="Xuất comment góp ý, thắc mắc, cơ hội cải thiện nội dung">
                    <Download size={14} /> 🟡 Cải Thiện ({improvementComments.length})
                  </button>
                  {!isPublicShare && (
                    <button className="btn btn-ghost btn-icon" onClick={handleClearImprovements} title="Xóa danh sách cần cải thiện" style={{ color: '#d97706' }}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </>
              )}
              {!isPublicShare && (
                <button className="btn btn-ghost btn-icon" onClick={() => setIsEditingCustomerComments(!isEditingCustomerComments)} style={{ color: '#475569' }}>
                  {isEditingCustomerComments ? <Save size={18} /> : <Edit3 size={18} />}
                </button>
              )}
            </div>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', margin: '0 0 8px 0' }}>
            Dán hoặc import (CSV/Excel, hỗ trợ hàng nghìn dòng/tháng) nội dung comment/nhận xét khách hàng thực tế để AI đọc và phân tích chủ đề, trích dẫn cụ thể — thay vì chỉ đếm % tích cực/tiêu cực. File import sẽ tự tìm cột chứa văn bản comment.
            Dữ liệu thô này chỉ dùng tạm trong phiên làm việc hiện tại để AI phân tích, <strong>không được lưu lại</strong> (tải lại trang hoặc đổi kỳ báo cáo sẽ mất, cần import lại); chỉ kết quả phân tích bên dưới mới được lưu.
          </p>
          {commentImportInfo && (
            <p style={{ fontSize: '0.78rem', color: '#0f766e', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle size={13} /> Đã import {commentImportInfo.totalRows.toLocaleString('vi-VN')} dòng từ "{commentImportInfo.fileName}" (cột: "{commentImportInfo.columnUsed}")
            </p>
          )}
          <textarea
            className="form-input"
            placeholder={'Ví dụ:\nBài duyệt hơi chậm so với deadline\nNội dung sản phẩm rất chuẩn, khách yên tâm\nCần bổ sung ảnh minh hoạ cho bài tiêm chủng...\n\n(hoặc bấm "Import CSV/Excel" để nạp hàng loạt)'}
            value={customerCommentsRawText}
            onChange={e => { setCustomerCommentsRawText(e.target.value); setCommentImportInfo(null); }}
            rows={4}
            style={{ width: '100%', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '16px', fontFamily: 'inherit' }}
          />
          {isEditingCustomerComments ? (
            <textarea className="form-input" value={customerCommentAnalysisText} onChange={e => setCustomerCommentAnalysisText(e.target.value)} rows={4} style={{ width: '100%', fontSize: '0.95rem', lineHeight: 1.6 }} />
          ) : customerCommentAnalysisText ? (
            <div style={{ fontSize: '0.95rem', lineHeight: 1.7, color: '#1e293b', fontWeight: 500, padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{customerCommentAnalysisText}</ReactMarkdown></div>
            </div>
          ) : (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', fontStyle: 'italic', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #e2e8f0' }}>
              Chưa có phân tích. Dán comment khách hàng ở trên (không bắt buộc) rồi bấm nút AI để tạo phân tích.
            </div>
          )}
        </div>
      )}

      {/* ── Block 4: Tasks Breakdown ── */}
      {visibleBlocks.teamTasks && tasksBreakdown.length > 0 && (
        <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
          <ChartHeader icon={<LayoutTemplate size={14} color="#fff" />} title="Bảng chi tiết đầu việc" color="#14b8a6" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-start' }}>
            <div style={{ flex: '1.5 1 500px', maxHeight: '594px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', background: '#fff' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '400px' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 2, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <tr>
                    <th style={{ padding: '16px 14px', borderBottom: '2px solid #cbd5e1', color: '#334155', fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Đầu việc</th>
                    <th style={{ padding: '16px 14px', borderBottom: '2px solid #cbd5e1', color: '#334155', fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Chi tiết đầu việc</th>
                    <th style={{ padding: '16px 14px', borderBottom: '2px solid #cbd5e1', color: '#334155', fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>Số lượng</th>
                    <th style={{ padding: '16px 14px', borderBottom: '2px solid #cbd5e1', color: '#334155', fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>Tổng điểm</th>
                  </tr>
                </thead>
                <tbody>
                  {tasksBreakdown.map((t, typeIdx) => (
                    t.details.map((detail, idx) => (
                      <tr key={`${t.type}-${detail.name}`} style={{ transition: 'background 0.2s', cursor: 'default' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        {idx === 0 && (
                          <td rowSpan={t.details.length} style={{ padding: '14px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, verticalAlign: 'middle', borderRight: '1px solid #e2e8f0', background: `${CHART_PALETTE[typeIdx % CHART_PALETTE.length]}10`, color: '#0f172a', fontSize: '0.95rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ width: 12, height: 12, borderRadius: '50%', background: CHART_PALETTE[typeIdx % CHART_PALETTE.length], boxShadow: '0 0 0 2px rgba(255,255,255,0.8)' }}></span>
                              {t.type}
                            </div>
                          </td>
                        )}
                        <td style={{ padding: '14px', borderBottom: '1px solid #f1f5f9', fontSize: '0.95rem', color: '#334155', fontWeight: 500 }}>{detail.name}</td>
                        <td style={{ padding: '14px', borderBottom: '1px solid #f1f5f9', fontSize: '1rem', fontWeight: 700, textAlign: 'center', color: '#0f172a' }}>{detail.links}</td>
                        <td style={{ padding: '14px', borderBottom: '1px solid #f1f5f9', fontSize: '1rem', fontWeight: 800, textAlign: 'center', color: '#4f46e5' }}>{detail.points.toFixed(1)}</td>
                      </tr>
                    ))
                  ))}
                </tbody>
                <tfoot style={{ position: 'sticky', bottom: 0, background: '#f8fafc', zIndex: 2, boxShadow: '0 -2px 10px rgba(0,0,0,0.06)' }}>
                  <tr>
                    <td colSpan={2} style={{ padding: '18px 14px', fontWeight: 800, borderTop: '2px solid #cbd5e1', textAlign: 'right', fontSize: '1.05rem', color: '#0f172a' }}>TỔNG CỘNG</td>
                    <td style={{ padding: '18px 14px', textAlign: 'center', fontWeight: 800, borderTop: '2px solid #cbd5e1', fontSize: '1.15rem', color: '#0f172a' }}>
                      {tasksBreakdown.reduce((s, t) => s + t.details.reduce((ss, d) => ss + d.links, 0), 0)}
                      <div style={{ marginTop: '6px' }}><DeltaBadge value={stats.deltaLinks} /></div>
                    </td>
                    <td style={{ padding: '18px 14px', textAlign: 'center', fontWeight: 800, color: '#4f46e5', borderTop: '2px solid #cbd5e1', fontSize: '1.15rem' }}>
                      {tasksBreakdown.reduce((s, t) => s + t.details.reduce((ss, d) => ss + d.points, 0), 0).toFixed(1)}
                      <div style={{ marginTop: '6px' }}><DeltaBadge value={stats.deltaPoints} /></div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            
            <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Pie 1: Phân bổ nhóm nội dung */}
              <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '12px' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '16px', textAlign: 'center' }}>Phân bổ nhóm nội dung</h4>
                <div style={{ height: '220px', display: 'flex', justifyContent: 'center' }}>
                  <Doughnut
                    data={{
                      labels: teamBreakdown.map(([t]) => t),
                      datasets: [{
                        data: teamBreakdown.map(([, v]) => v.points),
                        backgroundColor: teamBreakdown.map(([t]) => TEAM_COLORS[t] || '#64748b'),
                        borderWidth: 2,
                      }],
                    }}
                    options={{
                      responsive: true, maintainAspectRatio: false,
                      plugins: {
                        legend: { position: 'bottom', labels: { usePointStyle: true, font: { size: 11 } } },
                        tooltip: {
                          backgroundColor: 'rgba(15,23,42,.92)', padding: 12, cornerRadius: 8,
                          callbacks: {
                            label: (ctx) => {
                              const [, data] = teamBreakdown[ctx.dataIndex];
                              return ` ${data.links} Lượt · ${data.points.toFixed(1)} Điểm`;
                            }
                          }
                        }
                      }
                    }}
                  />
                </div>
              </div>

              {/* Pie 2: Khối lượng công việc theo Đầu việc */}
              <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '12px' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '16px', textAlign: 'center' }}>Khối lượng công việc (Link)</h4>
                <div style={{ height: '220px', display: 'flex', justifyContent: 'center' }}>
                  <Doughnut
                    data={{
                      labels: (() => {
                        const allTasks = tasksBreakdown.flatMap(t => t.details).sort((a, b) => b.links - a.links);
                        const topTasks = allTasks.slice(0, 8);
                        const otherLinks = allTasks.slice(8).reduce((s, x) => s + x.links, 0);
                        return [...topTasks.map(t => t.name.length > 20 ? t.name.slice(0, 18) + '...' : t.name), ...(otherLinks > 0 ? ['Khác'] : [])];
                      })(),
                      datasets: [{
                        data: (() => {
                          const allTasks = tasksBreakdown.flatMap(t => t.details).sort((a, b) => b.links - a.links);
                          const topTasks = allTasks.slice(0, 8);
                          const otherLinks = allTasks.slice(8).reduce((s, x) => s + x.links, 0);
                          return [...topTasks.map(t => t.links), ...(otherLinks > 0 ? [otherLinks] : [])];
                        })(),
                        backgroundColor: (() => {
                          const allTasks = tasksBreakdown.flatMap(t => t.details).sort((a, b) => b.links - a.links);
                          const topTasks = allTasks.slice(0, 8);
                          const otherLinks = allTasks.slice(8).reduce((s, x) => s + x.links, 0);
                          return [...topTasks.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]), ...(otherLinks > 0 ? ['#94a3b8'] : [])];
                        })(),
                        borderWidth: 2,
                      }]
                    }}
                    options={{
                      responsive: true, maintainAspectRatio: false,
                      plugins: {
                        legend: { position: 'bottom', labels: { usePointStyle: true, font: { size: 10 } } },
                        tooltip: { backgroundColor: 'rgba(15,23,42,.92)', padding: 12, cornerRadius: 8 }
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Block 5: Team & Project ── */}
      {visibleBlocks.teamAndProject && (
        <>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '24px 0 16px 0' }}>Dự án</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '14px', marginBottom: '14px' }}>
            <div className="card" style={{ padding: '20px' }}>
              <ChartHeader icon={<Target size={14} color="#fff" />} title="Tiến độ các dự án trọng điểm" color="#10b981" />
              {projectProgress.length > 0 ? (
                <div style={{ height: `${Math.max(200, projectProgress.length * 32 + 40)}px` }}>
                  <Bar
                    data={{
                      labels: projectProgress.map(p => p.name.length > 20 ? p.name.slice(0, 18) + '...' : p.name),
                      datasets: [
                        {
                          label: 'Hoàn thành',
                          data: projectProgress.map(p => p.progress),
                          backgroundColor: projectProgress.map(p => p.progress >= 80 ? '#16a34a99' : p.progress >= 50 ? '#6366f199' : '#ea580c99'),
                          borderColor: projectProgress.map(p => p.progress >= 80 ? '#16a34a' : p.progress >= 50 ? '#6366f1' : '#ea580c'),
                          borderWidth: 1.5,
                          borderRadius: 6,
                        },
                        {
                          label: 'Còn lại',
                          data: projectProgress.map(p => 100 - p.progress),
                          backgroundColor: 'rgba(148,163,184,.12)',
                          borderColor: 'rgba(148,163,184,.2)',
                          borderWidth: 1,
                          borderRadius: 6,
                        },
                      ],
                    }}
                    options={{
                      responsive: true, maintainAspectRatio: false,
                      indexAxis: 'y' as const,
                      plugins: {
                        legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } } },
                        tooltip: {
                          backgroundColor: 'rgba(15,23,42,.92)', padding: 10, cornerRadius: 8,
                          callbacks: {
                            label: (ctx: any) => {
                              const p = projectProgress[ctx.dataIndex];
                              if (ctx.datasetIndex === 0) return p ? `${p.progress}% tiến độ chung (${p.totalDone}/${p.totalTarget} mục tiêu. Đã làm kỳ này: ${p.periodLinks})` : '';
                              return `${100 - (p?.progress ?? 0)}% còn lại`;
                            },
                          },
                        },
                      },
                      scales: {
                        x: { stacked: true, max: 100, grid: { color: chartGridColor }, ticks: { color: chartTextColor, callback: (v) => `${v}%`, font: { size: 10 } } },
                        y: { stacked: true, grid: { display: false }, ticks: { color: chartTextColor, font: { size: 11 } } },
                      },
                    }}
                  />
                </div>
              ) : <EmptyChart />}
            </div>

            {visibleBlocks.topics && (
              <div className="card" style={{ padding: '20px' }}>
                <ChartHeader icon={<PieChart size={14} color="#fff" />} title="Tỷ trọng khối lượng theo dự án" color="#8b5cf6" />
                
                {isEditingMetrics && (
                  <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '8px', color: 'var(--text-secondary)' }}>Chọn dự án xuất hiện trong biểu đồ:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '150px', overflowY: 'auto' }}>
                      {projects.filter(p => p.status === 'Đang chạy').map(p => (
                        <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', cursor: 'pointer' }}>
                          <input type="checkbox" 
                            checked={selectedFocusProjects.includes(p.id)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedFocusProjects([...selectedFocusProjects, p.id]);
                              else setSelectedFocusProjects(selectedFocusProjects.filter(id => id !== p.id));
                            }}
                          />
                          {p.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {projectsFocus.length > 0 ? (
                  <div style={{ height: '320px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '16px' }}>
                    <Pie
                      data={{
                        labels: projectsFocus.map(p => p.name.length > 20 ? p.name.slice(0, 18) + '...' : p.name),
                        datasets: [{
                          data: projectsFocus.map(p => p.links),
                          backgroundColor: CHART_PALETTE,
                          borderWidth: 0,
                          hoverOffset: 4
                        }]
                      }}
                      options={{
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                          legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } } },
                          tooltip: {
                            backgroundColor: 'rgba(15,23,42,.92)', padding: 10, cornerRadius: 8,
                            callbacks: {
                              label: (ctx: any) => ` ${ctx.raw} link (${Math.round((Number(ctx.raw) / projectsFocus.reduce((s,p) => s+p.links, 0)) * 100)}%)`
                            }
                          },
                        }
                      }}
                    />
                  </div>
                ) : <EmptyChart />}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── NEW: Heat Chart — dự án × tuần ── */}
      {visibleBlocks.topics && heatmapData.topics.length > 0 && heatmapData.weeks.length > 0 && (
        <div className="card" style={{ padding: '20px', marginBottom: '14px', overflowX: 'auto' }}>
          <ChartHeader icon={<Hash size={14} color="#fff" />} title="Mức độ hoạt động theo dự án × tuần" color="#534AB7" />
          <div style={{ minWidth: `${180 + heatmapData.weeks.length * 80}px` }}>
            {/* Header row — week labels */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: `180px repeat(${heatmapData.weeks.length}, 1fr)`,
              gap: '3px', marginBottom: '3px',
            }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-tertiary)', padding: '4px 8px' }}>Dự án</div>
              {heatmapData.weeks.map(([wk, label]) => (
                <div key={wk} style={{
                  fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-tertiary)',
                  textAlign: 'center', padding: '4px 2px', whiteSpace: 'nowrap',
                }}>
                  {label}
                </div>
              ))}
            </div>
            {/* Data rows */}
            {heatmapData.topics.map((topic, ti) => (
              <div key={topic} style={{
                display: 'grid',
                gridTemplateColumns: `180px repeat(${heatmapData.weeks.length}, 1fr)`,
                gap: '3px', marginBottom: '3px',
              }}>
                <div style={{
                  fontSize: '0.78rem', fontWeight: 600, padding: '8px', borderRadius: '6px',
                  background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', gap: '6px',
                  overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                }} title={topic}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: CHART_PALETTE[ti % CHART_PALETTE.length], flexShrink: 0 }} />
                  {topic.length > 18 ? topic.slice(0, 16) + '...' : topic}
                </div>
                {heatmapData.matrix[ti].map((val, wi) => {
                  const intensity = heatmapData.maxVal > 0 ? val / heatmapData.maxVal : 0;
                  const bg = val === 0
                    ? 'var(--bg-secondary)'
                    : `rgba(83, 74, 183, ${0.12 + intensity * 0.75})`;
                  const textColor = intensity > 0.5 ? '#fff' : 'var(--text-primary)';
                  return (
                    <div key={wi} style={{
                      borderRadius: '6px', background: bg, display: 'flex',
                      alignItems: 'center', justifyContent: 'center', padding: '8px 4px',
                      fontWeight: val > 0 ? 700 : 400, fontSize: '0.82rem', color: textColor,
                      transition: 'background .3s, transform .15s', cursor: 'default',
                      minHeight: '36px',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.zIndex = '5'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.zIndex = ''; }}
                      title={`${topic}: ${val} link`}
                    >
                      {val > 0 ? val : '—'}
                    </div>
                  );
                })}
              </div>
            ))}
            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-light)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>Ít</span>
              {[0.15, 0.35, 0.55, 0.75, 0.9].map((op, i) => (
                <div key={i} style={{ width: 20, height: 14, borderRadius: 3, background: `rgba(83, 74, 183, ${op})` }} />
              ))}
              <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>Nhiều</span>
              <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', fontWeight: 600 }}>Số lượng output trong tuần</span>
            </div>
          </div>
        </div>
      )}

      {/* ── 6. Phân bổ Team & So sánh kỳ ── */}
      {visibleBlocks.teamAndProject && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '14px', marginBottom: '14px' }}>
          {/* Radar — comparison vs prev period */}
          <div className="card" style={{ padding: '20px' }}>
            <ChartHeader icon={<BarChart3 size={14} color="#fff" />} title={`So sánh với kỳ trước`} color="#3b82f6" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '380px', height: '320px' }}>
                <Radar
                  data={{
                    labels: ['Link', 'Điểm', 'Submit', 'Nhân viên', 'Dự án'],
                    datasets: [
                      {
                        label: periodLabel,
                        data: radarData.current,
                        borderColor: '#6366f1',
                        backgroundColor: 'rgba(99,102,241,.15)',
                        borderWidth: 2.5,
                        pointBackgroundColor: '#6366f1',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 5,
                      },
                      {
                        label: 'Kỳ trước',
                        data: radarData.prev,
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245,158,11,.08)',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        pointBackgroundColor: '#f59e0b',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                      },
                    ],
                  }}
                  options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                      legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } } },
                      tooltip: { backgroundColor: 'rgba(15,23,42,.92)', padding: 10, cornerRadius: 8 },
                    },
                    scales: {
                      r: {
                        grid: { color: chartGridColor },
                        angleLines: { color: chartGridColor },
                        ticks: { display: false },
                        pointLabels: { color: chartTextColor, font: { size: 12, weight: 'bold' } },
                        suggestedMin: 0, suggestedMax: 100,
                      },
                    },
                  }}
                />
              </div>
            </div>
            
            {/* Auto Insight for Radar */}
            <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: '8px', borderLeft: '3px solid #3b82f6' }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <span style={{ fontWeight: 600, color: '#3b82f6', marginRight: '4px' }}>💡 Nhận xét:</span>
                {(() => {
                  const dL = stats.deltaLinks;
                  const dP = stats.deltaPoints;
                  if (dL > 0 && dP > 0) return `Vùng phủ hoạt động đang mở rộng tích cực so với kỳ trước. Cả khối lượng công việc (+${dL}%) và chất lượng điểm số (+${dP}%) đều trên đà tăng.`;
                  if (dL <= 0 && dP > 0) return `Số lượng link giảm (${dL}%), nhưng tổng điểm lại tăng (+${dP}%), cho thấy team đang tập trung xử lý các task khó, đòi hỏi nhiều chất xám hơn thay vì chạy số lượng.`;
                  if (dL > 0 && dP <= 0) return `Số lượng link tăng (+${dL}%), nhưng tổng điểm lại giảm (${dP}%), cho thấy team đang làm nhiều công việc dễ và có trọng số điểm thấp.`;
                  if (dL < 0 && dP < 0) return `Vùng phủ hoạt động đang bị thu hẹp. Cả số lượng (${dL}%) và điểm số (${dP}%) đều sụt giảm so với kỳ trước. Cần rà soát lại nguyên nhân.`;
                  return `Nhìn chung, vùng phủ hoạt động của team đang được duy trì ở mức độ ổn định so với kỳ trước.`;
                })()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Block 5.5: Điểm nghẽn ── */}
      {visibleBlocks.bottleneck && (
        <div className="card" style={{ padding: '24px', marginBottom: '24px', background: 'linear-gradient(to right, #fef2f2, #fee2e2)', border: '1px solid #fecaca' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ padding: '8px', background: '#dc2626', borderRadius: '50%', color: '#fff' }}><AlertTriangle size={16} /></div>
              <h3 style={{ fontWeight: 800, fontSize: '1.2rem', color: '#7f1d1d', margin: 0 }}>Điểm nghẽn & Khó khăn</h3>
            </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <AIBlockButton block="bottleneck" label="AI phân tích điểm nghẽn" />
            {!isPublicShare && (
              <button className="btn btn-ghost btn-icon" onClick={() => setIsEditingBottleneck(!isEditingBottleneck)} style={{ color: '#dc2626' }}>
                {isEditingBottleneck ? <Save size={18} /> : <Edit3 size={18} />}
              </button>
            )}
          </div>
          </div>
          {isEditingBottleneck && !isPublicShare ? (
            <textarea className="form-input" value={bottleneckText} onChange={e => setBottleneckText(e.target.value)} rows={3} style={{ width: '100%', fontSize: '1rem', lineHeight: 1.6 }} />
          ) : (
            <div style={{ fontSize: '1rem', lineHeight: 1.7, color: '#450a0a', fontWeight: 500 }}>
              <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{bottleneckText}</ReactMarkdown></div>
            </div>
          )}
        </div>
      )}

      {/* ── Block 6: Mở rộng & Đề xuất ── */}
      {visibleBlocks.recommendation && (
        <div className="card" style={{ padding: '24px', marginBottom: '24px', background: 'linear-gradient(to right, #eff6ff, #dbeafe)', border: '1px solid #bfdbfe' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ padding: '8px', background: '#2563eb', borderRadius: '50%', color: '#fff' }}><TrendingUp size={16} /></div>
              <h3 style={{ fontWeight: 800, fontSize: '1.2rem', color: '#1e40af', margin: 0 }}>Mở rộng & Đề xuất</h3>
            </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <AIBlockButton block="recommendation" label="AI viết đề xuất" />
            {!isPublicShare && (
              <button className="btn btn-ghost btn-icon" onClick={() => setIsEditingRec(!isEditingRec)} style={{ color: '#2563eb' }}>
                {isEditingRec ? <Save size={18} /> : <Edit3 size={18} />}
              </button>
            )}
          </div>
          </div>
          {isEditingRec && !isPublicShare ? (
            <textarea className="form-input" value={recommendationText} onChange={e => setRecommendationText(e.target.value)} rows={3} style={{ width: '100%', fontSize: '1rem', lineHeight: 1.6 }} />
          ) : (
            <div style={{ fontSize: '1rem', lineHeight: 1.7, color: '#1e3a8a', fontWeight: 500 }}>
              <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{recommendationText}</ReactMarkdown></div>
            </div>
          )}
        </div>
      )}

      {/* ── Block 7: Kế hoạch triển khai kỳ tới ── */}
      {visibleBlocks.nextPlan && (
        <div className="card" style={{ padding: '24px', marginBottom: '24px', background: '#fff', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ padding: '8px', background: 'linear-gradient(135deg, #10b981, #059669)', borderRadius: '8px', color: '#fff' }}>
                <Compass size={18} />
              </div>
              <h3 style={{ fontWeight: 800, fontSize: '1.25rem', color: '#0f172a', margin: 0 }}>Kế hoạch triển khai kỳ tới</h3>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <AIBlockButton block="nextPlan" label="AI gợi ý kế hoạch" />
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {/* Định hướng chung */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#0f172a', fontWeight: 700 }}>
                <Compass size={16} color="#6366f1" /> Định hướng chung
              </div>
              {isEditingMetrics ? (
                <textarea className="form-input" style={{ width: '100%', fontSize: '0.9rem', lineHeight: 1.6 }} rows={3} placeholder="Định hướng chiến lược..." value={metricOverrides['plan_general'] ?? ''} onChange={e => setOverride('plan_general', e.target.value)} />
              ) : (
                <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#334155' }}>{metricOverrides['plan_general'] ? <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{metricOverrides['plan_general']}</ReactMarkdown></div> : <span style={{ opacity: 0.5, fontStyle: 'italic' }}>Chưa cập nhật...</span>}</div>
              )}
            </div>
            
            {/* Mục tiêu nội dung */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#0f172a', fontWeight: 700 }}>
                <Target size={16} color="#ef4444" /> Mục tiêu nội dung
              </div>
              {isEditingMetrics ? (
                <textarea className="form-input" style={{ width: '100%', fontSize: '0.9rem', lineHeight: 1.6 }} rows={3} placeholder="Mục tiêu số lượng/chất lượng..." value={metricOverrides['plan_goals'] ?? ''} onChange={e => setOverride('plan_goals', e.target.value)} />
              ) : (
                <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#334155' }}>{metricOverrides['plan_goals'] ? <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{metricOverrides['plan_goals']}</ReactMarkdown></div> : <span style={{ opacity: 0.5, fontStyle: 'italic' }}>Chưa cập nhật...</span>}</div>
              )}
            </div>

            {/* Chủ đề Focus */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#0f172a', fontWeight: 700 }}>
                <Hash size={16} color="#8b5cf6" /> Chủ đề Focus
              </div>
              {isEditingMetrics ? (
                <textarea className="form-input" style={{ width: '100%', fontSize: '0.9rem', lineHeight: 1.6 }} rows={3} placeholder="Các chủ đề/bệnh lý tập trung..." value={metricOverrides['plan_topics'] ?? ''} onChange={e => setOverride('plan_topics', e.target.value)} />
              ) : (
                <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#334155' }}>{metricOverrides['plan_topics'] ? <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{metricOverrides['plan_topics']}</ReactMarkdown></div> : <span style={{ opacity: 0.5, fontStyle: 'italic' }}>Chưa cập nhật...</span>}</div>
              )}
            </div>

            {/* Phát triển đội ngũ */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#0f172a', fontWeight: 700 }}>
                <Sparkles size={16} color="#10b981" /> Phát triển đội ngũ
              </div>
              {isEditingMetrics ? (
                <textarea className="form-input" style={{ width: '100%', fontSize: '0.9rem', lineHeight: 1.6 }} rows={3} placeholder="Kế hoạch tuyển dụng, đào tạo..." value={metricOverrides['plan_team'] ?? ''} onChange={e => setOverride('plan_team', e.target.value)} />
              ) : (
                <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#334155' }}>{metricOverrides['plan_team'] ? <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{metricOverrides['plan_team']}</ReactMarkdown></div> : <span style={{ opacity: 0.5, fontStyle: 'italic' }}>Chưa cập nhật...</span>}</div>
              )}
            </div>
          </div>

          <h4 style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a', marginBottom: '16px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>Công việc cụ thể theo Team</h4>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            {/* Team Bài viết */}
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '12px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#0369a1', fontWeight: 700 }}>
                <FileText size={16} /> Team Bài viết
              </div>
              {isEditingMetrics ? (
                <textarea className="form-input" style={{ width: '100%', fontSize: '0.9rem', lineHeight: 1.6, background: '#fff', border: '1px solid #7dd3fc', borderRadius: '8px', padding: '12px' }} rows={4} placeholder="Chi tiết công việc team Bài viết..." value={metricOverrides['plan_team_baiviet'] ?? ''} onChange={e => setOverride('plan_team_baiviet', e.target.value)} />
              ) : (
                <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#0c4a6e' }}>{metricOverrides['plan_team_baiviet'] ? <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{metricOverrides['plan_team_baiviet']}</ReactMarkdown></div> : <span style={{ opacity: 0.5, fontStyle: 'italic' }}>Chưa cập nhật...</span>}</div>
              )}
            </div>

            {/* Team Sản phẩm */}
            <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '12px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#6d28d9', fontWeight: 700 }}>
                <Package size={16} /> Team Sản phẩm
              </div>
              {isEditingMetrics ? (
                <textarea className="form-input" style={{ width: '100%', fontSize: '0.9rem', lineHeight: 1.6, background: '#fff', border: '1px solid #c4b5fd', borderRadius: '8px', padding: '12px' }} rows={4} placeholder="Chi tiết công việc team Sản phẩm..." value={metricOverrides['plan_team_sanpham'] ?? ''} onChange={e => setOverride('plan_team_sanpham', e.target.value)} />
              ) : (
                <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#4c1d95' }}>{metricOverrides['plan_team_sanpham'] ? <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{metricOverrides['plan_team_sanpham']}</ReactMarkdown></div> : <span style={{ opacity: 0.5, fontStyle: 'italic' }}>Chưa cập nhật...</span>}</div>
              )}
            </div>

            {/* Team Multimedia */}
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#b45309', fontWeight: 700 }}>
                <Image size={16} /> Team Multimedia
              </div>
              {isEditingMetrics ? (
                <textarea className="form-input" style={{ width: '100%', fontSize: '0.9rem', lineHeight: 1.6, background: '#fff', border: '1px solid #fcd34d', borderRadius: '8px', padding: '12px' }} rows={4} placeholder="Chi tiết công việc team Multimedia..." value={metricOverrides['plan_team_multimedia'] ?? ''} onChange={e => setOverride('plan_team_multimedia', e.target.value)} />
              ) : (
                <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#78350f' }}>{metricOverrides['plan_team_multimedia'] ? <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{metricOverrides['plan_team_multimedia']}</ReactMarkdown></div> : <span style={{ opacity: 0.5, fontStyle: 'italic' }}>Chưa cập nhật...</span>}</div>
              )}
            </div>
          </div>
        </div>
      )}

      </div> {/* end reportRef */}

      {/* ── Quick action: Go to weekly reports ── */}
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <a href="/reports" style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 24px',
          borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)',
          border: '1px solid var(--border-light)', color: 'var(--text-secondary)',
          fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none',
          transition: 'all .2s',
        }}>
          <Calendar size={14} /> Xem báo cáo tuần chi tiết <ArrowRight size={14} />
        </a>
      </div>

      {drillDownData && (
        <DrillDownModal data={drillDownData} onClose={() => setDrillDownData(null)} />
      )}

      {/* ── AI Modals ── */}
      
      {/* 1. AI Settings Modal */}
      {showAISettings && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="card" style={{ width: '480px', maxWidth: '90vw', padding: '24px', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a' }}>
                <Settings size={20} color="#10b981" /> Cài đặt AI
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAISettings(false)}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              API Key đã được cấu hình bảo mật trên server. Bạn chỉ cần chọn model AI để sử dụng.
            </p>
            <div className="form-group">
              <label className="form-label">Model</label>
              <select className="form-input" value={aiModel} onChange={e => { setAiModel(e.target.value); setStoredModel(e.target.value); }}>
                <option value="gemini-2.5-pro">Gemini 2.5 Pro (Khuyên dùng)</option>
                <option value="gemini-2.0-flash">Gemini 2.0 Flash (Nhanh)</option>
              </select>
            </div>
            <div className="form-group" style={{ marginTop: '12px' }}>
              <label className="form-label">Thông tin bổ sung cho AI (kỳ này)</label>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', margin: '0 0 6px 0' }}>
                Note họp, feedback thị trường, bối cảnh ngoài số liệu hệ thống... AI sẽ đọc và lồng ghép vào mọi phần phân tích (nhận xét, điểm nghẽn, đề xuất, comment khách hàng).
              </p>
              <textarea className="form-input" value={additionalContextText} onChange={e => setAdditionalContextText(e.target.value)}
                rows={4} placeholder="VD: Tháng này có đợt campaign tiêm chủng mùa hè, ảnh hưởng tăng đột biến task Multimedia..."
                style={{ width: '100%', fontSize: '0.85rem', lineHeight: 1.5, fontFamily: 'inherit' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button className="btn btn-primary" onClick={() => setShowAISettings(false)}>Xong</button>
            </div>
          </div>
        </div>
      )}

      {/* 2. AI Full Report Review Modal */}
      {showAIReview && aiReviewData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="card" style={{ width: '800px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a' }}>
                <Bot size={20} color="#10b981" /> Kết quả phân tích AI
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAIReview(false)}><X size={18} /></button>
            </div>
            
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <h4 style={{ color: '#4c1d95', margin: '0 0 8px 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}><Sparkles size={16}/> Nhận xét tổng quan</h4>
                <div style={{ padding: '16px', background: '#f5f3ff', borderRadius: '8px', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{aiReviewData.insights}</div>
              </div>
              
              <div>
                <h4 style={{ color: '#7f1d1d', margin: '0 0 8px 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}><AlertTriangle size={16}/> Điểm nghẽn</h4>
                <div style={{ padding: '16px', background: '#fef2f2', borderRadius: '8px', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{aiReviewData.bottleneck}</div>
              </div>
              
              <div>
                <h4 style={{ color: '#1e40af', margin: '0 0 8px 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}><TrendingUp size={16}/> Đề xuất</h4>
                <div style={{ padding: '16px', background: '#eff6ff', borderRadius: '8px', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{aiReviewData.recommendation}</div>
              </div>

              {aiReviewData.customerCommentAnalysis && (
                <div>
                  <h4 style={{ color: '#334155', margin: '0 0 8px 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}><MessageSquare size={16}/> Phân tích Comment khách hàng</h4>
                  <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{aiReviewData.customerCommentAnalysis.text}</div>
                </div>
              )}

              {aiReviewData.nextPlan && (
                <div>
                  <h4 style={{ color: '#064e3b', margin: '0 0 8px 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}><Compass size={16}/> Kế hoạch kỳ tới</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ padding: '12px', background: '#ecfdf5', borderRadius: '8px', fontSize: '0.85rem' }}><b>Định hướng:</b><br/><span style={{whiteSpace: 'pre-wrap'}}>{aiReviewData.nextPlan.general}</span></div>
                    <div style={{ padding: '12px', background: '#ecfdf5', borderRadius: '8px', fontSize: '0.85rem' }}><b>Mục tiêu:</b><br/><span style={{whiteSpace: 'pre-wrap'}}>{aiReviewData.nextPlan.goals}</span></div>
                    <div style={{ padding: '12px', background: '#ecfdf5', borderRadius: '8px', fontSize: '0.85rem' }}><b>Chủ đề focus:</b><br/><span style={{whiteSpace: 'pre-wrap'}}>{aiReviewData.nextPlan.topics}</span></div>
                    <div style={{ padding: '12px', background: '#ecfdf5', borderRadius: '8px', fontSize: '0.85rem' }}><b>Phát triển đội ngũ:</b><br/><span style={{whiteSpace: 'pre-wrap'}}>{aiReviewData.nextPlan.team}</span></div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#f8fafc' }}>
              <button className="btn btn-secondary" onClick={() => setShowAIReview(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={applyAIReview} style={{ background: '#10b981', borderColor: '#10b981' }}>
                <CheckCircle size={16} /> Áp dụng vào báo cáo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. AI Chat Modal */}
      {showAIChat && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="card" style={{ width: '600px', maxWidth: '95vw', height: '80vh', display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0fdf4' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontSize: '1.1rem' }}>
                <MessageSquare size={18} /> Trợ lý AI
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAIChat(false)} style={{ color: '#166534' }}><X size={18} /></button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', background: '#f8fafc' }}>
              {chatMessages.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', marginTop: '40px' }}>
                  <Bot size={48} style={{ opacity: 0.2, marginBottom: '12px' }} />
                  <p>Hỏi AI bất kỳ thông tin nào về báo cáo kỳ này.</p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '16px' }}>
                    <span className="badge" style={{ cursor: 'pointer' }} onClick={() => setChatInput('Team nào đang có hiệu suất tốt nhất?')}>Team nào tốt nhất?</span>
                    <span className="badge" style={{ cursor: 'pointer' }} onClick={() => setChatInput('Có rủi ro gì về chất lượng không?')}>Phân tích chất lượng</span>
                  </div>
                </div>
              ) : (
                chatMessages.map((msg, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{ 
                      maxWidth: '85%', padding: '12px 16px', borderRadius: '12px',
                      background: msg.role === 'user' ? '#10b981' : '#fff',
                      color: msg.role === 'user' ? '#fff' : '#0f172a',
                      boxShadow: msg.role === 'model' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: 1.5
                    }}>
                      {msg.text}
                    </div>
                  </div>
                ))
              )}
              {chatLoading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ padding: '12px 16px', borderRadius: '12px', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <Loader2 size={16} className="spin" color="#10b981" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div style={{ padding: '16px', borderTop: '1px solid #e2e8f0', background: '#fff' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="text" className="form-input" style={{ flex: 1 }} 
                  placeholder="Hỏi AI về số liệu báo cáo..." 
                  value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                  disabled={chatLoading}
                />
                <button className="btn btn-primary" onClick={handleSendChat} disabled={!chatInput.trim() || chatLoading}
                  style={{ background: '#10b981', borderColor: '#10b981', padding: '0 16px' }}>
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═════════════════════════════════ Sub-components ═════════════════ */

function StatCard({ icon, label, value, delta, gradient, accent, border, subtitle, isEditing, onValueChange, onClickDetails }: {
  icon: React.ReactNode | string; label: string; value: string | number; delta?: number;
  gradient: string; accent: string; border: string; subtitle?: string;
  isEditing?: boolean; onValueChange?: (val: string) => void;
  onClickDetails?: () => void;
}) {
  return (
    <div className="card" onClick={onClickDetails && !isEditing ? onClickDetails : undefined} style={{
      padding: '18px 20px', background: gradient, border: `1px solid ${border}`,
      position: 'relative', overflow: 'hidden', cursor: onClickDetails && !isEditing ? 'pointer' : 'default',
      transition: 'all 0.2s',
    }}
    onMouseEnter={e => { if (onClickDetails && !isEditing) e.currentTarget.style.transform = 'translateY(-2px)' }}
    onMouseLeave={e => { if (onClickDetails && !isEditing) e.currentTarget.style.transform = 'translateY(0)' }}>
      <div style={{ position: 'absolute', right: -10, top: -10, width: 60, height: 60, borderRadius: '50%',
        background: `${accent}08`, pointerEvents: 'none' }} />
      <div style={{ fontSize: '1.3rem', marginBottom: '4px' }}>{icon}</div>
      {isEditing && onValueChange ? (
        <input type="text" value={value} onChange={e => onValueChange(e.target.value)} onClick={e => e.stopPropagation()}
               style={{ width: '100%', fontSize: '1.4rem', fontWeight: 800, color: accent, background: 'rgba(255,255,255,0.8)', border: `1px solid ${accent}`, borderRadius: '4px', padding: '0 4px', marginBottom: '2px' }} />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: accent, lineHeight: 1.1 }}>{value}</div>
          {onClickDetails && <ExternalLink size={14} style={{ color: accent, opacity: 0.5 }} />}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{label}</span>
        {delta !== undefined && <DeltaBadge value={delta} />}
      </div>
      {subtitle && <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '3px' }}>{subtitle}</div>}
    </div>
  );
}

function ChartHeader({ icon, title, color }: { icon: React.ReactNode; title: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
      <div style={{ padding: '6px', borderRadius: 'var(--radius-sm)', background: `linear-gradient(135deg,${color},${color}cc)` }}>
        {icon}
      </div>
      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{title}</span>
    </div>
  );
}

function EmptyChart() {
  return (
    <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '8px' }}>
      <BarChart3 size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.3 }} />
      <span style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>Chưa có dữ liệu trong kỳ này</span>
    </div>
  );
}

/* ═════════════════════════════════ HTML Exports ═════════════════ */

interface ReportHtmlData {
  title: string; periodLabel: string;
  stats: any; qualityStats: any;
  teamBreakdown: [string, { links: number; points: number }][];
  tasksBreakdown: { type: string; details: { name: string; links: number; points: number }[] }[];
  topEmployees: { name: string; links: number; points: number; qcAvg: number }[];
  projectProgress: { name: string; progress: number; periodLinks: number }[];
  projectsFocus: { name: string; type: string; links: number }[];
  insights: string;
  bottleneck: string;
  customerCommentAnalysis?: string;
  driveLink?: string;
  qc_driveLink?: string;
  nextPlan?: {
    general: string;
    goals: string;
    topics: string;
    team: string;
    team_baiviet: string;
    team_sanpham: string;
    team_multimedia: string;
  };
}

function buildPeriodicReportHtml(data: ReportHtmlData): string {
  const deltaIcon = (v: number) => v > 0 ? `<span style="color:#16a34a;font-weight:700">▲ +${v}%</span>` : v < 0 ? `<span style="color:#dc2626;font-weight:700">▼ ${v}%</span>` : `<span style="color:#64748b">— 0%</span>`;

  const statCard = (icon: string, label: string, value: string | number, delta?: number, color = '#6366f1') =>
    `<div style="flex:1;min-width:140px;padding:20px;background:#f8fafc;border-radius:12px;text-align:center;border:1px solid #e2e8f0">
      <div style="font-size:1.5rem;margin-bottom:4px">${icon}</div>
      <div style="font-size:1.8rem;font-weight:800;color:${color}">${value}</div>
      <div style="font-size:0.82rem;color:#64748b;margin-top:4px">${label}</div>
      ${delta !== undefined ? `<div style="margin-top:4px">${deltaIcon(delta)}</div>` : ''}
    </div>`;

  const progressBar = (pct: number) => {
    const c = pct >= 80 ? '#16a34a' : pct >= 50 ? '#6366f1' : '#dc2626';
    return `<div style="display:flex;align-items:center;gap:10px">
      <div style="flex:1;height:10px;border-radius:999px;background:#e5e7eb;overflow:hidden">
        <div style="height:100%;width:${Math.min(pct, 100)}%;border-radius:999px;background:${c}"></div>
      </div>
      <span style="font-weight:800;color:${c};min-width:40px;text-align:right">${pct}%</span>
    </div>`;
  };

  const teamRows = data.teamBreakdown.map(([team, v]) => {
    const totalPts = data.teamBreakdown.reduce((s, [, d]) => s + d.points, 0);
    const p = totalPts > 0 ? Math.round((v.points / totalPts) * 100) : 0;
    return `<tr>
      <td style="padding:10px;border-bottom:1px solid #f1f5f9"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${TEAM_COLORS[team] || '#64748b'};margin-right:8px"></span>${team}</td>
      <td style="padding:10px;text-align:center;border-bottom:1px solid #f1f5f9;font-weight:700">${v.links}</td>
      <td style="padding:10px;text-align:center;border-bottom:1px solid #f1f5f9;font-weight:700;color:#16a34a">${v.points.toFixed(1)}</td>
      <td style="padding:10px;text-align:center;border-bottom:1px solid #f1f5f9;font-weight:700;color:#6366f1">${p}%</td>
    </tr>`;
  }).join('');

  const empRows = data.topEmployees.slice(0, 10).map((e, i) =>
    `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-weight:600">${i + 1}. ${e.name}</td>
      <td style="padding:8px 10px;text-align:center;border-bottom:1px solid #f1f5f9">${e.links}</td>
      <td style="padding:8px 10px;text-align:center;border-bottom:1px solid #f1f5f9;font-weight:700;color:#6366f1">${e.points.toFixed(1)}</td>
      <td style="padding:8px 10px;text-align:center;border-bottom:1px solid #f1f5f9;font-weight:700;color:#0f766e">${e.qcAvg.toFixed(1)}</td>
    </tr>`
  ).join('');

  const projRows = data.projectProgress.map(p =>
    `<div style="padding:10px 0;border-bottom:1px solid #f1f5f9">
      <div style="font-weight:600;margin-bottom:6px">${p.name} <span style="font-size:0.82rem;color:#94a3b8">(${p.periodLinks} link kỳ này)</span></div>
      ${progressBar(p.progress)}
    </div>`
  ).join('');

  const taskRows = data.tasksBreakdown.flatMap((t, typeIdx) => 
    t.details.map((detail, idx) => `<tr>
      ${idx === 0 ? `<td rowspan="${t.details.length}" style="padding:10px;border-bottom:1px solid #f1f5f9;border-right:1px solid #f1f5f9;font-weight:700;vertical-align:top"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${CHART_PALETTE[typeIdx % CHART_PALETTE.length]};margin-right:8px"></span>${t.type}</td>` : ''}
      <td style="padding:10px;border-bottom:1px solid #f1f5f9">${detail.name}</td>
      <td style="padding:10px;text-align:center;border-bottom:1px solid #f1f5f9;font-weight:700">${detail.links}</td>
      <td style="padding:10px;text-align:center;border-bottom:1px solid #f1f5f9;font-weight:700;color:#6366f1">${detail.points.toFixed(1)}</td>
    </tr>`)
  ).join('');

  const projFocusRows = data.projectsFocus.map(p => 
    `<tr>
      <td style="padding:10px;border-bottom:1px solid #f1f5f9;font-weight:600">${p.name}</td>
      <td style="padding:10px;border-bottom:1px solid #f1f5f9;font-size:0.8rem;color:#64748b">${p.type}</td>
      <td style="padding:10px;text-align:center;border-bottom:1px solid #f1f5f9;font-weight:700">${p.links}</td>
    </tr>`
  ).join('');

  return `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${data.title}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#1e293b;background:#fff;padding:40px;max-width:960px;margin:0 auto;line-height:1.6}
  @media print{body{padding:20px}button{display:none!important}}
  table{width:100%;border-collapse:collapse;font-size:0.88rem}
  thead tr{background:#f8fafc}
  th{padding:10px;text-align:left;font-weight:700;font-size:0.82rem;color:#64748b;text-transform:uppercase;letter-spacing:0.5px}
  h2{font-size:1.1rem;font-weight:800;color:#0f172a;margin:28px 0 14px;display:flex;align-items:center;gap:8px}
</style></head><body>
<div style="text-align:center;margin-bottom:36px;padding:32px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:16px;color:#fff">
  <h1 style="font-size:1.6rem;font-weight:800;margin-bottom:4px">${data.title}</h1>
  <p style="opacity:.8">${data.periodLabel}</p>
  <p style="opacity:.5;font-size:0.78rem;margin-top:4px">Xuất lúc: ${new Date().toLocaleString('vi-VN')}</p>
</div>

<h2>📊 Tổng quan</h2>
<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:28px">
  ${statCard('🔗', 'Tổng link', data.stats.totalLinks, data.stats.deltaLinks, '#6366f1')}
  ${statCard('⭐', 'Tổng điểm', data.stats.totalPoints.toFixed(0), data.stats.deltaPoints, '#f59e0b')}
  ${statCard('📥', 'Lượt submit', data.stats.totalSubmits, data.stats.deltaSubmits, '#10b981')}
  ${statCard('👥', 'Nhân viên', data.stats.employeeCount, undefined, '#8b5cf6')}
</div>

<h2>👥 Phân bổ theo team</h2>
<table style="margin-bottom:28px">
  <thead><tr><th>Team</th><th style="text-align:center;width:80px">Link</th><th style="text-align:center;width:80px">Điểm</th><th style="text-align:center;width:80px">Tỷ lệ</th></tr></thead>
  <tbody>${teamRows}</tbody>
</table>

<h2>🏆 Top nhân viên & QC</h2>
<table style="margin-bottom:28px">
  <thead><tr><th>Nhân viên</th><th style="text-align:center;width:80px">Link</th><th style="text-align:center;width:80px">Điểm</th><th style="text-align:center;width:80px">QC (/5)</th></tr></thead>
  <tbody>${empRows}</tbody>
</table>

<h2>🛡️ Đánh giá Chất lượng & Compliance</h2>
${data.driveLink ? `<div style="margin-bottom:16px"><a href="${data.driveLink}" target="_blank" style="color:#0ea5e9;font-weight:600;text-decoration:none">🔗 Xem file Quản lý Chi tiết (Google Drive/Excel)</a></div>` : ''}
${data.qc_driveLink ? `<div style="margin-bottom:16px"><a href="${data.qc_driveLink}" target="_blank" style="color:#0ea5e9;font-weight:600;text-decoration:none">🔗 Xem file QC Chi tiết</a></div>` : ''}
<table style="margin-bottom:28px">
  <thead><tr><th>Chỉ số</th><th style="text-align:center;width:150px">Kết quả</th></tr></thead>
  <tbody>
    <tr><td style="padding:10px;border-bottom:1px solid #f1f5f9;font-weight:600">Số lượt đánh giá</td><td style="padding:10px;text-align:center;border-bottom:1px solid #f1f5f9;font-weight:700">${data.qualityStats.totalReviews}</td></tr>
    <tr><td style="padding:10px;border-bottom:1px solid #f1f5f9;font-weight:600">Tổng điểm trung bình</td><td style="padding:10px;text-align:center;border-bottom:1px solid #f1f5f9;font-weight:700">${data.qualityStats.avgScore.toFixed(1)}/5</td></tr>
    <tr><td style="padding:10px;border-bottom:1px solid #f1f5f9;font-weight:600">Tổng lượt comment</td><td style="padding:10px;text-align:center;border-bottom:1px solid #f1f5f9;font-weight:700">${data.qualityStats.totalComments}</td></tr>
    <tr><td style="padding:10px;border-bottom:1px solid #f1f5f9;font-weight:600">% Tích cực / Tiêu cực</td><td style="padding:10px;text-align:center;border-bottom:1px solid #f1f5f9;font-weight:700">${data.qualityStats.pctPositive}% / ${data.qualityStats.pctNegative}%</td></tr>
  </tbody>
</table>

${data.customerCommentAnalysis ? `
<h2>💬 Phân tích Comment khách hàng</h2>
<div style="padding:18px 20px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:0.9rem;line-height:1.8;white-space:pre-wrap;color:#1e293b;margin-bottom:28px">
${data.customerCommentAnalysis}
</div>
` : ''}

<h2>📋 Chi tiết đầu việc</h2>
<table style="margin-bottom:28px">
  <thead><tr><th>Đầu việc</th><th>Chi tiết đầu việc</th><th style="text-align:center;width:80px">Link</th><th style="text-align:center;width:80px">Điểm</th></tr></thead>
  <tbody>${taskRows || '<tr><td colspan="4" style="text-align:center;color:#94a3b8">Không có dữ liệu</td></tr>'}</tbody>
</table>

<h2>🔥 Top dự án focus trong tháng</h2>
<table style="margin-bottom:28px">
  <thead><tr><th>Dự án</th><th>Type</th><th style="text-align:center;width:80px">Link</th></tr></thead>
  <tbody>${projFocusRows || '<tr><td colspan="3" style="text-align:center;color:#94a3b8">Không có dữ liệu</td></tr>'}</tbody>
</table>

<h2>📦 Tiến độ dự án</h2>
<div style="margin-bottom:28px">${projRows || '<p style="color:#94a3b8">Không có dự án đang chạy</p>'}</div>

<h2>💡 Nhận xét tự động</h2>
<div style="padding:18px 20px;border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;font-size:0.9rem;line-height:1.8;white-space:pre-wrap;color:#1e3a8a;margin-bottom:28px">
${data.insights}
</div>

${data.nextPlan ? `
<h2>🧭 Kế hoạch triển khai kỳ tới</h2>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px">
    <div style="color:#0f172a;font-weight:700;margin-bottom:8px">Định hướng chung</div>
    <div style="font-size:0.85rem;line-height:1.6;color:#334155;white-space:pre-wrap">${data.nextPlan.general}</div>
  </div>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px">
    <div style="color:#0f172a;font-weight:700;margin-bottom:8px">Mục tiêu nội dung</div>
    <div style="font-size:0.85rem;line-height:1.6;color:#334155;white-space:pre-wrap">${data.nextPlan.goals}</div>
  </div>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px">
    <div style="color:#0f172a;font-weight:700;margin-bottom:8px">Chủ đề Focus</div>
    <div style="font-size:0.85rem;line-height:1.6;color:#334155;white-space:pre-wrap">${data.nextPlan.topics}</div>
  </div>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px">
    <div style="color:#0f172a;font-weight:700;margin-bottom:8px">Phát triển đội ngũ</div>
    <div style="font-size:0.85rem;line-height:1.6;color:#334155;white-space:pre-wrap">${data.nextPlan.team}</div>
  </div>
</div>

<h3 style="font-size:1rem;margin-bottom:12px;color:#0f172a">Công việc cụ thể theo Team</h3>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:28px">
  <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:16px">
    <div style="color:#0369a1;font-weight:700;margin-bottom:8px">📝 Team Bài viết</div>
    <div style="font-size:0.85rem;line-height:1.6;color:#0c4a6e;white-space:pre-wrap">${data.nextPlan.team_baiviet}</div>
  </div>
  <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;padding:16px">
    <div style="color:#6d28d9;font-weight:700;margin-bottom:8px">📦 Team Sản phẩm</div>
    <div style="font-size:0.85rem;line-height:1.6;color:#4c1d95;white-space:pre-wrap">${data.nextPlan.team_sanpham}</div>
  </div>
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px">
    <div style="color:#b45309;font-weight:700;margin-bottom:8px">🎨 Team Multimedia</div>
    <div style="font-size:0.85rem;line-height:1.6;color:#78350f;white-space:pre-wrap">${data.nextPlan.team_multimedia}</div>
  </div>
</div>
` : ''}


<div style="text-align:center;padding-top:20px;border-top:1px solid #e2e8f0">
  <p style="font-size:0.75rem;color:#94a3b8">Long Châu Content Studio · Content Ecom LC Dashboard</p>
  <button onclick="window.print()" style="margin-top:10px;padding:10px 24px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer;font-size:0.88rem;font-weight:600">🖨 In báo cáo</button>
</div>
</body></html>`;
}

/* ── Presentation-style HTML (landscape slides) ── */

function buildPresentationHtml(data: ReportHtmlData): string {
  const deltaBadge = (v: number) => v > 0 ? `<span style="color:#16a34a;font-size:0.9rem">▲ +${v}%</span>` : v < 0 ? `<span style="color:#dc2626;font-size:0.9rem">▼ ${v}%</span>` : '';

  const slide = (content: string, bg = '#fff') =>
    `<section style="width:100%;min-height:100vh;padding:60px 80px;display:flex;flex-direction:column;justify-content:center;background:${bg};page-break-after:always">${content}</section>`;

  const progressBar = (pct: number) => {
    const c = pct >= 80 ? '#16a34a' : pct >= 50 ? '#6366f1' : '#dc2626';
    return `<div style="flex:1;height:14px;border-radius:999px;background:#e5e7eb;overflow:hidden;min-width:200px">
      <div style="height:100%;width:${Math.min(pct, 100)}%;border-radius:999px;background:${c}"></div>
    </div>
    <span style="font-weight:800;color:${c};font-size:1.1rem">${pct}%</span>`;
  };

  // Slide 1: Title
  const s1 = slide(`
    <div style="text-align:center">
      <h1 style="font-size:2.8rem;font-weight:800;background:linear-gradient(135deg,#6366f1,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:16px">${data.title}</h1>
      <p style="font-size:1.2rem;color:#64748b">${data.periodLabel}</p>
      <p style="font-size:0.9rem;color:#94a3b8;margin-top:8px">Long Châu Content Studio</p>
      <p style="font-size:0.82rem;color:#cbd5e1;margin-top:24px">Xuất lúc: ${new Date().toLocaleString('vi-VN')}</p>
    </div>
  `, 'linear-gradient(135deg,#f8fafc,#eef2ff)');

  // Slide 2: Overview
  const s2 = slide(`
    <h2 style="font-size:1.8rem;font-weight:800;margin-bottom:40px;color:#0f172a">📊 Tổng quan</h2>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:24px">
      <div style="padding:32px;background:#f8fafc;border-radius:16px;text-align:center;border:2px solid #e2e8f0">
        <div style="font-size:2rem">🔗</div>
        <div style="font-size:2.5rem;font-weight:800;color:#6366f1;margin:8px 0">${data.stats.totalLinks}</div>
        <div style="color:#64748b;font-weight:600">Tổng link</div>
        <div style="margin-top:6px">${deltaBadge(data.stats.deltaLinks)}</div>
      </div>
      <div style="padding:32px;background:#f8fafc;border-radius:16px;text-align:center;border:2px solid #e2e8f0">
        <div style="font-size:2rem">⭐</div>
        <div style="font-size:2.5rem;font-weight:800;color:#f59e0b;margin:8px 0">${data.stats.totalPoints.toFixed(0)}</div>
        <div style="color:#64748b;font-weight:600">Tổng điểm</div>
        <div style="margin-top:6px">${deltaBadge(data.stats.deltaPoints)}</div>
      </div>
      <div style="padding:32px;background:#f8fafc;border-radius:16px;text-align:center;border:2px solid #e2e8f0">
        <div style="font-size:2rem">📥</div>
        <div style="font-size:2.5rem;font-weight:800;color:#10b981;margin:8px 0">${data.stats.totalSubmits}</div>
        <div style="color:#64748b;font-weight:600">Lượt submit</div>
      </div>
      <div style="padding:32px;background:#f8fafc;border-radius:16px;text-align:center;border:2px solid #e2e8f0">
        <div style="font-size:2rem">👥</div>
        <div style="font-size:2.5rem;font-weight:800;color:#8b5cf6;margin:8px 0">${data.stats.employeeCount}</div>
        <div style="color:#64748b;font-weight:600">Nhân viên</div>
      </div>
    </div>
  `);

  // Slide 3: Team breakdown
  const teamRows = data.teamBreakdown.map(([team, v]) => {
    const totalPts = data.teamBreakdown.reduce((s, [, d]) => s + d.points, 0);
    const p = totalPts > 0 ? Math.round((v.points / totalPts) * 100) : 0;
    const barW = Math.max(4, p);
    return `<div style="display:flex;align-items:center;gap:16px;padding:14px 0;border-bottom:1px solid #f1f5f9">
      <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${TEAM_COLORS[team] || '#64748b'}"></span>
      <span style="font-weight:700;min-width:200px;font-size:1.1rem">${team}</span>
      <div style="flex:1;height:24px;border-radius:999px;background:#f1f5f9;overflow:hidden">
        <div style="height:100%;width:${barW}%;border-radius:999px;background:${TEAM_COLORS[team] || '#64748b'}"></div>
      </div>
      <span style="font-weight:800;min-width:50px;text-align:right;font-size:1.1rem;color:${TEAM_COLORS[team] || '#64748b'}">${p}%</span>
      <span style="color:#94a3b8;min-width:120px;text-align:right">${v.links}L · ${v.points.toFixed(0)}đ</span>
    </div>`;
  }).join('');

  const s3 = slide(`
    <h2 style="font-size:1.8rem;font-weight:800;margin-bottom:40px;color:#0f172a">👥 Phân bổ theo team</h2>
    ${teamRows}
  `);

  // Slide 4: Top employees & QC
  const empRows = data.topEmployees.slice(0, 8).map((e, i) =>
    `<div style="display:flex;align-items:center;gap:16px;padding:12px 0;border-bottom:1px solid #f1f5f9">
      <span style="width:32px;height:32px;border-radius:50%;background:${CHART_PALETTE[i % CHART_PALETTE.length]};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.9rem;flex-shrink:0">${i + 1}</span>
      <span style="font-weight:700;flex:1;font-size:1.05rem">${e.name}</span>
      <span style="font-weight:600;color:#64748b;margin-right:8px">${e.links} link</span>
      <span style="font-weight:800;color:#6366f1;font-size:1.1rem;margin-right:16px">${e.points.toFixed(0)}đ</span>
      <span style="font-weight:800;color:#0f766e;font-size:1.1rem">QC: ${e.qcAvg.toFixed(1)}</span>
    </div>`
  ).join('');

  const s4 = slide(`
    <h2 style="font-size:1.8rem;font-weight:800;margin-bottom:40px;color:#0f172a">🏆 Top nhân viên</h2>
    ${empRows}
    <h2 style="font-size:1.8rem;font-weight:800;margin-bottom:20px;margin-top:40px;color:#0f172a">🛡️ Chất lượng & Compliance</h2>
    <div style="display:flex;gap:20px">
      <div style="flex:1;background:#f8fafc;padding:20px;border-radius:12px;text-align:center;border:1px solid #e2e8f0"><div style="font-size:1.2rem;color:#64748b">Số lượt đánh giá</div><div style="font-size:1.8rem;font-weight:800;color:#0f766e">${data.qualityStats.totalReviews}</div></div>
      <div style="flex:1;background:#f8fafc;padding:20px;border-radius:12px;text-align:center;border:1px solid #e2e8f0"><div style="font-size:1.2rem;color:#64748b">Điểm trung bình</div><div style="font-size:1.8rem;font-weight:800;color:#0f766e">${data.qualityStats.avgScore.toFixed(1)}/5</div></div>
      <div style="flex:1;background:#f8fafc;padding:20px;border-radius:12px;text-align:center;border:1px solid #e2e8f0"><div style="font-size:1.2rem;color:#64748b">Tổng comment</div><div style="font-size:1.8rem;font-weight:800;color:#475569">${data.qualityStats.totalComments}</div></div>
      <div style="flex:1;background:#f8fafc;padding:20px;border-radius:12px;text-align:center;border:1px solid #e2e8f0"><div style="font-size:1.2rem;color:#64748b">Tích cực / Tiêu cực</div><div style="font-size:1.8rem;font-weight:800;color:#b91c1c">${data.qualityStats.pctPositive}% / ${data.qualityStats.pctNegative}%</div></div>
    </div>
  `);

  // Slide 5: Project progress
  const projRows = data.projectProgress.slice(0, 8).map(p =>
    `<div style="display:flex;align-items:center;gap:16px;padding:14px 0;border-bottom:1px solid #f1f5f9">
      <span style="font-weight:700;min-width:220px;font-size:1.05rem">${p.name}</span>
      ${progressBar(p.progress)}
      <span style="color:#94a3b8;font-size:0.9rem;min-width:80px;text-align:right">${p.periodLinks} link</span>
    </div>`
  ).join('');

  const s5 = slide(`
    <h2 style="font-size:1.8rem;font-weight:800;margin-bottom:40px;color:#0f172a">📦 Tiến độ dự án</h2>
    ${projRows || '<p style="color:#94a3b8;font-size:1.1rem">Không có dự án đang chạy</p>'}
  `);

  // Slide 5.1: Tasks Breakdown
  const taskRows = data.tasksBreakdown.flatMap((t, typeIdx) => 
    t.details.map((detail, idx) => `<div style="display:flex;align-items:center;gap:16px;padding:12px 0;border-bottom:1px solid #f1f5f9">
      <span style="font-weight:700;min-width:180px;font-size:1.1rem;color:${idx === 0 ? CHART_PALETTE[typeIdx % CHART_PALETTE.length] : 'transparent'}">${idx === 0 ? t.type : ''}</span>
      <span style="flex:1;font-size:1.05rem;color:#475569">${detail.name}</span>
      <span style="font-weight:600;min-width:100px;text-align:right">${detail.links} link</span>
      <span style="font-weight:800;color:#6366f1;font-size:1.1rem;min-width:100px;text-align:right">${detail.points.toFixed(1)}đ</span>
    </div>`)
  ).join('');

  const s5_1 = slide(`
    <h2 style="font-size:1.8rem;font-weight:800;margin-bottom:40px;color:#0f172a">📋 Chi tiết đầu việc</h2>
    ${taskRows || '<p style="color:#94a3b8;font-size:1.1rem">Không có dữ liệu</p>'}
  `);

  // Slide 5.2: Projects Focus
  const projFocusRows = data.projectsFocus.slice(0, 8).map((p, i) => 
    `<div style="display:flex;align-items:center;gap:16px;padding:12px 0;border-bottom:1px solid #f1f5f9">
      <span style="width:14px;height:14px;border-radius:50%;background:${CHART_PALETTE[i % CHART_PALETTE.length]}"></span>
      <span style="font-weight:700;flex:1;font-size:1.1rem">${p.name}</span>
      <span style="font-size:0.9rem;color:#64748b;min-width:140px">${p.type}</span>
      <span style="font-weight:600;min-width:100px;text-align:right">${p.links} link</span>
    </div>`
  ).join('');

  const s5_2 = slide(`
    <h2 style="font-size:1.8rem;font-weight:800;margin-bottom:40px;color:#0f172a">🔥 Top dự án focus trong tháng</h2>
    ${projFocusRows || '<p style="color:#94a3b8;font-size:1.1rem">Không có dữ liệu</p>'}
  `);

  // Slide 5.3: Customer Comment Analysis
  const s5_3 = data.customerCommentAnalysis ? slide(`
    <h2 style="font-size:1.8rem;font-weight:800;margin-bottom:40px;color:#0f172a">💬 Phân tích Comment khách hàng</h2>
    <div style="padding:28px;border-radius:16px;background:#f8fafc;border:2px solid #e2e8f0;font-size:1.05rem;line-height:1.8;white-space:pre-wrap;color:#1e293b">
${data.customerCommentAnalysis}
    </div>
  `) : '';

  // Slide 6: Insights & Bottleneck
  const s6 = slide(`
    <h2 style="font-size:1.8rem;font-weight:800;margin-bottom:40px;color:#0f172a">💡 Nhận xét & Đề xuất</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
      <div style="padding:28px;border-radius:16px;background:#eff6ff;border:2px solid #bfdbfe;font-size:1.05rem;line-height:1.8;white-space:pre-wrap;color:#1e3a8a">
        <h3 style="margin-bottom:12px;font-size:1.3rem;font-weight:800;color:#1e40af">Tổng quan</h3>
${data.insights}
      </div>
      <div style="padding:28px;border-radius:16px;background:#fef2f2;border:2px solid #fecaca;font-size:1.05rem;line-height:1.8;white-space:pre-wrap;color:#7f1d1d">
        <h3 style="margin-bottom:12px;font-size:1.3rem;font-weight:800;color:#991b1b">Điểm nghẽn</h3>
${data.bottleneck}
      </div>
    </div>
  `, 'linear-gradient(135deg,#fffbeb,#fef3c7)');

  // Slide 6.5a: Next Plan Overview
  const s6_5a = data.nextPlan ? slide(`
    <h2 style="font-size:1.8rem;font-weight:800;margin-bottom:40px;color:#0f172a">🧭 Kế hoạch triển khai kỳ tới</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
      <div style="padding:28px;border-radius:16px;background:#f8fafc;border:2px solid #e2e8f0;font-size:1.05rem;line-height:1.8;color:#334155;white-space:pre-wrap">
        <h3 style="margin-bottom:12px;font-size:1.3rem;font-weight:800;color:#0f172a">Định hướng chung</h3>
${data.nextPlan.general}
      </div>
      <div style="padding:28px;border-radius:16px;background:#f8fafc;border:2px solid #e2e8f0;font-size:1.05rem;line-height:1.8;color:#334155;white-space:pre-wrap">
        <h3 style="margin-bottom:12px;font-size:1.3rem;font-weight:800;color:#0f172a">Mục tiêu nội dung</h3>
${data.nextPlan.goals}
      </div>
      <div style="padding:28px;border-radius:16px;background:#f8fafc;border:2px solid #e2e8f0;font-size:1.05rem;line-height:1.8;color:#334155;white-space:pre-wrap">
        <h3 style="margin-bottom:12px;font-size:1.3rem;font-weight:800;color:#0f172a">Chủ đề Focus</h3>
${data.nextPlan.topics}
      </div>
      <div style="padding:28px;border-radius:16px;background:#f8fafc;border:2px solid #e2e8f0;font-size:1.05rem;line-height:1.8;color:#334155;white-space:pre-wrap">
        <h3 style="margin-bottom:12px;font-size:1.3rem;font-weight:800;color:#0f172a">Phát triển đội ngũ</h3>
${data.nextPlan.team}
      </div>
    </div>
  `) : '';

  // Slide 6.5b: Next Plan Teams
  const s6_5b = data.nextPlan ? slide(`
    <h2 style="font-size:1.8rem;font-weight:800;margin-bottom:40px;color:#0f172a">🎯 Công việc cụ thể theo Team</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">
      <div style="padding:28px;border-radius:16px;background:#f0f9ff;border:2px solid #bae6fd;font-size:1.05rem;line-height:1.8;color:#0c4a6e;white-space:pre-wrap">
        <h3 style="margin-bottom:12px;font-size:1.3rem;font-weight:800;color:#0369a1">📝 Team Bài viết</h3>
${data.nextPlan.team_baiviet}
      </div>
      <div style="padding:28px;border-radius:16px;background:#f5f3ff;border:2px solid #ddd6fe;font-size:1.05rem;line-height:1.8;color:#4c1d95;white-space:pre-wrap">
        <h3 style="margin-bottom:12px;font-size:1.3rem;font-weight:800;color:#6d28d9">📦 Team Sản phẩm</h3>
${data.nextPlan.team_sanpham}
      </div>
      <div style="padding:28px;border-radius:16px;background:#fffbeb;border:2px solid #fde68a;font-size:1.05rem;line-height:1.8;color:#78350f;white-space:pre-wrap">
        <h3 style="margin-bottom:12px;font-size:1.3rem;font-weight:800;color:#b45309">🎨 Team Multimedia</h3>
${data.nextPlan.team_multimedia}
      </div>
    </div>
  `) : '';

  // Slide 7: Thank you
  const s7 = slide(`
    <div style="text-align:center">
      <div style="font-size:4rem;margin-bottom:20px">🎯</div>
      <h2 style="font-size:2.2rem;font-weight:800;background:linear-gradient(135deg,#6366f1,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Cảm ơn đã theo dõi!</h2>
      <p style="font-size:1.1rem;color:#64748b;margin-top:12px">Long Châu Content Studio · ${data.periodLabel}</p>
    </div>
  `, 'linear-gradient(135deg,#f8fafc,#eef2ff)');

  return `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${data.title} — Presentation</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#1e293b;background:#f1f5f9}
  @media print{
    section{page-break-after:always!important;min-height:auto!important;height:100vh}
    nav{display:none!important}
  }
  nav{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:999;
    padding:8px 16px;background:rgba(15,23,42,.85);backdrop-filter:blur(8px);border-radius:999px}
  nav button{padding:6px 14px;border:none;border-radius:999px;cursor:pointer;font-size:0.82rem;font-weight:600;
    background:rgba(255,255,255,.15);color:#fff;transition:all .2s}
  nav button:hover{background:rgba(255,255,255,.3)}
</style></head><body>
${s1}${s2}${s3}${s4}${s5}${s5_1}${s5_2}${s5_3}${s6}${s6_5a}${s6_5b}${s7}
<nav>
  <button onclick="window.print()">🖨 In</button>
  <button onclick="scrollBy({top:-window.innerHeight,behavior:'smooth'})">▲ Trước</button>
  <button onclick="scrollBy({top:window.innerHeight,behavior:'smooth'})">▼ Sau</button>
</nav>
</nav>
</body></html>`;
}

function DrillDownModal({ data, onClose }: { data: { title: string; subs: any[] }; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '900px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-secondary)' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            {data.title} <span style={{ fontSize: '0.9rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>({data.subs.reduce((s, x) => s + x.links.length, 0)} links)</span>
          </h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={20} /></button>
        </div>
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {data.subs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)' }}>Không có dữ liệu</div>
          ) : (
            <table className="table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ fontSize: '0.85rem' }}>Thời gian</th>
                  <th style={{ fontSize: '0.85rem' }}>Nhân viên</th>
                  <th style={{ fontSize: '0.85rem' }}>Chủ đề/Dự án</th>
                  <th style={{ fontSize: '0.85rem' }}>Loại công việc</th>
                  <th style={{ fontSize: '0.85rem' }}>Links</th>
                </tr>
              </thead>
              <tbody>
                {data.subs.map(s => (
                  <tr key={s.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{new Date(s.submittedAt).toLocaleDateString('vi-VN')}</td>
                    <td style={{ fontWeight: 600, fontSize: '0.85rem' }}>{s.employeeName}</td>
                    <td style={{ fontSize: '0.85rem' }}>{s.taskDetail || s.taskType || '-'}</td>
                    <td style={{ fontSize: '0.85rem' }}>{s.teamGroup}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {s.links.map((url: string, idx: number) => (
                          <a key={idx} href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'none', fontSize: '0.85rem' }} title={url}>
                            Link {idx + 1}
                          </a>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
