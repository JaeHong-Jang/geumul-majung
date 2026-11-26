const DAY = 86_400_000;
const seoulDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
const weekday = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'short' });
function dayNumber(date: Date) {
  const parts = seoulDate.formatToParts(date);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day')) / DAY;
}
export type NotificationGroup = '오늘' | '어제' | '이번 주' | '이전';
export function notificationGroup(createdAt: string, now: Date): NotificationGroup {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '이전';
  const days = dayNumber(now) - dayNumber(date);
  if (days <= 0) return '오늘';
  if (days === 1) return '어제';
  return now.getTime() - date.getTime() < 7 * DAY ? '이번 주' : '이전';
}
export function notificationTime(createdAt: string, now: Date): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '날짜 미등록';
  const elapsed = Math.max(0, now.getTime() - date.getTime());
  if (elapsed < 60_000) return '방금';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}분 전`;
  const group = notificationGroup(createdAt, now);
  if (group === '오늘') return `${Math.floor(elapsed / 3_600_000)}시간 전`;
  if (group === '어제') return '어제';
  if (group === '이번 주') return weekday.format(date);
  const parts = seoulDate.formatToParts(date);
  return ['month', 'day'].map(type => parts.find(p => p.type === type)?.value).join('.');
}
export function groupNotifications<T extends { created_at: string }>(items: T[], now: Date) {
  const groups: { label: NotificationGroup; items: T[] }[] = ['오늘', '어제', '이번 주', '이전'].map(label => ({ label: label as NotificationGroup, items: [] }));
  for (const item of [...items].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))) {
    groups.find(group => group.label === notificationGroup(item.created_at, now))!.items.push(item);
  }
  return groups.filter(group => group.items.length);
}
export function notificationIcon(title: string): string {
  const icons: Record<string, string> = {
    '새 주문': 'tab_cart_on', '출고 완료': 'tab_truck_on', '입고지 도착': 'tab_truck_on', '검사 불일치': 'shield', '반송 처리': 'shield',
    '주문 취소': 'shield', '정산 완료': 'tab_won_on', '후기 완료': 'star_small_on',
    '새 메시지': 'menu_help', '새 문의 메시지': 'menu_help',
  };
  return icons[title] ?? 'menu_bell';
}
