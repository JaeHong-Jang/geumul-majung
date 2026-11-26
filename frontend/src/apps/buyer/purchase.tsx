import './purchase.css';
import './addressBook.css';
import { OrderChecklist } from '../../shared/screens/OrderChecklist';
import { OrderReceipt } from '../../shared/screens/OrderDetail';
import { readCart, writeCart } from "./cartStore";
import { useEffect, useMemo, useState } from "react";
import { api, useAction, useResource } from "../../shared/api/client";
import { BottomBar, AppButton, AppCard, Feedback, Field, Ic, InfoRow, Section, TopBar } from "../../shared/ui/index";
import { won, type Company, type Go, type Listing, type Order, type Preview } from "../../types";
import { ListingList, ListingRow } from './listing';
import { weight } from './catalog';
import { AddressPicker } from './addressBook';

/**
 * 입고지 하차 조건(주문과 함께 서버에 저장, 판매자 주문 화면에 보임).
 * 운송은 판매자가 맡고 운임도 판매자가 낸다. 구매자는 입고지에서 내려 줄 수 있는지만 알려 주고,
 * 판매자는 그걸 보고 차(리프트 달린 차 등)를 고른다.
 */
export interface Dock { unload: 'forklift' | 'crane' | 'both' | 'manual' | 'none'; max_vehicle: '1t' | '2.5t' | '5t' | '11t' | '25t'; hours: string | null; note: string | null }
const VEHICLES: [Dock['max_vehicle'], string, number][] = [['1t', '1t', 1000], ['2.5t', '2.5t', 2500], ['5t', '5t', 5000], ['11t', '11t', 11000], ['25t', '25t 이상', 25000]];
const HOURS = ['평일 09:00~18:00', '평일 08:00~17:00', '평일 07:00~19:00'];
const DEFAULT_DOCK: Dock = { unload: 'forklift', max_vehicle: '11t', hours: HOURS[0]!, note: null };
const dockKey = (address: string) => `buyer:dock:${address}`;
const readDock = (address: string): Dock => {
  try {
    const saved = JSON.parse(localStorage.getItem(dockKey(address)) ?? '{}') as Partial<Dock> & { unload?: string };
    const unload = ['forklift', 'crane', 'both', 'manual', 'none'].includes(saved.unload ?? '') ? saved.unload as Dock['unload'] : DEFAULT_DOCK.unload;
    return { ...DEFAULT_DOCK, ...saved, unload };
  } catch { return DEFAULT_DOCK; }
};
/** 고른 장비로 서버 값을 정한다. 하차 가능인데 장비를 안 고르면 인력 하차. */
const unloadOf = (forklift: boolean, crane: boolean): Dock['unload'] => forklift && crane ? 'both' : forklift ? 'forklift' : crane ? 'crane' : 'manual';

