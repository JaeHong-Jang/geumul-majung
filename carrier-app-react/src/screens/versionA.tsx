import { useEffect, useRef } from "react";
import MapView from "../components/MapView";
import { AcceptFooter, BackFloat, CompactRow, EmptyCard, FareBreak, FilterChip, GradeTag, Ic, Kpis, Metrics, NavLink, OrderCard, SortChips, Steps, Stops, SwitchRow, Tabs, TripAction, TripBody } from "../components/ui";
import { DEPOT } from "../lib/data";
import { won, tripTitle } from "../lib/orders";
import type { ScreenProps } from "./api";

export function AHome({ a }: ScreenProps) {
  const nearest = a.list.slice().sort((x, y) => x.emptyKm - y.emptyKm)[0];
  return (
    <>
      <div className="view">
        <MapView kind="pins" {...a.mapProps} orders={a.list} onPin={a.open} />
        <div className="float-top">
          <button type="button" className="pill" onClick={() => a.say("차고지 변경은 마이에서 합니다")}><Ic k="pin" s={16} />{DEPOT.name}</button>
          <button type="button" className="round" aria-label="알림" onClick={() => a.say("새 알림 1건: 묶음 요청이 등록됐습니다")}><Ic k="bell" /><span className="dot" /></button>
        </div>
        <div className="sheet">
          <SwitchRow online={a.online} onToggle={a.toggle} />
          {a.online ? (
            <>
              <Kpis />
              <div className="row between"><span className="t16 b">가장 가까운 요청</span><button type="button" className="btn line" onClick={() => a.go("orders")}>전체 보기</button></div>
              {nearest && <CompactRow o={nearest} onClick={() => a.open(nearest.id)} />}
            </>
          ) : (
            <>
              <button type="button" className="btn lg full" onClick={a.toggle}><Ic k="play" />운행 시작</button>
              <Kpis />
            </>
          )}
        </div>
      </div>
      <Tabs screen="home" go={a.go} />
    </>
  );
}

export function AOrders({ a }: ScreenProps) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const s = box.current?.querySelector<HTMLElement>(".card.selected");
    if (s && box.current) box.current.scrollTop = s.offsetTop - box.current.offsetTop;
  }, [a.id, a.sort]);
  return (
    <>
      <div className="view">
        <MapView kind="selected" {...a.mapProps} order={a.order} />
        <div className="float-top"><span className="pill num">요청 {a.list.length}건 · 필터 {a.filterCount}개</span></div>
        <div className="sheet" style={{ height: "52%" }}>
          <div className="chips"><FilterChip count={a.filterCount} onClick={a.openFilters} /><SortChips sort={a.sort} setSort={a.setSort} /></div>
          <div className="scroll-in" ref={box}>
            {a.list.map((o) => <OrderCard key={o.id} o={o} selected={o.id === a.id} saved={a.isSaved(o.id)} onClick={() => (o.id === a.id ? a.open(o.id) : a.select(o.id))} />)}
            {!a.list.length && <EmptyCard onReset={a.resetAll} />}
          </div>
        </div>
      </div>
      <Tabs screen="orders" go={a.go} />
    </>
  );
}

export function ADetail({ a }: ScreenProps) {
  const o = a.order;
  return (
    <>
      <div className="view">
        <MapView kind="selected" {...a.mapProps} order={o} />
        <BackFloat go={a.go} onLocate={a.locate} saved={a.isSaved(o.id)} onSave={a.toggleSaved} />
        <div className="sheet">
          <div className="scroll-in">
            <div className="row between">
              <div className="stack-1"><span className="t12 dim m">총 운임 · 수수료 0원</span><span className="t28 b green num">{won(o.fare)}</span></div>
              <div className="row wrap" style={{ justifyContent: "flex-end" }}><GradeTag o={o} /><span className="tag">{o.pay}</span></div>
            </div>
            <Metrics o={o} />
            <div className="card"><Stops o={o} /></div>
            <div className="card"><FareBreak o={o} /></div>
          </div>
        </div>
      </div>
      <AcceptFooter cd={a.cd} go={a.go} onAccept={a.accept} onRetry={a.retry} />
    </>
  );
}

export function ATrip({ a }: ScreenProps) {
  const t = a.trip, o = a.tripOrder;
  return (
    <>
      <div className="view">
        <MapView kind="trip" {...a.mapProps} order={o} trip={t} />
        <div className="float-top" style={{ display: "block" }}>
          <div className="card" style={{ boxShadow: "var(--shadow)" }}><span className="t14 b">{tripTitle(t, o)}</span><Steps stage={t.stage} /></div>
        </div>
        <div className="sheet">
          <TripBody t={t} o={o} onScan={a.scan} />
          <div className="row">
            <button type="button" className="btn line grow" onClick={() => a.say("담당자에게 전화를 겁니다 (시연)")}><Ic k="phone" />담당자</button>
            <NavLink t={t} o={o} grow />
          </div>
          <TripAction t={t} onStage={a.stage} go={a.go} />
        </div>
      </div>
      <Tabs screen="trip" go={a.go} />
    </>
  );
}
