import { useState } from 'react';
import { api, useAction } from '../api/client';
import type { Byproduct } from '../byproducts';
import { validateForm } from '../formValidation';
import { AppButton, Feedback, Field, TopBar } from '../ui';
import { ByproductPicker } from '../ui/ByproductPicker';
import { Approval } from './Signup';
import { AuthBackdrop } from './AuthBackdrop';
import { loadPostcode } from './geocode';
import './seller-signup.css';

export function SellerSignup({ back, signupToken = null }: { back: () => void; signupToken?: string | null }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [byproducts, setByproducts] = useState<Byproduct[]>([]);
  const [status, setStatus] = useState('');
  const action = useAction();
  const addressAction = useAction();
  const field = (key: string, label: string, type = 'text', extra: Record<string, string | number> = {}) => <Field key={key} label={label} type={type} required
    autoComplete={key === 'login_id' ? 'username' : type === 'password' ? 'new-password' : undefined}
    {...(type === 'password' ? { minLength: 8, placeholder: '8자 이상' } : {})}
    {...(key === 'login_id' ? { maxLength: 100, placeholder: '로그인에 사용할 아이디' } : {})}
    {...extra}
    value={form[key] || ''} onChange={e => setForm(current => ({ ...current, [key]: e.target.value }))} />;
  if (status) return <Approval approved={status === 'approved'} back={back} />;
  return <form noValidate className="page-body auth-secondary signup-form seller-signup" onSubmit={e => {
    e.preventDefault();
    const error = validateForm(e.currentTarget);
    if (error) { action.setMessage(error); return; }
    if (!signupToken && form.password !== form.confirm) {
      e.currentTarget.querySelector<HTMLInputElement>('input[name="confirm"]')?.focus();
      action.setMessage('비밀번호 불일치'); return;
    }
    void action.run(async () => {
      const fields = Object.fromEntries(Object.entries(form).filter(([key]) => key !== 'confirm'));
      const result = await api<{ status: string }>('seller', signupToken ? '/signup/social' : '/signup', 'POST', {
        ...fields, role: 'factory', byproducts,
        ...(signupToken ? { signup_token: signupToken } : {}),
      });
      setForm({}); setStatus(result.status);
    });
  }}>
    <AuthBackdrop />
    <div className="auth-secondary-body">
      <TopBar title="판매자 회원가입" back={back} />
      <section className="app-card auth-panel seller-signup-section" aria-labelledby="seller-signup-account">
        <h2 id="seller-signup-account">로그인 정보</h2>
        {field('login_id', '아이디')}
        {!signupToken && <>{field('password', '비밀번호', 'password')}<Field label="비밀번호 확인" name="confirm" type="password" autoComplete="new-password" minLength={8} required placeholder="한 번 더 입력" value={form.confirm || ''} onChange={e => setForm(current => ({ ...current, confirm: e.target.value }))} /></>}
      </section>
      <section className="app-card auth-panel seller-signup-section" aria-labelledby="seller-signup-business">
        <h2 id="seller-signup-business">사업장 정보</h2>
        {field('biz_no', '사업자등록번호', 'text', { inputMode: 'numeric', placeholder: '000-00-00000' })}
        {field('name', '사업자명', 'text', { placeholder: '사업자등록증의 상호' })}
        <div className="seller-signup-address">
        <Field label="주소" required placeholder="시, 군을 포함한 사업장 주소" value={form.address || ''} onChange={e => setForm(current => ({ ...current, address: e.target.value }))} />
        <AppButton type="button" outlined disabled={addressAction.busy} onClick={() => void addressAction.run(async () => {
          await loadPostcode();
          new window.daum!.Postcode({ oncomplete: data => setForm(current => ({ ...current, address: data.roadAddress || data.address })) }).open();
        })}>검색</AppButton>
        </div>
        <Feedback {...addressAction} />
      </section>
      <section className="app-card auth-panel seller-signup-section" aria-labelledby="seller-signup-byproducts">
        <h2 id="seller-signup-byproducts">발생 품목 <small>선택</small>{byproducts.length > 0 && <span>{byproducts.length}개</span>}</h2>
        <p className="seller-signup-lead">공장에서 나오는 부산물, 등록하면 홈에 맞춤 판매 추천 표시</p>
        <ByproductPicker value={byproducts} onChange={setByproducts} />
      </section>
      <Feedback {...action} />
    </div>
    <div className="signup-footer"><AppButton disabled={action.busy}>가입 신청 제출</AppButton></div>
  </form>;
}
