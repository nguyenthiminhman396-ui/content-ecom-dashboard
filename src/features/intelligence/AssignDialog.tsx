import { useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStore } from '@/shared/store/appStore';
import type { TodoPriority } from '@/shared/types';
import { mutedStyle } from './labels';

export interface AssignInput { assignee: string; priority: TodoPriority; dueDate?: string; instructions?: string }

/** Hộp thoại giao việc dùng chung (sửa bài từ QC, viết/bổ sung bài từ phân tích đối thủ). */
export default function AssignDialog({ title, note, defaultPriority = 'medium', onConfirm, onClose }: {
  title: string; note: React.ReactNode; defaultPriority?: TodoPriority;
  onConfirm: (input: AssignInput) => void; onClose: () => void;
}) {
  const { members } = useAppStore();
  const [assignee, setAssignee] = useState('');
  const [priority, setPriority] = useState<TodoPriority>(defaultPriority);
  const [dueDate, setDueDate] = useState('');
  const [instructions, setInstructions] = useState('');
  const options = members.filter(m => m.role !== 'Client').map(m => m.name).sort();

  const submit = () => {
    if (!assignee) { toast.error('Chọn thành viên nhận việc'); return; }
    onConfirm({ assignee, priority, dueDate: dueDate || undefined, instructions: instructions || undefined });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h3 className="modal-title"><UserPlus size={16} /> {title}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div style={{ ...mutedStyle, marginBottom: 10 }}>{note}</div>
          <div className="form-group">
            <label className="form-label">Thành viên *</label>
            <select className="form-select" value={assignee} onChange={e => setAssignee(e.target.value)}>
              <option value="">— Chọn thành viên —</option>
              {options.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Hạn hoàn thành</label><input className="form-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
            <div className="form-group">
              <label className="form-label">Ưu tiên</label>
              <select className="form-select" value={priority} onChange={e => setPriority(e.target.value as TodoPriority)}>
                <option value="high">🔴 Cao</option><option value="medium">🟡 Trung bình</option><option value="low">⚪ Thấp</option>
              </select>
            </div>
          </div>
          <div className="form-group"><label className="form-label">Yêu cầu xử lý</label><textarea className="form-textarea" rows={3} value={instructions} onChange={e => setInstructions(e.target.value)} /></div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Hủy</button>
          <button className="btn btn-primary" onClick={submit}>Xác nhận giao việc</button>
        </div>
      </div>
    </div>
  );
}