export function Purchase({ id, ids, go, back }: { id: number | undefined; ids: number[] | undefined; go: Go; back: () => void }) {
  const listingIds = useMemo(() => ids ?? (id ? [id] : []), [ids, id]);
  const transport = "seller";   // 운송은 판매자가 맡는다(운송 방식 선택 없음)
  const [date, setDate] = useState("");
  const [delivery, setDelivery] = useState("");
  const [note, setNote] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [dock, setDock] = useState<Dock | null>(null);
  const [taxInvoice, setTaxInvoice] = useState(true);
  const [taxEmail, setTaxEmail] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview>();
  const [previewKey, setPreviewKey] = useState("");
  const [previewError, setPreviewError] = useState("");
  const a = useAction();
  // 고른 매물을 하나씩 불러온다(전체 목록에서 찾으면 목록 개수 제한에 걸려 빠질 수 있음)
  const [chosen, setChosen] = useState<Listing[]>([]);
  useEffect(() => {
    let active = true;
    void Promise.all(listingIds.map((lid) => api<Listing>("buyer", `/listings/${lid}`).catch(() => null)))
      .then((rows) => { if (active) setChosen(rows.filter((x): x is Listing => !!x && typeof x.price_krw_per_kg === "number" && typeof x.total_kg === "number")); });
    return () => { active = false; };
  }, [listingIds]);
  const profile = useResource<Company>("buyer", "/me/profile");
  const email = taxEmail ?? profile.data?.email ?? "";
  const totalKg = chosen.reduce((s, l) => s + l.total_kg, 0);
  // 입고지가 정해지면 그 입고지에 지난번 고른 조건을 불러온다
  const d = dock ?? readDock(delivery);
  const setD = (patch: Partial<Dock>) => setDock({ ...d, ...patch });
  const canUnload = d.unload !== 'none';
  const hasForklift = d.unload === 'forklift' || d.unload === 'both';
  const hasCrane = d.unload === 'crane' || d.unload === 'both';
  const maxKg = VEHICLES.find(([v]) => v === d.max_vehicle)?.[2] ?? Infinity;
  const heaviest = Math.max(0, ...chosen.map((l) => l.total_kg));
  const emailOk = !taxInvoice || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  const currentPreviewKey = `${listingIds.join(",")}:${transport}`;
  useEffect(() => {
    let active = true;
    void api<Preview>("buyer", "/orders/preview", "POST", { listing_ids: listingIds, transport, payment: "escrow" })
      .then((p) => { if (active) { setPreview(p); setPreviewKey(currentPreviewKey); setPreviewError(""); } })
      .catch((e) => { if (active) setPreviewError((e as Error).message); });
    return () => { active = false; };
  }, [listingIds, transport, currentPreviewKey]);

  // 서버가 운임을 보류액에 넣은 항목(구매자 부담)만 빼고 계산한다. 판매자 부담이면 0
  const heldFreight = preview?.items.reduce<number>((sum, item) => {
    const i = item as { freight_cap_krw?: number; freight_payer?: string };
    return sum + (i.freight_payer === "seller" ? 0 : i.freight_cap_krw ?? 0);
  }, 0) ?? 0;
  async function submit() {
    const dockBody = { dock: { ...d, hours: d.hours?.trim() || null, note: d.note?.trim() || null } };
    if (delivery) localStorage.setItem(dockKey(delivery), JSON.stringify(d));
    await a.run(
      () => api<Order | { orders: Order[] }>("buyer", ids ? "/orders/batch" : "/orders", "POST", {
        ...(ids ? { listing_ids: listingIds } : { listing_id: id }),
        transport, payment: "escrow", delivery_address: delivery, ...(date ? { desired_date: date } : {}), note, ...dockBody,
        ...(taxInvoice ? { tax_invoice: { email: email.trim() } } : {}),
      }),
      (result) => {
        writeCart(readCart().filter((l) => !listingIds.includes(l.id)));
        go({ name: "done", orders: "orders" in result ? result.orders : [result] });
      },
    );
  }
  return (
    <>
      <TopBar title="구매 요청" back={back} />
      <ListingList>{chosen.map((l) => <ListingRow key={l.id} l={l} go={go} />)}</ListingList>
      <Section title="구매 수량">
        <AppCard className="card16">
          <InfoRow label={`선택 매물 ${listingIds.length}건 전체`} value={totalKg ? weight(totalKg) : '확인 중'} />
        </AppCard>
      </Section>
      <Section title="입고지">
        <AddressPicker value={delivery} onChange={(v) => { setDelivery(v); setDock(null); }} />
        <Field label="희망 도착일 (선택)" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Section>
      <Section title="입고지 하차 조건">
        <div className="dock-steps">
          <section className="dock-step">
            <h3><span>1</span>입고지에서 하차 가능 여부</h3>
            <div className="dock-choice" role="radiogroup" aria-label="하차 가능 여부">
              <button type="button" role="radio" aria-checked={canUnload} onClick={() => setD({ unload: canUnload ? d.unload : 'forklift' })}>
                <b>하차 가능</b><small>입고지에서 직접 내려 줌</small>
              </button>
              <button type="button" role="radio" aria-checked={!canUnload} onClick={() => setD({ unload: 'none' })}>
                <b>하차 불가</b><small>리프트 달린 차나 운송 차량이 직접 하차</small>
              </button>
            </div>
            {canUnload && (
              <>
                <p className="dock-sub">하차에 쓰는 장비 (여러 개 선택)</p>
                <div className="dock-equip" role="group" aria-label="하차 장비">
                  <button type="button" aria-pressed={hasForklift} onClick={() => setD({ unload: unloadOf(!hasForklift, hasCrane) })}>지게차</button>
                  <button type="button" aria-pressed={hasCrane} onClick={() => setD({ unload: unloadOf(hasForklift, !hasCrane) })}>크레인, 호이스트</button>
                </div>
                {d.unload === 'manual' && <p className="dock-hint">장비 없이 사람이 내림. 짐이 무거우면 하차 시간이 길어질 수 있음</p>}
              </>
            )}
            {!canUnload && <p className="dock-warn"><Ic name="shield" size={16} />리프트(파워게이트) 차량으로 보내도록 판매자에게 전달</p>}
          </section>
          <section className="dock-step">
            <h3><span>2</span>들어올 수 있는 가장 큰 차</h3>
            <div className="segmented" role="group" aria-label="진입 가능 차량">
              {VEHICLES.map(([v, t]) => <button key={v} type="button" aria-pressed={d.max_vehicle === v} onClick={() => setD({ max_vehicle: v })}>{t}</button>)}
            </div>
            {heaviest > maxKg && <p className="dock-warn"><Ic name="shield" size={16} />{weight(heaviest)} 매물은 {VEHICLES.find(([v]) => v === d.max_vehicle)?.[1]} 차 한 대에 다 안 실림, 나눠 운송 또는 더 큰 차 진입 확인 필요</p>}
          </section>
          <section className="dock-step">
            <h3><span>3</span>하차 가능 시간</h3>
            <div className="dock-hours">
              {HOURS.map((h) => <button key={h} type="button" aria-pressed={d.hours === h} onClick={() => setD({ hours: h })}>{h}</button>)}
            </div>
            <Field label="직접 입력" value={d.hours ?? ''} maxLength={100} placeholder="예) 평일 09:00~16:00, 점심 12~13시 제외" onChange={(e) => setD({ hours: e.target.value })} />
          </section>
          <section className="dock-step">
            <h3><span>4</span>판매자에게 전할 말 (선택)</h3>
            <Field label="위치, 주의" value={d.note ?? ''} maxLength={200} placeholder="예) 정문 옆 2번 하역장, 도착 전 연락" onChange={(e) => setD({ note: e.target.value })} />
          </section>
        </div>
      </Section>
      <Section title="결제">
        <AppCard className="card16 pay-card">
          <div className="pay-head"><Ic name="shield" size={20} /><span><b>안전결제 (에스크로)</b><small>입고 검수가 끝나면 판매자에게 정산, 문제가 있으면 보류</small></span></div>
          <label className="row small-check"><input type="checkbox" checked={taxInvoice} onChange={(e) => setTaxInvoice(e.target.checked)} />세금계산서 발행 요청</label>
          {taxInvoice && <Field label="세금계산서 받을 이메일" type="email" value={email} placeholder="예) tax@company.co.kr" onChange={(e) => setTaxEmail(e.target.value)} />}
          {taxInvoice && !emailOk && <p className="muted tiny">{email.trim() ? "이메일 형식 확인 필요" : "세금계산서 받을 이메일 입력 필요"}</p>}
        </AppCard>
      </Section>
      <label className="field">
        판매자에게 남길 말 (선택)
        <textarea maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="예) 수거 전 연락 요청" />
      </label>
      <Feedback error={previewError} />
      {preview && previewKey === currentPreviewKey && (
        <AppCard className="card16">
          <div className="stack">
            <InfoRow label="원료비" value={won(preview.goods_krw)} />
            <InfoRow label="운임" value="판매자 부담" />
            <InfoRow label="무게 오차 대비 5%" value={won(preview.held_krw - preview.goods_krw - preview.fee_krw - heldFreight)} />
            <InfoRow label="플랫폼 수수료" value={won(preview.fee_krw)} />
            <InfoRow label="결제 보류 예상 금액" value={won(preview.held_krw)} />
          </div>
        </AppCard>
      )}
      <label className="row small-check buyer-agree">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        검수 결과에 따른 정산 금액 조정 동의
      </label>
      <Feedback {...a} />
      <BottomBar>
        {!a.busy && (!agreed || !delivery || !emailOk) && (
          <p className="muted tiny">{!delivery ? "입고지 선택 필요" : !emailOk ? "세금계산서 이메일 확인 필요" : "정산 금액 조정 동의 체크 필요"}</p>
        )}
        <AppButton disabled={a.busy || !agreed || !delivery || !emailOk || !preview || previewKey !== currentPreviewKey || !!previewError} onClick={() => void submit()}>
          구매 요청 보내기
        </AppButton>
      </BottomBar>
    </>
  );
}

