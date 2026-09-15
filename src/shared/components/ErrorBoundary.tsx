import React, { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '32px 24px',
          background: '#fff',
          borderRadius: '16px',
          border: '1.5px solid #fecaca',
          boxShadow: '0 4px 20px rgba(239, 68, 68, 0.08)',
          maxWidth: '600px',
          margin: '40px auto',
          textAlign: 'center',
          fontFamily: 'Inter, sans-serif',
        }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px',
            background: '#fee2e2', color: '#ef4444',
            display: 'grid', placeItems: 'center', margin: '0 auto 16px',
          }}>
            <AlertTriangle size={24} />
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#991b1b', marginBottom: '8px' }}>
            {this.props.fallbackTitle || 'Đã xảy ra lỗi hiển thị'}
          </h3>
          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px', lineHeight: 1.6 }}>
            {this.state.error?.message || 'Có lỗi phát sinh khi dựng giao diện phần này. Vui lòng thử tải lại hoặc đóng mở lại.'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '8px 18px', borderRadius: '8px', border: 'none',
                background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: '13px',
                cursor: 'pointer',
              }}>
              <RefreshCw size={14} /> Thử lại
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '8px 18px', borderRadius: '8px', border: '1px solid #cbd5e1',
                background: '#f8fafc', color: '#475569', fontWeight: 600, fontSize: '13px',
                cursor: 'pointer',
              }}>
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
