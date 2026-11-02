import { useState } from 'react';
import { Globe, Plus, Save, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStore } from '@/shared/store/appStore';
import { defaultSites } from '@/shared/data/mockData';
import type { Site } from '@/shared/types';

const PRESET_COLORS = ['#2453d6', '#2dc4ab', '#e8590c', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#ca8a04'];

/** "https://www.xetnghiemlongchau.com.vn/abc" → "xetnghiemlongchau.com.vn" */
function normDomain(v: string): string {
  return v.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

const isDefault = (id: string) => defaultSites.some(d => d.id === id);

/** Manager thêm / sửa / tắt site đăng bài. Site mới có ngay ở Submit KPI, KPI Target, báo cáo. */
export default function SitesSettings() {
  const { sites, submissions, kpiTargets, addSite, updateSite, deleteSite } = useAppStore();
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', urlPattern: '', color: PRESET_COLORS[3] });

  const openAdd = () => {
    setEditId(null);
    setForm({ name: '', urlPattern: '', color: PRESET_COLORS.find(c => !sites.some(s => s.color === c)) ?? PRESET_COLORS[3] });
    setAdding(true);
  };
  const openEdit = (s: Site) => {
    setAdding(false);
    setEditId(s.id);
    setForm({ name: s.name, urlPattern: s.urlPattern, color: s.color ?? PRESET_COLORS[0] });
  };
  const close = () => { setAdding(false); setEditId(null); };

  const save = () => {
    const name = form.name.trim();
    const urlPattern = normDomain(form.urlPattern);
    if (!name) { toast.error('Nhập tên site'); return; }
    if (sites.some(s => s.id !== editId && s.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Đã có site cùng tên'); return;
    }
    if (editId) {
      updateSite(editId, { name, urlPattern, color: form.color });
      toast.success('Đã cập nhật site');
    } else {
      addSite({
        id: `s_${Date.now().toString(36)}`, name, urlPattern, color: form.color, active: true,
        description: urlPattern ? `Site ${urlPattern}` : undefined,
      });
      toast.success(`Đã thêm site ${name}`);
    }
    close();
  };

  const usage = (id: string) =>
    submissions.filter(s => s.siteId === id).length + kpiTargets.filter(t => t.siteId === id).length;

  const remove = (s: Site) => {
    if (usage(s.id) > 0) { toast.error('Site đã có dữ liệu — hãy Tắt thay vì xoá'); return; }
    if (!window.confirm(`Xoá site ${s.name}?`)) return;
    deleteSite(s.id);
    toast.success('Đã xoá site');
  };

  const formRow = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', padding: '10px 0' }}>
      <div className="form-group" style={{ margin: 0, flex: '1 1 180px' }}>
        <label className="form-label">Tên site</label>
        <input className="form-input" value={form.name} placeholder="VD: Xét nghiệm Long Châu"
          onChange={e => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="form-group" style={{ margin: 0, flex: '1 1 180px' }}>
        <label className="form-label">Tên miền</label>
        <input className="form-input" value={form.urlPattern} placeholder="VD: xetnghiemlongchau.com.vn"
          onChange={e => setForm({ ...form, urlPattern: e.target.value })} />
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">Màu</label>
        <div style={{ display: 'flex', gap: 4, height: 36, alignItems: 'center' }}>
          {PRESET_COLORS.map(c => (
            <button key={c} type="button" onClick={() => setForm({ ...form, color: c })} title={c}
              style={{ width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer',
                       border: form.color === c ? '2px solid var(--text-primary)' : '2px solid transparent' }} />
          ))}
        </div>
      </div>
      <button className="btn btn-primary" onClick={save}><Save size={13} /> Lưu</button>
      <button className="btn btn-secondary" onClick={close}><X size={13} /></button>
    </div>
  );

  return (
    <div className="card" style={{ padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--accent-50)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Globe size={20} color="var(--primary-500)" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>Sites đăng bài</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
            Site đang bật sẽ có ở Submit KPI, KPI Target, Phân bổ KPI và báo cáo. Site đã có dữ liệu chỉ tắt được, không xoá.
          </div>
        </div>
        {!adding && <button className="btn btn-secondary" onClick={openAdd}><Plus size={14} /> Thêm site</button>}
      </div>

      {adding && formRow}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {sites.map(s => editId === s.id ? <div key={s.id}>{formRow}</div> : (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                                   borderTop: '1px solid var(--border-light)', opacity: s.active ? 1 : 0.55 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.color ?? '#94a3b8', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                {s.name}{!s.active && <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}> · đã tắt</span>}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>{s.urlPattern || 'Chưa có tên miền'}</div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={s.active} onChange={e => updateSite(s.id, { active: e.target.checked })} />
              Bật
            </label>
            <button className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '2px 8px' }} onClick={() => openEdit(s)}>Sửa</button>
            {!isDefault(s.id) && (
              <button className="btn btn-icon btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => remove(s)} title="Xoá site">
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
