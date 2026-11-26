import { validateForm } from "../formValidation";
import { useEffect, useRef, useState } from 'react';
import { api, useAction, useResource } from '../api/client';
import { finishLogin, takeAuthFragment } from '../api/auth';
import { AppButton, Feedback, Field, Ic, TopBar } from '../ui';
import { roleName, serverRole, type Company, type Role } from '../../types';
import { AuthBackdrop } from './AuthBackdrop';
import { Signup } from './Signup';
import '../../styles.css';
import './auth.css';
export function Login({ appRole, onLogin, initialFragment }: { appRole: Role; onLogin: () => void; initialFragment?: ReturnType<typeof takeAuthFragment> }) {
  const loginRef = useRef(onLogin);
  useEffect(() => { loginRef.current = onLogin; }, [onLogin]);
  const [fragment] = useState(() => initialFragment ?? takeAuthFragment());
  const [mode, setMode] = useState(fragment.reset !== null ? 'reset' : fragment.signup ? 'signup' : 'login');
  const [role, setRole] = useState(appRole);
  const [expired] = useState(() => sessionStorage.getItem(`janjaemi:expired:${appRole}`) === "1");
  useEffect(() => { sessionStorage.removeItem(`janjaemi:expired:${appRole}`); }, [appRole]);
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const providers = useResource<string[]>(appRole, '/auth/providers');
  const a = useAction();
  const { setMessage } = a;
  useEffect(() => {
    if (!fragment.token) return;
    const token = fragment.token;
    let active = true;
    void fetch('/v1/me/profile', { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => { if (!r.ok) throw new Error('로그인 정보 확인 불가'); return r.json() as Promise<Company>; })
      .then(company => { if (active) finishLogin(appRole, { access_token: token, company }, loginRef.current); })
      .catch(() => { if (active) setMessage('소셜 로그인 실패, 다시 로그인 필요'); });
    return () => { active = false; };
  }, [fragment.token, appRole, setMessage]);
  if (mode === 'signup') return <Signup appRole={role} signupToken={fragment.signup} back={() => setMode('login')} />;
  if (mode !== 'login') return <form noValidate className="page-body auth-secondary" onSubmit={e => {
    e.preventDefault();
    const error = validateForm(e.currentTarget);
    if(error) { a.setMessage(error); return; }
    void a.run(() => api(appRole, mode === 'reset' ? '/auth/password-reset/confirm' : '/auth/password-reset', 'POST', mode === 'reset' ? { token: fragment.reset, new_password: password } : { email: id.trim() }), () => a.setMessage(mode === 'reset' ? '비밀번호 변경 완료, 새 비밀번호로 로그인 필요' : '비밀번호 재설정 안내 요청 완료, 이메일 확인 필요'));
  }}>
    <AuthBackdrop />
    <div className="auth-secondary-body">
    <TopBar title={mode === 'reset' ? '비밀번호 재설정' : '아이디, 비밀번호 찾기'} back={() => setMode('login')} />
    <div className="app-card auth-panel">
    {mode === 'reset' ? <Field label="새 비밀번호" placeholder="8자 이상" type="password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} /> : <Field label="이메일" type="email" required value={id} onChange={e => setId(e.target.value)} />}
    <Feedback {...a} /></div><div className="signup-footer"><AppButton disabled={a.busy}>{mode === 'reset' ? '비밀번호 변경' : '재설정 메일 요청'}</AppButton></div>
    <button type="button" className="auth-text-link" onClick={() => setMode('login')}>로그인</button>
    </div>
  </form>;
  return <form noValidate className="page-body login shared-login" onSubmit={e => {
    e.preventDefault();
    if (!id.trim() || !password) {
      const missing = !id.trim() ? 'username' : 'current-password';
      e.currentTarget.querySelector<HTMLInputElement>(`input[autocomplete="${missing}"]`)?.focus();
      a.setMessage(!id.trim() ? '사업자 계정 입력 필요' : '비밀번호 입력 필요');
      return;
    }
    void a.run(() => api<{ access_token: string; company: Company }>(appRole, '/auth/login', 'POST', { login_id: id.trim(), password }), result => { setPassword(''); finishLogin(appRole, result, onLogin); });
  }}>
    <AuthBackdrop />
    <div className="login-body">
    {expired && <p role="alert">로그인 만료</p>}
    <div className="login-group">
    <div className="login-brand"><div className="login-logo"><Ic name="logo_mark" /></div><h1>잔재미</h1><p>산업 부산물 거래</p></div>
    <div className="stack login-fields">
      <Field label="사업자 계정" placeholder="이메일 또는 사업자등록번호" autoComplete="username" required value={id} onChange={e => setId(e.target.value)} />
      <Field label="비밀번호" placeholder="비밀번호 입력" autoComplete="current-password" type="password" required value={password} onChange={e => setPassword(e.target.value)} />
    </div>
    <div className="role-cards" role="radiogroup" aria-label="이용 유형">
      {(['seller', 'buyer'] as Role[]).map(r => <button type="button" role="radio" aria-checked={r === role} className={`role-card ${r === role ? 'selected' : ''}`} key={r} onClick={() => setRole(r)}>
        <Ic name={{ seller: 'role_seller', buyer: 'role_buyer' }[r]} />
        <span className="role-copy"><b>{roleName[r]}</b><small>{{ seller: '공장 부산물 판매', buyer: '등급별 원료 구매' }[r]}</small></span>
        <span className="role-radio" />
      </button>)}
    </div>
    <Feedback {...a} />
    <div className="login-submit">
      <AppButton disabled={a.busy}>{a.busy ? '로그인 중…' : `${roleName[role]}로 로그인`}</AppButton>
      {(Array.isArray(providers.data) ? providers.data : []).filter(p => p === 'kakao' || p === 'google').map(p => <button key={p} type="button" className={`social-button ${p}`} onClick={() => window.location.assign(`/v1/auth/oauth/${p}/start?role=${serverRole[role]}&app=${appRole}`)}>{p === 'kakao' ? '카카오 로그인' : '구글 로그인'}</button>)}
    </div>
      <div className="login-links"><button type="button" onClick={() => setMode('signup')}>{roleName[role]} 회원가입</button><span>|</span><button type="button" onClick={() => setMode('find')}>아이디, 비밀번호 찾기</button></div>
    {Array.isArray(providers.data) && providers.data.includes('demo') && <section className="demo-login" aria-label="체험용 계정">
      <p>체험용 계정으로 바로 시작</p>
      <div>{(['seller', 'buyer'] as Role[]).map(r => <button key={r} type="button" aria-label={`${roleName[r]} 체험하기`} disabled={a.busy} onClick={() => void a.run(() => api<{ access_token: string; company: Company }>(appRole, `/auth/demo/${r}`, 'POST'), result => finishLogin(appRole, result, onLogin, false))}>
        <Ic name={{ seller: 'role_seller', buyer: 'role_buyer' }[r]} /><b>{roleName[r]}</b><small>체험하기</small>
      </button>)}</div>
    </section>}
    </div>
    </div>
  </form>;
}
