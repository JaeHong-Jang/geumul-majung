import { useEffect, useRef, useState } from 'react';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import ScrollBody from '../components/ScrollBody';
import BottomActions from '../components/BottomActions';
import Button from '../components/Button';
import { ErrorNote } from '../../../shared/ui/Note';
import { FormField } from '../components/Field';
import { useNav } from '../lib/nav';
import { api, errorText } from '../../../shared/api/seller';
import { getDraft, setDraft } from '../lib/draft';
import { photoBody } from '../lib/photo';
import { dateText, won } from '../lib/format';
import { useVoiceIntake } from '../../../shared/useVoiceIntake';
import { VoiceInput } from '../../../shared/ui/VoiceInput';
import { AgentSteps } from '../../../shared/ui/AgentSteps';
import { FREIGHT_ASSOCIATION, MAX_PHOTOS, SaleSteps, SHIP_HOURS, TRANSPORTS } from '../components/SaleParts';
import './Screen07Register.css';
import { BYPRODUCT_ITEMS } from '../../../shared/byproducts';

export { SHIP_HOURS };

// 사업장에서 많이 나오는 재활용 폐기물 7종(폐기물 코드)과 품목별 주 재질. 주 재질을 고르면 그 재질 시세로 추천가를 보인다
export const ITEMS = BYPRODUCT_ITEMS;
const OTHER = '__other';
// 시세 품목 이름(폐골판지, ABS 펠렛)에서 품목 코드와 주 재질 찾기. 긴 재질 이름을 먼저 본다(알루미늄캔 > 알루미늄)
export function fromPriceItem(name) {
  if (!name) return {};
  const hits = ITEMS.flatMap((it) => it.materials.map((m) => ({ code: it.code, material: m })))
    .filter((x) => name.toLowerCase().includes(x.material.toLowerCase()))
    .sort((a, b) => b.material.length - a.material.length);
  return hits[0] || {};
}
const PlusIcon = () => <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;

const num = (s) => Number(String(s).replace(/,/g, '').trim());
const fmtNum = (n) => Number(n).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
const sameMaterial = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();



const CameraIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
);
const AlbumIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="9" cy="10" r="1.6" fill="currentColor" /><path d="M5 17l4.5-4.5 3 3L15 13l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
);

