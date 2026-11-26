import { useState } from 'react';
import { BYPRODUCT_ITEMS, MAX_BYPRODUCTS, OTHER_CODE, itemName, type Byproduct } from '../byproducts';
import './byproduct-picker.css';

/** 품목 칩을 누르면 그 품목의 주 재질 칩이 열리고, 재질 칩을 누를 때마다 추가와 해제. */
export function ByproductPicker({ value, onChange }: { value: Byproduct[]; onChange: (rows: Byproduct[]) => void }) {
  const [code, setCode] = useState('');
  const [custom, setCustom] = useState('');
  const [message, setMessage] = useState('');
  const item = BYPRODUCT_ITEMS.find(it => it.code === code);
  const full = value.length >= MAX_BYPRODUCTS;
  const has = (c: string, m: string) => value.some(row => row.code === c && row.material.toLowerCase() === m.toLowerCase());
  const countOf = (c: string) => value.filter(row => row.code === c).length;
  function toggle(material: string) {
    const text = material.trim();
    if (!code || !text) return;
    if (has(code, text)) {
      onChange(value.filter(row => !(row.code === code && row.material.toLowerCase() === text.toLowerCase())));
      setMessage(`${text} 삭제 완료`);
      return;
    }
    if (full) return;
    onChange([...value, { code, material: text }]);
    setMessage(`${itemName(code)}, ${text} 추가 완료`);
  }
  const customText = custom.trim();
  return <section className="byp" aria-label="발생 폐기물 및 부산물">
    <div className="byp-chips" role="group" aria-label="품목">
      {BYPRODUCT_ITEMS.map(it => <button key={it.code} type="button" className="byp-chip" aria-pressed={code === it.code} onClick={() => { setCode(code === it.code ? '' : it.code); setCustom(''); }}>
        {itemName(it.code)}{countOf(it.code) > 0 && <b className="byp-count">{countOf(it.code)}</b>}
      </button>)}
    </div>
    {item && <div className="byp-materials">
      <p className="byp-hint">{item.code === OTHER_CODE ? '재질 또는 부산물명 직접 입력' : `${itemName(item.code)}의 주 재질, 여러 개 선택 가능`}</p>
      {item.materials.length > 0 && <div className="byp-chips" role="group" aria-label="주 재질">
        {item.materials.map(m => <button key={m} type="button" className="byp-chip small" aria-pressed={has(item.code, m)} disabled={full && !has(item.code, m)} onClick={() => toggle(m)}>{m}</button>)}
      </div>}
      <div className="byp-custom">
        <label className="field"><span>{item.code === OTHER_CODE ? '재질 또는 부산물명' : '목록에 없는 재질'}</span>
          <input maxLength={100} placeholder={item.code === OTHER_CODE ? '예: 혼합 플라스틱, 공정 부산물' : '직접 입력'} value={custom} onChange={e => setCustom(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (customText && !has(code, customText)) { toggle(customText); setCustom(''); } } }} />
        </label>
        <button type="button" className="app-button outlined" aria-label="품목 추가" disabled={!customText || has(code, customText) || full} onClick={() => { toggle(customText); setCustom(''); }}>추가</button>
      </div>
    </div>}
    {full && <p className="byp-hint">최대 {MAX_BYPRODUCTS}개까지 추가 가능</p>}
    <section className="byp-picked" aria-label="추가한 품목">
      {value.length ? <ul>{value.map((row, index) => <li key={`${row.code}:${row.material}`}>
        <span><strong>{row.material}</strong><small>{itemName(row.code)}</small></span>
        <button type="button" aria-label={`${itemName(row.code)} ${row.material} 삭제`} onClick={() => { onChange(value.filter((_, i) => i !== index)); setMessage(`${row.material} 삭제 완료`); }}>×</button>
      </li>)}</ul> : <p className="byp-hint">품목을 누르고 주 재질 선택</p>}
    </section>
    <p className="byp-message" role="status">{message}</p>
  </section>;
}
