import type { Company, Role } from '../../types';
import { roleName } from '../../types';
export const authNavigation = { redirect: (path: string) => window.location.assign(path) };
export function accountRole(company: Company): Role {
  if (company.role === 'factory') return 'seller';
  if (company.role === 'recycler') return 'buyer';
  throw new Error('지원하지 않는 계정 유형');
}
/** notice=false면 다른 앱으로 넘어갈 때 알림창 없이 바로 이동한다(체험 계정 원클릭). */
export function finishLogin(current: Role, result: { access_token: string; company: Company }, done: () => void, notice = true) {
  const target = accountRole(result.company);
  sessionStorage.setItem(`janjaemi:${target}`, JSON.stringify(result));
  if (target !== current) {
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'janjaemi:open-app', role: target }, location.origin);
      if (notice) window.alert(`${roleName[target]} 앱 로그인 완료`);
      return;
    }
    if (notice) window.alert(`${roleName[target]} 앱으로 이동`);
    authNavigation.redirect(`/${target}/`);
  } else done();
}
export function takeAuthFragment() {
  const hash = window.location.hash;
  const resetRoute = hash.startsWith('#/reset?');
  const routed = resetRoute || hash.startsWith('#/oauth?');
  const params = new URLSearchParams(routed ? hash.slice(hash.indexOf('?') + 1) : hash.slice(1));
  const reset = resetRoute ? params.get('token') : null;
  const token = resetRoute ? null : params.get('token') ?? params.get('access_token');
  const signup = params.get('signup_token');
  if (params.has('token') || params.has('access_token') || params.has('signup_token')) history.replaceState(history.state, '', location.pathname + location.search);
  return { reset, token, signup };
}
