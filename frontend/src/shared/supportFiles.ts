import { api, session } from './api/client';
import type { Role } from '../types';
export const attachmentTypes = ['image/jpeg','image/png','image/webp','application/pdf'];
export function validateAttachments(files: File[], existingCount = 0) {
 if(files.length + existingCount > 5) throw new Error('첨부는 문의당 5개까지 등록 가능');
 if(files.reduce((sum,f)=>sum+f.size,0) > 6*1024*1024) throw new Error('첨부 합계는 6MB 이하로 제한');
 for(const file of files) {
  if(!attachmentTypes.includes(file.type)) throw new Error('첨부는 JPEG, PNG, WebP, PDF 파일만 등록 가능');
  if(!file.size || file.size > 2*1024*1024) throw new Error('첨부 파일은 각각 0바이트 초과, 2MB 이하로 제한');
 }
}
export async function uploadAttachment(role: Role, ticket: number, file: File) {
 const data = await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]!);reader.onerror=()=>reject(new Error('첨부 파일 읽기 실패'));reader.readAsDataURL(file);});
 return api(role,`/support/tickets/${ticket}/attachments`,'POST',{content_type:file.type,data_base64:data});
}
export async function downloadAttachment(role: Role, ticket: number, attachment: {id:number;content_type:string}) {
 const response=await fetch(`/v1/support/tickets/${ticket}/attachments/${attachment.id}`,{headers:{Authorization:`Bearer ${session(role)?.access_token}`}});
 if(response.status === 401) { sessionStorage.setItem(`janjaemi:expired:${role}`, '1'); sessionStorage.removeItem(`janjaemi:${role}`); window.dispatchEvent(new CustomEvent('session-expired', {detail:role})); throw new Error('로그인 만료'); }
 if(!response.ok) throw new Error('첨부 파일 다운로드 실패');
 const url=URL.createObjectURL(await response.blob());
 const link=document.createElement('a');link.href=url;link.download=`문의-${ticket}-첨부-${attachment.id}.${attachment.content_type.split('/')[1]}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export async function imagePayload(file: File) {
 if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('사진은 JPEG, PNG, WebP 파일로 선택');
 validateAttachments([file]);
 const data = await new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]!);
  reader.onerror = () => reject(new Error('사진 읽기 실패'));
  reader.readAsDataURL(file);
 });
 return {content_type: file.type, data_base64: data};
}
