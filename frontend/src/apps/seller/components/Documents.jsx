import { FileInput } from '../../../shared/ui/FileInput';
import { useState } from 'react';
import useResource from '../lib/useResource';
import { api, errorText, getToken } from '../../../shared/api/seller';
import { ErrorNote } from '../../../shared/ui/Note';
import Button from './Button';
const KINDS = {business_license:'사업자등록증', emitter_report:'배출자 신고 증빙'};
export default function Documents() {
  const r = useResource('/me/documents');
  const [kind, setKind] = useState('business_license');
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function upload(e) {
    e.preventDefault(); setError(null); setMessage('');
    if (!file || !['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type) || file.size > 2 * 1024 * 1024) return setError('JPEG, PNG, WebP, PDF 형식의 2MB 이하 파일 선택 필요');
    setBusy(true);
    try {
      const data = await new Promise((resolve, reject) => {const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('파일 읽기 실패')); reader.readAsDataURL(file);});
      await api('/me/documents', {method:'PUT', body:{kind, content_type:file.type, data_base64:data}});
      await r.reload(); setMessage('증빙 저장 완료');
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function download(doc) {
    setError(null);
    try {
      const response = await fetch(`/v1/documents/${doc.id}`, {headers:{Authorization:`Bearer ${getToken()}`}});
      if (!response.ok) throw new Error('증빙 불러오기 실패, 다시 시도 필요');
      const blob = await response.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${KINDS[doc.kind] || '증빙'}.${blob.type === 'application/pdf' ? 'pdf' : blob.type.split('/')[1] || 'bin'}`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(errorText(e)); }
  }
  return <section className="stack"><h2>증빙 업로드, 확인</h2><p>JPEG, PNG, WebP, PDF 파일을 2MB 이하로 첨부, 같은 종류 업로드 시 기존 증빙 교체</p>
    <ErrorNote error={error || r.error} />{message && <p role="status">{message}</p>}
    {r.data?.map(d => <Button key={d.id} variant="secondary" onClick={() => download(d)}>{KINDS[d.kind]} 확인</Button>)}
    {r.data?.length === 0 && <p>등록한 증빙 없음</p>}
    <form className="stack" onSubmit={upload}><label className="field">증빙 종류<select value={kind} onChange={e => setKind(e.target.value)}>{Object.entries(KINDS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label><FileInput label="증빙 파일" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} /><Button type="submit" disabled={!file || busy}>증빙 업로드</Button></form>
  </section>;
}
