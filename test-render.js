import React from 'react';
import ReactDOMServer from 'react-dom/server';

// Mock components
const Eye = () => React.createElement('span', null, 'Eye');
const Clock = () => React.createElement('span', null, 'Clock');
const UserPlus = () => React.createElement('span', null, 'UserPlus');
const X = () => React.createElement('span', null, 'X');

const PRIORITY_META = {
  high:   { label: 'Cao',       color: '#DC2626', bg: '#FEE2E2', icon: '🔴' },
  medium: { label: 'Trung bình', color: '#F59E0B', bg: '#FEF3C7', icon: '🟡' },
  low:    { label: 'Thấp',      color: '#6B7280', bg: '#F3F4F6', icon: '⚪' },
};

function TodoFormModal({ item, readOnly }) {
  const form = item || {
    title: '', description: '', dueDate: '', priority: 'medium', assigneeName: '',
  };
  const pm = PRIORITY_META[form.priority || 'medium'];

  return React.createElement('div', null, 
    readOnly ? React.createElement('div', null, 
      React.createElement('div', null, form.dueDate ? new Date(form.dueDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Không có'),
      React.createElement('div', null, pm.bg)
    ) : React.createElement('form', null, 'editable')
  );
}

try {
  const html = ReactDOMServer.renderToString(
    React.createElement(TodoFormModal, {
      item: { title: 'Test', priority: 'high', dueDate: '2026-05-14', ownerName: 'Manager' },
      readOnly: true
    })
  );
  console.log("RENDER SUCCESS:", html);
} catch (e) {
  console.log("RENDER ERROR:", e);
}
