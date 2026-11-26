export const money = (number) => Number(number || 0).toLocaleString('ko-KR');
export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

const koreaDateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
export function koreanDate(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return '';
  const parts = Object.fromEntries(koreaDateFormat.formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
