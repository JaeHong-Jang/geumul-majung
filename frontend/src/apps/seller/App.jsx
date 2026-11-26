import "../../shared/ui/review.css";
import { LoadingScreen } from "../../shared/screens/Loading";
import { takeAuthFragment } from "../../shared/api/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavContext } from './lib/nav';
import { getToken } from '../../shared/api/seller';
import { screenById } from './screens';
import './App.css';

// 로그인 없이 볼 수 있는 화면
const PUBLIC = new Set(['login', 'signup', 'company']);

function readHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [id, query = ''] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  return { id: screenById[id] ? id : getToken() ? 'home' : 'login', params };
}

const hashOf = (id, params) => {
  const q = params && Object.keys(params).length ? `?${new URLSearchParams(params)}` : '';
  return `/${id}${q}`;
};

export default function App() {
  const [authFragment, setAuthFragment] = useState(takeAuthFragment);
  const [loading,setLoading]=useState(true);
  const finishLoading = useCallback(() => setLoading(false), []);
  const [loc, setLoc] = useState(() => authFragment.reset !== null || authFragment.token || authFragment.signup ? {id:'login',params:{}} : readHash());
  const [authed, setAuthed] = useState(!!getToken());
  const history = useRef([]);

  useEffect(() => {
    const onHash = () => {
      setLoc(readHash());
      setAuthed(!!getToken());
    };
    const onUnauth = () => {
      setAuthed(false);
      history.current = [];
      window.location.hash = '/login';
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('seller:unauthorized', onUnauth);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('seller:unauthorized', onUnauth);
    };
  }, []);

  const current = loc.id;
  const go = useCallback(
    (id, params) => {
      if (!screenById[id]) return;
      if (id === 'home') setAuthFragment({reset:null,token:null,signup:null});
      history.current.push({ id: current, params: loc.params });
      window.location.hash = hashOf(id, params);
    },
    [current, loc.params],
  );

  const back = useCallback(() => {
    const prev = history.current.pop();
    window.location.hash = prev ? hashOf(prev.id, prev.params) : '/home';
  }, []);

  const nav = useMemo(() => ({ current, params: loc.params, go, back, authFragment }), [current, loc.params, go, back, authFragment]);

  // 로그인이 필요한 화면인데 토큰이 없으면 로그인으로
  const needLogin = !PUBLIC.has(current) && !(authed || getToken());
  const shownId = needLogin ? 'login' : current;
  const active = screenById[shownId];

  return <NavContext.Provider value={nav}><div className="app seller"><div className="seller-frame">
    <div inert={loading} aria-hidden={loading} style={{height:"100%"}}>
    <active.Component key={`${active.id}?${JSON.stringify(loc.params)}`} />
    </div>
    {loading && <LoadingScreen onComplete={finishLoading} />}
  </div></div></NavContext.Provider>;
}
