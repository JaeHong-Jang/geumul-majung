export function validateForm(form: HTMLFormElement): string | null {
 for(const field of Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select'))) {
  const label = field.labels?.[0]?.textContent?.trim() || field.getAttribute('aria-label') || '입력값';
  const invalid = field.required && !field.value.trim() || field instanceof HTMLInputElement && (field.type === 'email' && !!field.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value) || field.minLength > 0 && field.value.length < field.minLength || field.type === 'number' && (!Number.isFinite(Number(field.value)) || Number(field.value) <= 0));
  if(invalid) { field.focus(); return `${label} 입력값 확인 필요${field instanceof HTMLInputElement && field.minLength > 0 ? ` ${field.minLength}자 이상 입력 필요` : ''}`; }
 }
 return null;
}
