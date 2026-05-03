/**
 * Export HTML string as downloadable .html file
 */
export function exportHtmlFile(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.html') ? filename : `${filename}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Build a styled HTML report from report data
 */
export function buildReportHtml(data: {
  title: string;
  period: string;
  overview: { label: string; value: string | number }[];
  taskBreakdown: { team: string; color: string; items: { label: string; links: number; points: number }[] }[];
  projectProgress: { name: string; progress: number; done: number; total: number; notes: string }[];
  insights: string;
  bottlenecks: string;
  managerNotes: string;
  nextPlan: string;
}): string {
  const progressBar = (pct: number) => {
    const c = pct >= 80 ? '#16a34a' : pct >= 50 ? '#2563eb' : '#dc2626';
    return `<div style="background:#e5e7eb;border-radius:4px;height:8px;flex:1;min-width:80px"><div style="background:${c};height:100%;border-radius:4px;width:${Math.min(pct,100)}%"></div></div>`;
  };

  const overviewCards = data.overview.map(o =>
    `<div style="flex:1;min-width:120px;padding:16px;background:#f8fafc;border-radius:8px;text-align:center">
      <div style="font-size:1.4rem;font-weight:800;color:#1e40af">${o.value}</div>
      <div style="font-size:0.8rem;color:#64748b;margin-top:4px">${o.label}</div>
    </div>`
  ).join('');

  const teamSections = data.taskBreakdown.map(t => {
    const totalLinks = t.items.reduce((s, i) => s + i.links, 0);
    const totalPts = t.items.reduce((s, i) => s + i.points, 0);
    const rows = t.items.map(i =>
      `<tr><td style="padding:6px 10px;border-bottom:1px solid #f1f5f9">${i.label}</td>
       <td style="padding:6px 10px;text-align:center;border-bottom:1px solid #f1f5f9;font-weight:600">${i.links}</td>
       <td style="padding:6px 10px;text-align:center;border-bottom:1px solid #f1f5f9;font-weight:600;color:#16a34a">${i.points.toFixed(1)}</td></tr>`
    ).join('');
    return `<div style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="width:10px;height:10px;border-radius:50%;background:${t.color};display:inline-block"></span>
        <strong>${t.team}</strong>
        <span style="color:#94a3b8;font-size:0.82rem">${totalLinks} link · ${totalPts.toFixed(0)}đ</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
        <thead><tr style="background:#f8fafc">
          <th style="padding:6px 10px;text-align:left">Đầu việc</th>
          <th style="padding:6px 10px;text-align:center;width:80px">Link</th>
          <th style="padding:6px 10px;text-align:center;width:80px">Điểm</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join('');

  const projectRows = data.projectProgress.map(p =>
    `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9">
      <span style="font-weight:600;min-width:160px">${p.name}</span>
      ${progressBar(p.progress)}
      <span style="font-weight:700;color:#1e40af;min-width:40px">${p.progress}%</span>
      <span style="color:#94a3b8;font-size:0.82rem;min-width:60px">${p.done}/${p.total}</span>
      ${p.notes ? `<span style="color:#64748b;font-size:0.82rem">${p.notes}</span>` : ''}
    </div>`
  ).join('');

  const section = (icon: string, title: string, content: string, bg = '#f8fafc', border = '#e2e8f0') =>
    content.trim() ? `<div style="padding:14px 16px;border-radius:8px;background:${bg};border:1px solid ${border};margin-bottom:12px">
      <div style="font-weight:600;margin-bottom:6px">${icon} ${title}</div>
      <div style="font-size:0.9rem;line-height:1.6;white-space:pre-wrap">${content}</div>
    </div>` : '';

  return `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${data.title}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#1e293b;background:#fff;padding:32px;max-width:900px;margin:0 auto;line-height:1.5}
  @media print{body{padding:16px}button{display:none!important}}
</style></head><body>
<div style="text-align:center;margin-bottom:28px">
  <h1 style="font-size:1.4rem;font-weight:800;color:#0f172a">${data.title}</h1>
  <p style="color:#64748b;margin-top:4px">${data.period}</p>
  <p style="color:#94a3b8;font-size:0.78rem;margin-top:2px">Xuất lúc: ${new Date().toLocaleString('vi-VN')}</p>
</div>

<h2 style="font-size:1rem;font-weight:700;margin-bottom:10px;color:#334155">📊 Tổng quan</h2>
<div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap">${overviewCards}</div>

<h2 style="font-size:1rem;font-weight:700;margin-bottom:10px;color:#334155">📝 Chi tiết đầu việc theo nhóm</h2>
${teamSections}

<h2 style="font-size:1rem;font-weight:700;margin-bottom:10px;color:#334155;margin-top:24px">📦 Tiến độ dự án</h2>
<div style="margin-bottom:24px">${projectRows || '<p style="color:#94a3b8">Không có dự án</p>'}</div>

${section('💡', 'Nhận xét từ số liệu', data.insights, '#eff6ff', '#bfdbfe')}
${section('🚧', 'Điểm nghẽn hiện tại', data.bottlenecks, '#fef2f2', '#fecaca')}
${section('👤', 'Nhận xét Manager', data.managerNotes, '#f0fdf4', '#bbf7d0')}
${section('📋', 'Kế hoạch tuần/tháng tới', data.nextPlan, '#faf5ff', '#e9d5ff')}

<div style="text-align:center;margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0">
  <p style="font-size:0.75rem;color:#94a3b8">Long Châu Content Studio · Content Ecom LC Dashboard</p>
  <button onclick="window.print()" style="margin-top:8px;padding:8px 20px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer;font-size:0.85rem">🖨 In báo cáo</button>
</div>
</body></html>`;
}
