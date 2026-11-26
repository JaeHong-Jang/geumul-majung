import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../shared/api/seller';

/**
 * GET 한 번 + 5초마다 조용히 갱신. 내용이 같으면 상태를 바꾸지 않아서
 * 입력 중인 칸이나 스크롤 위치가 그대로 유지됩니다.
 * path가 null이면 호출하지 않습니다.
 */
export default function useResource(path, { poll = true, interval = 5000 } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: !!path });
  const last = useRef('');

  const load = useCallback(async () => {
    if (!path) return;
    try {
      const data = await api(path);
      const key = JSON.stringify(data);
      if (key !== last.current) {
        last.current = key;
        setState({ data, error: null, loading: false });
      } else {
        setState((s) => (s.loading || s.error ? { data, error: null, loading: false } : s));
      }
    } catch (error) {
      setState((s) => (s.error && s.error.message === error.message && !s.loading ? s : { data: s.data, error, loading: false }));
    }
  }, [path]);

  useEffect(() => {
    last.current = '';
    setState({ data: null, error: null, loading: !!path });
    load();
    if (!poll || !path) return undefined;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, interval);
    return () => clearInterval(t);
  }, [path, poll, interval, load]);

  return { ...state, reload: load };
}
