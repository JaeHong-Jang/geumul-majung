// 서버 호출 한 곳. 상대 경로 /v1, 토큰은 sessionStorage.
import { api as request, session } from './client';
export const getToken = () => session('seller')?.access_token;
export const clearSession = () => sessionStorage.removeItem('janjaemi:seller');
export async function api(path, {method = 'GET', body} = {}) {
 try { return await request('seller', path, method, body); }
 catch (e) { if(e.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('seller:unauthorized')); throw e; }
}
export const errorText = e => e?.message || '요청 처리 실패';
