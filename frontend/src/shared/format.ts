export function dateText(value?: string | null): string {
  if (!value) return '';
  if (/^\d{4}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '날짜 미등록';
  const parts = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('month')}.${get('day')} (${get('weekday')})`;
}

export const money = (value?: number | null) => value == null ? '확인 중' : `${value.toLocaleString('ko-KR')}원`;
export const weightText = (value: number) => `${value.toLocaleString('ko-KR', {maximumFractionDigits: 2})} kg`;
export function dateTimeText(value: string) {
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) return '날짜 미등록';
 return `${dateText(value)} ${new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date)}`;
}
export function isoDate(value?: string) {
 if (!value) return "";
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) return '날짜 미등록';
 const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 return ['year','month','day'].map(t=>parts.find(p=>p.type===t)?.value).join('-');
}
