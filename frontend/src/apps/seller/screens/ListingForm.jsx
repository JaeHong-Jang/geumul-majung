import { useRef, useState } from 'react';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import ScrollBody from '../components/ScrollBody';
import Button from '../components/Button';
import { FormField } from '../components/Field';
import { ErrorNote } from '../../../shared/ui/Note';
import { api, errorText } from '../../../shared/api/seller';
import { useNav } from '../lib/nav';
import { SHIP_HOURS, TRANSPORTS } from '../components/SaleParts';
export default function ListingForm({listing, detail, bags, back, onSaved, relist = false}) {
  const nav = useNav();
  const priceInput = useRef(null);
  const [price, setPrice] = useState(String(listing?.price_krw_per_kg ?? ''));
  const [date, setDate] = useState(detail.available_from || '');
  const [note, setNote] = useState(detail.pickup_note || '');
  const [transport, setTransport] = useState(detail.terms?.transport || 'matched');
  const [shipHours, setShipHours] = useState(detail.terms?.ship_hours || '');
  const [forklift, setForklift] = useState(!!detail.terms?.unload_forklift);
  const [crane, setCrane] = useState(!!detail.terms?.unload_crane);
  const [mode, setMode] = useState(listing?.mode || 'now');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function save(e) {
    e.preventDefault();
    if (!price.trim() || !(Number(price.replaceAll(',', '')) > 0)) { setError('kg당 판매 가격은 0보다 큰 숫자로 입력 필요'); priceInput.current?.focus(); return; }
    setBusy(true); setError(null);
    try {
      const body = {price_krw_per_kg:Number(price.replaceAll(',','')), available_from: date || null, pickup_note:note, transport, unload_forklift:forklift, unload_crane:crane, ...(shipHours ? {ship_hours:shipHours} : {})};
      if (!relist && Number(price.replaceAll(',', '')) === Number(listing.price_krw_per_kg)) delete body.price_krw_per_kg;
      if (relist) Object.assign(body, {bag_ids:bags.map(b => b.id), mode});
      const result = await api(relist ? '/listings' : `/listings/${listing.id}`, {method:relist ? 'POST' : 'PATCH', body});
      if (relist) nav.go('bag', {listing:result.id});
      else await onSaved();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return <Screen id="listingEdit"><ScreenHeader title={relist ? '다시 판매 등록' : '판매 정보 수정'} back onBack={back} /><ScrollBody><form className="stack" onSubmit={save} noValidate>
    {relist && <label className="field">판매 방식<select value={mode} onChange={e => setMode(e.target.value)}><option value="now">바로 판매</option><option value="bundle">모아서 판매</option></select></label>}
    <FormField ref={priceInput} label="kg당 판매 가격" required value={price} onChange={e => setPrice(e.target.value)} />
    <FormField label="출고 가능일" type="date" value={date} onChange={e => setDate(e.target.value)} />
    <FormField label="현장 안내" value={note} onChange={e => setNote(e.target.value)} />
    <label className="field">운송 방법 (운임은 판매자 부담)<select value={transport} onChange={e => setTransport(e.target.value)}>{Object.entries(TRANSPORTS).map(([k, t]) => <option key={k} value={k}>{t.title}</option>)}</select></label>
    <label className="field">출고 가능 시간<select value={shipHours} onChange={e => setShipHours(e.target.value)}><option value="">구매자와 조율</option>{SHIP_HOURS.map(h => <option key={h} value={h}>{h}</option>)}</select></label>
    <label className="sale-check"><input type="checkbox" checked={forklift} onChange={e => setForklift(e.target.checked)} /><span>지게차로 하차 지원</span></label>
    <label className="sale-check"><input type="checkbox" checked={crane} onChange={e => setCrane(e.target.checked)} /><span>크레인으로 하차 지원</span></label>
    <ErrorNote error={error} /><Button type="submit" disabled={busy}>{relist ? '판매 등록' : '수정 저장'}</Button>
  </form></ScrollBody></Screen>;
}
