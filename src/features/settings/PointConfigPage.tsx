import { useState, useMemo } from 'react';
import { useAppStore } from '@/shared/store/appStore';
import { defaultTaskCategories } from '@/shared/data/mockData';
import {
  Calculator, Plus, Edit3, Trash2, X, Save,
  CheckCircle, AlertCircle, Zap, Layers, Hash, Settings2
} from 'lucide-react';
import type { TaskPointRule, KPIScaleConfig } from '@/shared/types';
import { DEFAULT_KPI_SCALE_CONFIG } from '@/shared/types';
import { makeId } from '@/shared/utils/helpers';
import toast from 'react-hot-toast';

export default function PointConfigPage() {
  const { taskPointRules, kpiEntries, addTaskPointRule, updateTaskPointRule, deleteTaskPointRule,
          scaleConfig, setScaleConfig, currentUser } = useAppStore();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<TaskPointRule | null>(null);
  const [showScaleForm, setShowScaleForm] = useState(false);
  const isManager = currentUser?.role === 'Manager';

  // Tìm tất cả unique taskDetail từ KPI entries để suggest
  const knownTaskDetails = useMemo(() => {
    const set = new Set<string>();
    kpiEntries.forEach(e => {
      if (e.taskDetail) set.add(e.taskDetail);
      if (e.taskType) set.add(e.taskType);
    });
    return Array.from(set).sort();
  }, [kpiEntries]);

  // Tính preview: bao nhiêu link khớp mỗi rule
  const ruleStats = useMemo(() => {
    const stats: Record<string, number> = {};
    for (const rule of taskPointRules) {
      const matchCount = kpiEntries.reduce((sum, e) => {
        const matches =
          (e.taskDetail && rule.taskLabel.toLowerCase() === e.taskDetail.toLowerCase()) ||
          (e.taskType && e.taskType.toLowerCase().includes(rule.taskLabel.toLowerCase()));
        return sum + (matches ? e.links.length : 0);
      }, 0);
      stats[rule.id] = matchCount;
    }
    return stats;
  }, [taskPointRules, kpiEntries]);

  // Nhóm rules theo category
  const groupedRules = useMemo(() => {
    const groups: { category: string; teamName: string; color: string; rules: TaskPointRule[] }[] = [];
    const categoryOrder = defaultTaskCategories.map(c => c.taskTypeName);

    // Nhóm theo category
    const catMap = new Map<string, TaskPointRule[]>();
    for (const rule of taskPointRules) {
      const cat = rule.category || 'Khác';
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat)!.push(rule);
    }

    // Sắp xếp theo thứ tự category chuẩn
    for (const catName of categoryOrder) {
      const rules = catMap.get(catName);
      if (rules && rules.length > 0) {
        const catDef = defaultTaskCategories.find(c => c.taskTypeName === catName);
        groups.push({
          category: catName,
          teamName: catDef?.teamName || catName,
          color: catDef?.color || '#94A3B8',
          rules,
        });
        catMap.delete(catName);
      }
    }
    // Rules không thuộc category nào
    for (const [catName, rules] of catMap) {
      groups.push({
        category: catName,
        teamName: catName,
        color: '#94A3B8',
        rules,
      });
    }
    return groups;
  }, [taskPointRules]);

  // Tổng hợp team stats
  const teamStats = useMemo(() => {
    const teams: Record<string, { count: number; links: number; points: number; color: string }> = {};
    for (const group of groupedRules) {
      if (!teams[group.teamName]) {
        teams[group.teamName] = { count: 0, links: 0, points: 0, color: group.color };
      }
      for (const rule of group.rules) {
        teams[group.teamName].count++;
        const links = ruleStats[rule.id] || 0;
        teams[group.teamName].links += links;
        teams[group.teamName].points += links * rule.pointPerLink;
      }
    }
    return teams;
  }, [groupedRules, ruleStats]);

  const handleDelete = (rule: TaskPointRule) => {
    if (window.confirm(`Xóa rule "${rule.taskLabel}"?`)) {
      deleteTaskPointRule(rule.id);
      toast.success('Đã xóa rule');
    }
  };

  const generateId = () => makeId('rule');

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <span className="icon"><Calculator size={20} /></span>
            Bảng Điểm Quy Đổi
          </h2>
          <p className="page-subtitle">
            Cấu hình điểm cho mỗi loại đầu việc, phân theo nhóm đầu việc lớn (team). Điểm = trọng số thời gian, không phải count link.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditItem(null); setShowForm(true); }}>
          <Plus size={16} /> Thêm rule mới
        </button>
      </div>

      {/* Info banner */}
      <div style={{
        padding: '14px 18px', borderRadius: 'var(--radius-md)', marginBottom: '20px',
        background: 'linear-gradient(135deg, #ecfdf5 0%, #f0f9ff 100%)',
        border: '1px solid #d1fae5', display: 'flex', gap: '12px', alignItems: 'flex-start',
      }}>
        <Zap size={18} style={{ color: '#059669', flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: '0.85rem', color: '#065f46', lineHeight: 1.6 }}>
          <strong>Cách hoạt động:</strong> Mỗi link nộp qua dashboard sẽ khớp "Chi tiết đầu việc" →
          nhân với <strong>Điểm/link</strong> (= thời gian × hệ số). Phân loại theo 3 nhóm
          <strong> Bài viết / Sản phẩm / Multimedia - Tin nhanh</strong>.
        </div>
      </div>

      {/* ── Scale Config card — biến cứng có thể chỉnh ── */}
      <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--radius-md)',
              background: 'var(--blue-100)', color: 'var(--blue-600)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Settings2 size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.98rem' }}>Thang điểm & Thang thời gian</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                Biến cứng — Manager có thể chỉnh, áp dụng cho mọi tính toán điểm
              </div>
            </div>
          </div>
          {isManager && (
            <button className="btn btn-secondary" onClick={() => setShowScaleForm(true)}>
              <Edit3 size={14} /> Chỉnh sửa
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
          <ScaleStat label="Hệ số quy đổi" value={`${scaleConfig.pointPerHour}đ/giờ`} />
          <ScaleStat label="Ngày làm việc/tháng" value={`${scaleConfig.workingDaysPerMonth ?? 24.5} ngày`} />
          <ScaleStat label="Giờ chuẩn/tháng" value={`${scaleConfig.standardHoursPerMonth}h`} />
          <ScaleStat label="Target Member" value={`${scaleConfig.memberTargetPoints}đ`} />
          <ScaleStat label="Leader sản xuất" value={`${Math.round(scaleConfig.leaderProductionWeight*100)}%`} />
          <ScaleStat label="Ngày nghỉ cho phép" value={`${scaleConfig.allowedDaysOff} ngày`} />
        </div>
      </div>

      {/* Team summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {Object.entries(teamStats).map(([teamName, stats]) => (
          <div key={teamName} className="card" style={{
            padding: '16px', borderLeft: `4px solid ${stats.color}`,
          }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginBottom: '4px' }}>
              <Layers size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
              Team {teamName}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <span style={{ fontWeight: 800, fontSize: '1.2rem', color: stats.color }}>{stats.count}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginLeft: '4px' }}>rules</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                  <Hash size={11} style={{ verticalAlign: 'middle' }} /> {stats.links.toLocaleString()} link
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: stats.color }}>
                  {stats.points.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} điểm
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Grouped rules */}
      {groupedRules.map(group => {
        const groupLinks = group.rules.reduce((s, r) => s + (ruleStats[r.id] || 0), 0);
        const groupPoints = group.rules.reduce((s, r) => s + (ruleStats[r.id] || 0) * r.pointPerLink, 0);

        return (
          <div key={group.category} className="card" style={{ padding: 0, marginBottom: '16px', overflow: 'hidden' }}>
            {/* Category header */}
            <div style={{
              padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: `${group.color}0D`, borderBottom: `2px solid ${group.color}20`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', background: group.color,
                }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                    {group.category}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    Team: <strong style={{ color: group.color }}>{group.teamName}</strong> · {group.rules.length} đầu việc
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '0.82rem' }}>
                <div style={{ color: 'var(--text-tertiary)' }}>{groupLinks.toLocaleString()} link khớp</div>
                <div style={{ fontWeight: 700, color: group.color }}>{groupPoints.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} điểm</div>
              </div>
            </div>

            {/* Rules inside this category */}
            <div className="data-table-wrapper" style={{ margin: 0 }}>
              <table className="data-table" style={{ marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th>Chi tiết đầu việc</th>
                    <th style={{ textAlign: 'center', width: '90px' }}>Thời gian/Link</th>
                    <th style={{ textAlign: 'center', width: '90px' }}>Điểm/Link</th>
                    <th style={{ textAlign: 'center', width: '90px' }}>Link khớp</th>
                    <th style={{ textAlign: 'center', width: '110px' }}>Tổng điểm</th>
                    <th>Ghi chú</th>
                    <th style={{ textAlign: 'center', width: '60px' }}>Active</th>
                    <th style={{ width: '80px' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rules.map((rule) => {
                    const matchedLinks = ruleStats[rule.id] || 0;
                    const estimatedPoints = matchedLinks * rule.pointPerLink;

                    return (
                      <tr key={rule.id} style={{ opacity: rule.active ? 1 : 0.5 }}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{rule.taskLabel}</div>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          {rule.timePerLink}h
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            background: `${group.color}15`, color: group.color,
                            padding: '4px 12px', borderRadius: '20px', fontWeight: 700, fontSize: '0.95rem',
                          }}>
                            {rule.pointPerLink}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 600, color: matchedLinks > 0 ? 'var(--primary-600)' : 'var(--text-tertiary)' }}>
                          {matchedLinks.toLocaleString()}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--success)' }}>
                          {estimatedPoints.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}
                        </td>
                        <td className="cell-secondary" style={{ fontSize: '0.82rem' }}>{rule.notes}</td>
                        <td style={{ textAlign: 'center' }}>
                          {rule.active
                            ? <CheckCircle size={16} color="var(--success)" />
                            : <AlertCircle size={16} color="var(--text-tertiary)" />
                          }
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button className="btn btn-icon btn-ghost" onClick={() => { setEditItem(rule); setShowForm(true); }}>
                              <Edit3 size={14} />
                            </button>
                            <button className="btn btn-icon btn-ghost" onClick={() => handleDelete(rule)} style={{ color: 'var(--danger)' }}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {taskPointRules.length === 0 && (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
          Chưa có rule nào. Bấm "Thêm rule mới" để bắt đầu.
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <RuleFormModal
          item={editItem}
          knownLabels={knownTaskDetails}
          onClose={() => { setShowForm(false); setEditItem(null); }}
          onSave={(data) => {
            // Đồng bộ pointPerLink theo thang hiện tại nếu user chưa override
            const time = data.timePerLink ?? 0.5;
            const point = Math.round(time * scaleConfig.pointPerHour * 100) / 100;
            const final = { ...data, pointPerLink: data.pointPerLink ?? point };
            if (editItem) {
              updateTaskPointRule(editItem.id, final);
              toast.success('Đã cập nhật rule');
            } else {
              addTaskPointRule({ ...final, id: generateId() } as TaskPointRule);
              toast.success('Đã thêm rule mới');
            }
            setShowForm(false);
            setEditItem(null);
          }}
        />
      )}

      {showScaleForm && isManager && (
        <ScaleConfigModal
          config={scaleConfig}
          onClose={() => setShowScaleForm(false)}
          onSave={(cfg) => {
            setScaleConfig(cfg);
            toast.success('Đã cập nhật thang điểm');
            setShowScaleForm(false);
          }}
        />
      )}
    </div>
  );
}

function ScaleStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: '10px', background: 'var(--bg-secondary)',
      borderRadius: 'var(--radius-md)', textAlign: 'center',
    }}>
      <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--primary-600)' }}>{value}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>{label}</div>
    </div>
  );
}

