import { Input } from "../../../shared/ui/primitives";
/**
 * Seller / Field — 흰 배경 입력칸(353 × 48).
 * 피그마의 회색 예시 문구는 placeholder로 넣었습니다.
 */
export function Field({ placeholder = '입력', type = 'text', className = '', ...rest }) {
  return <Input className={`app-input ${className}`} type={type} placeholder={placeholder} {...rest} />;
}

/** 굵은 라벨 + 입력칸 묶음 (높이 77, 간격 6) */
export function FormField({ label, placeholder, type, className = '', ...rest }) {
  return (
    <label className={`form-field ${className}`}>
      <span className="t-label">{label}</span>
      <Field placeholder={placeholder} type={type} {...rest} />
    </label>
  );
}

export default Field;