const NEXT = { seller: ["판매자 출고 준비", "판매자 운송", "입고 검사", "정산"], self: ["직접 수거 준비", "수거, 운행", "입고 검사", "정산"] };

/** 구매 요청 완료: 다음 단계(가로), 주문마다 금액과 펼쳐 보는 영수증, 접힌 AI 규제 점검. */
export function RequestDone({ orders, go }: { orders: Order[]; go: Go }) {
  const self = orders.length > 0 && orders.every(o => o.transport === "self");
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <div className="stack done">
        <div className="done-check"><Ic name="check_done" /></div>
        <h1>구매 요청 완료</h1>
        <p className="muted">{self ? "직접 수거 주문 접수 완료" : "판매자에게 주문 전달 완료"}<br />진행 상황: 거래내역에서 확인</p>
      </div>
      <section className="next-row" aria-label="다음 단계">
        <b>다음 단계</b>
        <ol>
          {(self ? NEXT.self : NEXT.seller).map((s, i) => (
            <li key={s} className={i === 0 ? "on" : ""}><span>{i + 1}</span>{s}</li>
          ))}
        </ol>
      </section>
      {orders.map((o) => (
        <AppCard key={o.id} className="card16 done-order">
          <div className="stack">
            <InfoRow label="주문 번호" value={o.id} />
            <InfoRow label="원료비" value={won(o.goods_krw)} />
            <InfoRow label="결제 보류 금액" value={won(o.held_krw)} />
            <button type="button" className="done-receipt-toggle" aria-expanded={open === o.id} onClick={() => setOpen(open === o.id ? null : o.id)}>
              {open === o.id ? "주문 상세 접기" : "주문 상세 보기"}
            </button>
            {open === o.id && <OrderReceipt appRole="buyer" id={o.id} />}
            <OrderChecklist appRole="buyer" id={o.id} existingLegalNote={o.legal_note} />
            {o.legal_note && <p className="muted tiny">{o.legal_note}</p>}
          </div>
        </AppCard>
      ))}
      <BottomBar>
        <div className="done-actions">
          <AppButton outlined onClick={() => go({ name: "home" })}>홈으로</AppButton>
          <AppButton onClick={() => go({ name: "orders" })}>거래내역 보기</AppButton>
        </div>
      </BottomBar>
    </>
  );
}