function ScaleConfigModal({ config, onClose, onSave }: {
  config: KPIScaleConfig;
  onClose: () => void;
  onSave: (cfg: KPIScaleConfig) => void;
}) {
  const [form, setForm] = useState<KPIScaleConfig>(config);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const w = form.weights;
    const sum = w.productivity + w.quality + w.attitude + w.timeliness + w.attendance;
    if (Math.abs(sum - 1) > 0.01) {
      toast.error(`Tổng trọng số phải = 1.0 (hiện ${sum.toFixed(2)})`);
      return;
    }
    onSave(form);
  };

  const reset = () => setForm(DEFAULT_KPI_SCALE_CONFIG);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3 className="modal-title">Cấu hình Thang điểm & Thời gian</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Hệ số quy đổi (điểm/giờ) *</label>
                <input className="form-input" type="number" step="0.05" min="0.1" max="10"
                  value={form.pointPerHour}
                  onChange={e => setForm({ ...form, pointPerHour: parseFloat(e.target.value) || 0 })} />
                <p style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  1 giờ làm việc = {form.pointPerHour} điểm
                </p>
              </div>
              <div className="form-group">
                <label className="form-label">Ngày làm việc/tháng *</label>
                <input className="form-input" type="number" step="0.5" min="1" max="31"
                  value={form.workingDaysPerMonth ?? 24.5}
                  onChange={e => {
                    const days = parseFloat(e.target.value) || 24.5;
                    setForm({ ...form, workingDaysPerMonth: days, standardHoursPerMonth: Math.round(days * 8) });
                  }} />
                <p style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  {form.workingDaysPerMonth ?? 24.5} ngày × 8h = {Math.round((form.workingDaysPerMonth ?? 24.5) * 8)}h/tháng
                </p>
              </div>
              <div className="form-group">
                <label className="form-label">Giờ chuẩn/tháng *</label>
                <input className="form-input" type="number" min="1" max="500"
                  value={form.standardHoursPerMonth}
                  onChange={e => setForm({ ...form, standardHoursPerMonth: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="form-group">
                <label className="form-label">Target Member (điểm/tháng) *</label>
                <input className="form-input" type="number" min="1"
                  value={form.memberTargetPoints}
                  onChange={e => setForm({ ...form, memberTargetPoints: parseFloat(e.target.value) || 0 })} />
                <p style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  Đề xuất: {form.standardHoursPerMonth} × {form.pointPerHour} = {(form.standardHoursPerMonth * form.pointPerHour).toFixed(0)}
                </p>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Trọng số sản xuất Leader (0-1) *</label>
                <input className="form-input" type="number" step="0.05" min="0" max="1"
                  value={form.leaderProductionWeight}
                  onChange={e => setForm({ ...form, leaderProductionWeight: parseFloat(e.target.value) || 0 })} />
                <p style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  Leader = {Math.round(form.leaderProductionWeight*100)}% sản xuất + {Math.round((1-form.leaderProductionWeight)*100)}% quản lý
                </p>
              </div>
              <div className="form-group">
                <label className="form-label">Ngày nghỉ cho phép/tháng</label>
                <input className="form-input" type="number" min="0" max="30"
                  value={form.allowedDaysOff}
                  onChange={e => setForm({ ...form, allowedDaysOff: parseInt(e.target.value) || 0 })} />
              </div>
            </div>

            <div style={{ marginTop: '14px', padding: '14px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '10px' }}>
                Trọng số 5 chiều Performance (tổng = 1.0)
              </div>
              <div className="form-row">
                {(['productivity','quality','attitude','timeliness','attendance'] as const).map(k => (
                  <div key={k} className="form-group">
                    <label className="form-label" style={{ fontSize: '0.78rem' }}>
                      {k === 'productivity' ? 'Sản lượng' : k === 'quality' ? 'Chất lượng' :
                       k === 'attitude' ? 'Thái độ' : k === 'timeliness' ? 'Tiến độ' : 'Chuyên cần'}
                    </label>
                    <input className="form-input" type="number" step="0.05" min="0" max="1"
                      value={form.weights[k]}
                      onChange={e => setForm({ ...form, weights: { ...form.weights, [k]: parseFloat(e.target.value) || 0 } })} />
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                Tổng: {(form.weights.productivity + form.weights.quality + form.weights.attitude +
                       form.weights.timeliness + form.weights.attendance).toFixed(2)}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={reset}>Reset mặc định</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary"><Save size={14} /> Lưu thang điểm</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RuleFormModal({ item, knownLabels, onClose, onSave }: {
  item: TaskPointRule | null;
  knownLabels: string[];
  onClose: () => void;
  onSave: (data: Partial<TaskPointRule>) => void;
}) {
  const categories = defaultTaskCategories.map(c => c.taskTypeName);

  const [form, setForm] = useState<Partial<TaskPointRule>>(item || {
    taskLabel: '',
    category: categories[0] || '',
    timePerLink: 0.5,
    pointPerLink: 0.75,
    notes: '',
    active: true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.taskLabel?.trim()) {
      toast.error('Vui lòng nhập tên đầu việc');
      return;
    }
    onSave(form);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <h3 className="modal-title">{item ? 'Chỉnh sửa Rule' : 'Thêm Rule Quy Đổi'}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Đầu việc lớn (category) */}
            <div className="form-group">
              <label className="form-label">Đầu việc lớn (phân loại team) *</label>
              <select
                className="form-select"
                value={form.category || ''}
                onChange={e => setForm({ ...form, category: e.target.value })}
              >
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="Khác">Khác</option>
              </select>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                Match cột "Đầu việc content" trong Sheet → phân loại team.
              </p>
            </div>

            {/* Chi tiết đầu việc */}
            <div className="form-group">
              <label className="form-label">Chi tiết đầu việc *</label>
              <input
                className="form-input"
                value={form.taskLabel || ''}
                onChange={e => setForm({ ...form, taskLabel: e.target.value })}
                placeholder="VD: SEO, Bài AI, FAQ, Infographic..."
                list="known-labels"
              />
              <datalist id="known-labels">
                {knownLabels.map(l => <option key={l} value={l} />)}
              </datalist>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                Match cột "Chi tiết đầu việc" từ Sheet → tính điểm/link.
              </p>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Thời gian/Link (giờ)*</label>
                <input
                  className="form-input"
                  type="number"
                  step="any"
                  min="0"
                  value={form.timePerLink ?? 0.5}
                  onChange={e => {
                    const time = parseFloat(e.target.value) || 0;
                    setForm({ ...form, timePerLink: time, pointPerLink: Math.round(time * 1.5 * 100) / 100 });
                  }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Điểm / Link (Hệ số = 1.5) *</label>
                <input
                  className="form-input"
                  type="number"
                  step="any"
                  min="0"
                  value={form.pointPerLink ?? 0.75}
                  onChange={e => setForm({ ...form, pointPerLink: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Trạng thái</label>
                <select
                  className="form-select"
                  value={form.active ? 'true' : 'false'}
                  onChange={e => setForm({ ...form, active: e.target.value === 'true' })}
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Ghi chú</label>
              <textarea
                className="form-textarea"
                value={form.notes || ''}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Giải thích rule này..."
                rows={2}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary">
              <Save size={14} /> {item ? 'Cập nhật' : 'Thêm rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
