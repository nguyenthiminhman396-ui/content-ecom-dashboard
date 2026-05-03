import { useState, useCallback } from 'react';

/**
 * useState nhưng persist giá trị vào sessionStorage.
 * Filter sẽ được giữ khi chuyển tab navigation, reset khi đóng browser.
 */
export function usePersistedState<T>(key: string, defaultValue: T): [T, (val: T | ((prev: T) => T)) => void] {
  const storageKey = `hcms_filter_${key}`;

  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch { /* ignore */ }
    return defaultValue;
  });

  const setPersisted = useCallback((val: T | ((prev: T) => T)) => {
    setValue(prev => {
      const next = typeof val === 'function' ? (val as (prev: T) => T)(prev) : val;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  }, [storageKey]);

  return [value, setPersisted];
}
