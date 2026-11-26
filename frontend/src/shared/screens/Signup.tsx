import { validateForm } from "../formValidation";
import { AuthBackdrop } from './AuthBackdrop';
import { useState } from 'react';
import { api, session, useAction, useResource } from '../api/client';
import { AppButton, Feedback, Field, TopBar } from '../ui';
import { roleName, serverRole, type Role } from '../../types';
import { AddressInput, type LocationValue } from './AddressInput';
import { SellerSignup } from './SellerSignup';
export function Approval({ back, approved = false, appRole }: { back: () => void; approved?: boolean; appRole?: Role }) {
  const profile = useResource<{verified: boolean}>(appRole ?? "seller", appRole && session(appRole) ? "/me/profile" : null, true);
  approved = profile.data?.verified ?? approved;
  return <div className="page-body auth-secondary"><AuthBackdrop /><div className="auth-secondary-body"><TopBar title="가입 승인, 보완" back={back} /><Feedback {...profile} /><section className="app-card"><h2>{approved ? '승인 완료' : '승인 대기'}</h2><p>{approved ? '가입 완료, 로그인 가능' : '가입 신청 접수 완료, 승인 후 거래 가능'}</p></section><div className="signup-footer"><AppButton onClick={back}>로그인</AppButton></div></div></div>;
}
type SignupProps = { appRole: Role; back: () => void; signupToken?: string | null };
export function Signup(props: SignupProps) {
  return props.appRole === 'seller' ? <SellerSignup back={props.back} signupToken={props.signupToken ?? null} /> : <CompanySignup {...props} />;
}
function CompanySignup({ appRole, back, signupToken = null }: SignupProps) {
  const [step, setStep] = useState(signupToken ? 2 : 1);
  const [status, setStatus] = useState('');
  const [form, setForm] = useState<Record<string, string>>({});
  const [location, setLocation] = useState<LocationValue>({ address: '', region: '' });
  const [addressBusy, setAddressBusy] = useState(false);
  const [permitCodes, setPermitCodes] = useState<string[]>([]);
  const codes = useResource<{ code: string; name: string }[]>(appRole, appRole === 'seller' ? null : '/waste-codes');
  const a = useAction();
  const field = (key: string, label: string, type = 'text', required = true) => <Field data-confirm={key === "confirm" ? "true" : undefined} key={key} label={label} type={type} required={required} {...(type === 'password' ? { minLength: 8, ...(key === 'password' ? { placeholder: '8자 이상' } : {}) } : {})} value={form[key] || ''} onChange={e => setForm({ ...form, [key]: e.target.value })} />;
  if (status) return <Approval approved={status === 'approved'} back={back} />;
  return <form noValidate className="page-body auth-secondary signup-form" onSubmit={e => {
    e.preventDefault();
    if (step === 2 && addressBusy) return;
    if (step === 2 && !location.region) {
      e.currentTarget.querySelector<HTMLSelectElement>('select[name="region"]')?.focus();
      a.setMessage('시, 군을 목록에서 선택 필요'); return;
    }
    const error = validateForm(e.currentTarget);
    if(error) { a.setMessage(error); return; }
    void a.run(async () => {
      if (step === 1) { if (form.password !== form.confirm) { document.querySelector<HTMLInputElement>('input[data-confirm]')?.focus(); throw new Error('비밀번호 불일치'); } setStep(2); return; }
      if (appRole !== 'seller' && !permitCodes.length) { document.querySelector<HTMLInputElement>('fieldset input')?.focus(); throw new Error('허가 폐기물 코드 선택 필요'); }
      const fields = Object.fromEntries(Object.entries(form).filter(([key]) => key !== "confirm"));
      const result = await api<{id: number; status: string}>(appRole, signupToken ? '/signup/social' : '/signup', 'POST', {
        ...fields, ...location, role: serverRole[appRole],
        ...(signupToken ? { signup_token: signupToken } : {}),
        ...(appRole !== 'seller' ? { permit_codes: permitCodes } : {}),
      });
      setForm({}); setStatus(result.status);
    });
  }}>
    <AuthBackdrop />
    <div className="auth-secondary-body">
    <TopBar title={`${roleName[appRole]} 회원가입`} back={() => step === 2 && !signupToken ? setStep(1) : back()} />
    <div className="signup-progress"><div aria-hidden="true"><span className="active" /><span className={step === 2 ? 'active' : ''} /></div><p>{step}/2 {step === 1 ? '계정 정보' : '사업장 정보'}</p></div>
    <div className="app-card auth-panel">
    {(step === 1 || signupToken) && field('email', '이메일', 'email')}
    {step === 1 && <>{field('password', '비밀번호', 'password')}{field('confirm', '비밀번호 확인', 'password')}</>}
    {step === 2 && <>
      {field('biz_no', '사업자등록번호')}{field('name', '회사명')}
      <AddressInput appRole={appRole} value={location} onChange={setLocation} onBusyChange={setAddressBusy} />
      {field('address_detail', '상세 주소', 'text', false)}
      {field('phone', '전화', 'tel')}{field('industry', '업종')}
      {appRole !== 'seller' && <>{field('permit_no', '허가번호')}<fieldset><legend>허가 폐기물 코드</legend>{codes.data?.map(c => <label className="option" key={c.code}><input type="checkbox" checked={permitCodes.includes(c.code)} onChange={e => setPermitCodes(e.target.checked ? [...permitCodes, c.code] : permitCodes.filter(v => v !== c.code))} />{c.code}, {c.name}</label>)}<Feedback {...codes} /></fieldset></>}
    </>}
    <Feedback {...a} /></div><div className="signup-footer"><AppButton disabled={a.busy || addressBusy}>{step === 1 ? '사업장 정보 입력' : '가입 신청 제출'}</AppButton></div>
    </div>
  </form>;
}