// 판매 등록: 사진, 품목과 무게, 판매 가격(시세 추천), 출고와 운송. 아래 두 버튼으로 판매 방식을 바로 고른다
export default function Screen07Register() {
  const nav = useNav();
  const savedDraft = getDraft();
  // 홈 AI 제안(시세 상승 품목)에서 왔으면 그 품목과 재질을 미리 골라 둔다. 쓰던 내용이 있으면 그대로 둔다
  const selected = nav.params?.code && nav.params?.material ? { code: nav.params.code, material: nav.params.material } : null;
  const sameDraft = !selected || (savedDraft?.form?.code === selected.code && sameMaterial(savedDraft?.form?.material || '', selected.material));
  const d = sameDraft ? savedDraft : null;
  const f = (sameDraft && d && d.form) || selected || fromPriceItem(nav.params?.priceItem);
  const [photos, setPhotos] = useState(f.photos || []);          // [{key, url, file?, id?}]
  const [weight, setWeight] = useState(f.weight || '');
  const [weightUnit, setWeightUnit] = useState(f.weightUnit || 'kg');
  const [code, setCode] = useState(f.code || '');
  const [material, setMaterial] = useState(f.material || '');
  const item = ITEMS.find((it) => it.code === code);
  const [custom, setCustom] = useState(!!f.material && !(item?.materials || []).includes(f.material));
  const [note, setNote] = useState(f.note || '');
  const [price, setPrice] = useState(f.price || '');
  const [availableFrom, setAvailableFrom] = useState(f.availableFrom || '');
  const [pickupNote, setPickupNote] = useState(f.pickupNote || '');
  const [transport, setTransport] = useState(f.transport || 'own');
  const [shipHours, setShipHours] = useState(f.shipHours || '');
  const [forklift, setForklift] = useState(!!f.unloadForklift);
  const [crane, setCrane] = useState(!!f.unloadCrane);
  const [suggest, setSuggest] = useState(null);
  // 판매 가격을 누가 채웠는지: voice(말한 가격), market(시세 자동 입력), null(사람이 입력하거나 고름)
  const [priceBy, setPriceBy] = useState(null);
  const priceNow = useRef({ price, priceBy });
  priceNow.current = { price, priceBy };
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const camera = useRef(null);
  const album = useRef(null);
  const priceInput = useRef(null);
  // 말 입력과 재질 추천(서버 에이전트). ai = AI가 채운 칸, 사람이 고치면 표시를 뗀다
  const [ai, setAi] = useState({});
  const [steps, setSteps] = useState(null);
  const [heard, setHeard] = useState('');
  const [candidates, setCandidates] = useState([]);

  // 주 재질이 정해지면 그 재질 시세(원/kg)로 추천 단가를 받아 오고, 가격 칸이 비었거나 시세로 채운 값이면 시세로 바로 채운다.
  // 사람이 쓰거나 고른 가격, 말한 가격은 덮지 않는다
  useEffect(() => {
    const m = material.trim();
    const fill = (r) => {
      setSuggest(r);
      const { price: now, priceBy: by } = priceNow.current;
      if (by !== 'market' && now.trim()) return;
      if (r) { setPrice(String(Math.round(r.price))); setPriceBy('market'); }
      else if (by === 'market') { setPrice(''); setPriceBy(null); }   // 시세 없는 재질로 바뀌면 다른 재질 시세를 남기지 않음
    };
    if (!m) { fill(null); return undefined; }
    let alive = true;
    const t = setTimeout(() => {
      api(`/market/suggest?material=${encodeURIComponent(m)}`).then((r) => { if (alive) fill(r?.item ? r : null); }).catch(() => { if (alive) fill(null); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [material]);

  const edited = (key, setter) => (e) => {
    setter(e.target.value);
    setAi((a) => (a[key] ? { ...a, [key]: false } : a));
  };
  const label = (text, key) => (ai[key] ? <>{text}<span className="rg-ai-tag">AI 입력</span></> : text);
  // 재질 넣기: 품목 목록에 없는 재질이면 기타(직접 입력) 칸으로
  const putMaterial = (m, forCode = code) => {
    const list = ITEMS.find((it) => it.code === forCode)?.materials || [];
    const hit = list.find((x) => sameMaterial(x, m));
    setMaterial(hit || m);
    setCustom(!hit);
  };

  const applyIntake = (r) => {
    const got = r.fields || {};
    const filled = {};
    let nextCode = code;
    if (got.waste_code && ITEMS.some((it) => it.code === got.waste_code)) {
      nextCode = got.waste_code;
      setCode(nextCode);
      filled.code = true;
    }
    const mat = got.material || r.material?.auto;
    if (mat && nextCode) {
      putMaterial(mat, nextCode);
      filled.material = true;
    }
    if (got.weight_kg) {
      setWeight(String(got.weight_kg));
      setWeightUnit('kg');
      filled.weight = true;
    }
    if (got.available_from) {
      setAvailableFrom(got.available_from);
      filled.availableFrom = true;
    }
    if (got.pickup_note) {
      setPickupNote(got.pickup_note);
      filled.pickupNote = true;
    }
    if (got.note) {
      setNote(got.note);
      filled.note = true;
    }
    if (got.price_krw_per_kg) {
      setPrice(String(got.price_krw_per_kg));
      setPriceBy('voice');
    }
    setAi(filled);
    setCandidates(r.material?.candidates || []);
    setSteps(r.steps || null);
    setHeard(r.transcript || '');
  };

  // 말로 입력: 버튼을 누르면 서버 음성 인식 → 말 입력 정리 → 재질 추천
  const v = useVoiceIntake({
    status: () => api('/bags/intake/status'),
    send: (body) => api('/bags/intake', { method: 'POST', body }),
    onResult: applyIntake,
    errorText,
  });

  // 품목을 고르면 재질 추천 에이전트를 부른다(품목이 바뀌면 재질은 비우고 다시 고름)
  const pickCode = async (next) => {
    setCode(next);
    setMaterial('');
    setCustom(next === '51-99-00');
    setAi((a) => ({ ...a, code: false, material: false }));
    if (!next) return setCandidates([]);
    try {
      const r = await api(`/bags/material-suggest?waste_code=${encodeURIComponent(next)}`);
      setCandidates(r.candidates || []);
      if (r.auto) {
        putMaterial(r.auto, next);
        setAi((a) => ({ ...a, material: true }));
      }
    } catch {
      setCandidates([]);
    }
  };
  const why = candidates.find((c) => sameMaterial(c.material, material));

  const kgNum = num(weight) * (weightUnit === 't' ? 1000 : 1);
  const priceNum = num(price);
  const totalKg = kgNum;
  const total = kgNum > 0 && priceNum > 0 ? Math.round(totalKg * priceNum) : null;

  const addFiles = (list) => {
    const files = Array.from(list || []).slice(0, MAX_PHOTOS - photos.length);
    if (!files.length) return;
    setPhotos((ps) => [...ps, ...files.map((file) => ({ key: `${file.name}-${file.size}-${Math.random()}`, url: URL.createObjectURL(file), file }))].slice(0, MAX_PHOTOS));
  };
  const removePhoto = (key) => setPhotos((ps) => ps.filter((p) => p.key !== key));

  const submit = async (mode) => {
    if (busy) return;
    setError(null);
    const items = [{ material: material.trim(), kg: kgNum }];
    if (!code) return setError('품목 선택 필요');
    if (!material.trim()) return setError('주 재질 선택 필요, 목록에 없으면 기타로 직접 입력');
    if (!(kgNum > 0)) return setError('무게는 0보다 큰 숫자로 입력');
    if (totalKg > 50000) return setError('한 번에 등록하는 무게는 합계 50t 이하');
    if (!(priceNum > 0)) { setError('kg당 판매 가격 입력 필요'); priceInput.current?.focus(); return; }

    const form = { mode, photos, weight, weightUnit, code, material, extra: [], note, price, availableFrom, pickupNote, transport, shipHours,
      unloadForklift: forklift, unloadCrane: crane };
    const sig = JSON.stringify([code, items, note.trim()]);
    if (d?.bag && d.sig !== sig) { setError('이미 등록한 물품은 품목, 재질, 무게, 메모를 바꿀 수 없음, 판매 가격과 출고 정보는 수정 가능'); return; }
    setBusy(true);
    try {
      let { bag, grade } = d && d.sig === sig && d.bag ? d : {};
      if (!bag) {
        bag = await api('/bags', {
          method: 'POST',
          body: { waste_code: code, target_material: material.trim(), items, ...(note.trim() ? { note: note.trim() } : {}) },
        });
        setDraft({ sig, bag, form });
      }
      if (!grade) grade = await api(`/bags/${bag.id}/grade`, { method: 'POST', body: {} });
      // 사진: 새로 고른 것만 올리고, 빼낸 것은 서버에서도 지운다
      let photoError = null;
      const kept = [];
      for (const p of photos) {
        if (p.id) { kept.push(p); continue; }
        try {
          const r = await api(`/bags/${bag.id}/photos`, { method: 'POST', body: await photoBody(p.file) });
          kept.push({ ...p, id: r.id });
        } catch (e) {
          photoError = `사진 업로드 실패, ${errorText(e)}`;
        }
      }
      for (const id of d?.photoIds || []) {
        if (!kept.some((p) => p.id === id)) await api(`/bag-photos/${id}`, { method: 'DELETE' }).catch(() => {});
      }
      setDraft({ sig, bag, grade, photoError, photoIds: kept.map((p) => p.id), form: { ...form, photos: kept } });
      nav.go('confirm');
    } catch (e) {
      setError(errorText(e));
      const saved = getDraft();
      if (saved?.bag) setDraft({ ...saved, form });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen id="register">
      <ScreenHeader title="판매 등록" back />
      <ScrollBody>
        <SaleSteps at={0} />

        <VoiceInput v={v} example="예: PP 사출 자투리 300kg, 다음 주 화요일부터, 정문 지게차 앞" />
        <AgentSteps steps={steps} heard={heard} footer="AI 입력 칸은 확인 후 제출, 자동 제출 없음" />

        <section className="sale-section" aria-label="사진">
          <h2>사진<small>선택, 최대 {MAX_PHOTOS}장</small></h2>
          <div className="sale-photo-grid">
            {photos.map((p, i) => (
              <span key={p.key}>
                <img src={p.url} alt={`첨부 사진 ${i + 1}`} />
                <button type="button" aria-label={`사진 ${i + 1} 빼기`} onClick={() => removePhoto(p.key)}>✕</button>
              </span>
            ))}
            {Array.from({ length: MAX_PHOTOS - photos.length }, (_, i) => <span key={`e${i}`} className="empty" aria-hidden="true"><PlusIcon /></span>)}
          </div>
          <div className="sale-photo-actions">
            <button type="button" disabled={photos.length >= MAX_PHOTOS} onClick={() => camera.current?.click()}><CameraIcon />사진 촬영</button>
            <button type="button" disabled={photos.length >= MAX_PHOTOS} onClick={() => album.current?.click()}><AlbumIcon />앨범에서 선택</button>
          </div>
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden aria-label="사진 촬영"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          <input ref={album} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden aria-label="앨범에서 사진 선택"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        </section>

        <section className="sale-section" aria-label="품목과 무게">
          <h2>품목과 무게</h2>
          <label className="form-field">
            <span className="t-label">{label('품목 *', 'code')}</span>
            <select className="field rg-select" value={code} onChange={(e) => pickCode(e.target.value)}>
              <option value="">품목 선택</option>
              {ITEMS.map((it) => <option key={it.code} value={it.code}>{it.name}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span className="t-label">{label('주 재질 *', 'material')}</span>
            <select className="field rg-select" value={custom ? OTHER : material} disabled={!code}
              onChange={(e) => { setAi((a) => ({ ...a, material: false })); if (e.target.value === OTHER) { setCustom(true); setMaterial(''); } else { setCustom(false); setMaterial(e.target.value); } }}>
              <option value="">{code ? '주 재질 선택' : '품목 먼저 선택'}</option>
              {(item?.materials || []).map((m) => <option key={m} value={m}>{m}</option>)}
              <option value={OTHER}>기타 (직접 입력)</option>
            </select>
          </label>
          {custom && <FormField label={label('주 재질 직접 입력 *', 'material')} placeholder="예: 스티로폼, 폐유리" value={material} onChange={edited('material', setMaterial)} />}
          {candidates.length > 0 && (
            <div className="rg-chips" role="group" aria-label="재질 후보">
              {candidates.map((c) => (
                <button type="button" key={c.material} className={`rg-chip${sameMaterial(c.material, material) ? ' is-on' : ''}`}
                  aria-pressed={sameMaterial(c.material, material)}
                  onClick={() => { putMaterial(c.material); setAi((a) => ({ ...a, material: false })); }}>
                  {c.material}
                </button>
              ))}
            </div>
          )}
          {why && why.reasons.length > 0 && <p className="rg-ai-why">{`재질 추천 근거: ${why.reasons.join(', ')}`}</p>}
          <div className="sale-unit-row">
            <FormField label={label(`무게 (${weightUnit}) *`, 'weight')} placeholder={weightUnit === 't' ? '예: 1.5' : '예: 800'} inputMode="decimal" value={weight} onChange={edited('weight', setWeight)} />
            <div className="sale-unit" role="group" aria-label="무게 단위">
              {['kg', 't'].map((u) => (
                <button key={u} type="button" aria-pressed={weightUnit === u} onClick={() => {
                  if (u === weightUnit) return;
                  if (weight && num(weight) > 0) setWeight(String(u === 't' ? num(weight) / 1000 : Math.round(num(weight) * 1000 * 1000) / 1000));
                  setWeightUnit(u);
                }}>{u}</button>
              ))}
            </div>
          </div>
          {kgNum > 0 && <p className="sale-help">{weightUnit === 't' ? `= ${fmtNum(kgNum)}kg` : kgNum >= 1000 ? `= ${fmtNum(kgNum / 1000)}t` : ''}</p>}
          <FormField label={label('메모 (선택)', 'note')} placeholder="구매자에게 보임, 예: 세척 완료, 이물질 거의 없음" value={note} onChange={edited('note', setNote)} />
        </section>

        <section className="sale-section" aria-label="판매 가격">
          <h2>판매 가격<small>원/kg</small></h2>
          {suggest ? (
            <div className="sale-suggest">
              <small>시세 기준 추천 판매가</small>
              <b>{`${fmtNum(suggest.suggest_low)}~${fmtNum(suggest.suggest_high)}원/kg`}</b>
              <p>{`현재 시세 ${suggest.item} ${fmtNum(suggest.price)}원/kg (${dateText(suggest.date)}, 전국), 지역별 ${fmtNum(suggest.region_low)}~${fmtNum(suggest.region_high)}원/kg. 한국환경공단 재활용 시세, 부가세 포함, 물류비 제외`}</p>
              <div className="sale-chips" role="group" aria-label="추천가 넣기">
                {[['낮게', suggest.suggest_low], ['시세', Math.round(suggest.price)], ['높게', suggest.suggest_high]].map(([label, v]) => (
                  <button key={label} type="button" aria-pressed={priceNum === v} onClick={() => { setPrice(String(v)); setPriceBy(null); }}>{`${label} ${fmtNum(v)}원`}</button>
                ))}
              </div>
            </div>
          ) : (
            <p className="sale-help">{material.trim() ? '이 재질은 공개 시세 자료가 없어 추천가 없음' : '주 재질을 고르면 시세 기준 추천가를 보임'}</p>
          )}
          <FormField ref={priceInput} label={priceBy ? <>kg당 판매 가격 *<span className="rg-ai-tag">AI 입력</span></> : 'kg당 판매 가격 *'} placeholder="원/kg" inputMode="numeric" value={price}
            onChange={(e) => { setPrice(e.target.value); setPriceBy(null); }} />
          {priceBy && <p className="rg-ai-why">{priceBy === 'market' ? `현재 시세 ${suggest ? `${suggest.item} ` : ''}기준 자동 입력, 낮게나 높게를 누르거나 직접 고쳐 쓸 수 있음` : '말한 가격으로 입력'}</p>}
          <p className="sale-help">재활용 시세가 kg당 가격으로 나오므로 판매 가격도 kg 기준</p>
          {total != null && <p className="sale-help"><b>{`예상 판매금액 ${won(total)}`}</b>{` (${fmtNum(totalKg)}kg × ${fmtNum(priceNum)}원)`}</p>}
        </section>

        <section className="sale-section" aria-label="출고와 운송">
          <h2>출고와 운송<small>운임은 판매자 부담</small></h2>
          <FormField label={label('출고 가능일 (선택)', 'availableFrom')} type="date" value={availableFrom} onChange={edited('availableFrom', setAvailableFrom)} />
          <label className="form-field">
            <span className="t-label">출고 가능 시간 (선택)</span>
            <select className="field rg-select" value={shipHours} onChange={(e) => setShipHours(e.target.value)}>
              <option value="">구매자와 조율</option>
              {SHIP_HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </label>
          <span className="t-label">운송 방법</span>
          <div className="sale-options" role="radiogroup" aria-label="운송 방법">
            {Object.entries(TRANSPORTS).map(([k, t]) => (
              <button key={k} type="button" role="radio" aria-checked={transport === k} className="sale-option" onClick={() => setTransport(k)}>
                <span className="sale-option__dot" aria-hidden="true" />
                <span><b>{t.title}</b><small>{t.desc}</small></span>
              </button>
            ))}
          </div>
          {transport === 'matched' && (
            <div className="sale-call">
              <span>
                <b>화물차를 직접 구할 때</b>
                <small>{FREIGHT_ASSOCIATION.name}</small>
                <small className="nowrap">{FREIGHT_ASSOCIATION.phone}</small>
              </span>
              <a href={`tel:${FREIGHT_ASSOCIATION.phone.replace(/-/g, '')}`}>📞 전화 연결</a>
            </div>
          )}
          <span className="t-label">입고지 하차 지원 (선택)</span>
          <div className="sale-toggles" role="group" aria-label="입고지 하차 지원">
            <button type="button" className="sale-toggle" aria-pressed={forklift} onClick={() => setForklift((v) => !v)}><b>지게차 지원</b><small>지게차를 함께 보냄</small></button>
            <button type="button" className="sale-toggle" aria-pressed={crane} onClick={() => setCrane((v) => !v)}><b>크레인 지원</b><small>카고크레인으로 내림</small></button>
          </div>
          <FormField label={label('현장 안내 (선택)', 'pickupNote')} placeholder="예: 정문 지게차 앞에 보관" value={pickupNote} onChange={edited('pickupNote', setPickupNote)} />
        </section>

        <ErrorNote error={error} />
      </ScrollBody>
      <BottomActions height={96}>
        <div className="sale-modes">
          <Button variant="secondary" onClick={() => submit('bundle')} disabled={busy}>모아서 판매하기</Button>
          <Button onClick={() => submit('now')} disabled={busy}>{busy ? '확인 중…' : '바로 판매하기'}</Button>
        </div>
      </BottomActions>
    </Screen>
  );
}
