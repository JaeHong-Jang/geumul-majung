import MapView from "../components/MapView";
import { AcceptFooter, BackFloat, EmptyCard, FareBreak, FilterChip, Ic, Kpis, Metrics, NavLink, OrderCard, SortChips, Steps, Stops, SwitchRow, Tabs, Tags, TripAction, TripBody } from "../components/ui";
import { DEPOT } from "../lib/data";
import { won, tripTitle } from "../lib/orders";
import type { ScreenProps } from "./api";

export function BHome({ a }: ScreenProps) {
  return (
    <>
      <div className="view">
        <div className="appbar">
          <div className="bar-title">
            <span className="row t20 b"><Ic k="pin" s={16} />{DEPOT.name}</span>
            <button type="button" className="round flat" aria-label="알림" onClick={() => a.say("새 알림 1건: 묶음 요청이 등록됐습니다")}><Ic k="bell" /><span className="dot" /></button>
          </div>
          <div className="bar-body">
            <span className="tag g"><Ic k="truck" s={16} />5톤 윙바디 · 경북 89바 1234</span>
            <span className="tag y"><Ic k="check" s={16} />통과증 스캐너 인증</span>
          </div>
        </div>
        <div className="scroll">
          <div className="card"><SwitchRow online={a.online} onToggle={a.toggle} /></div>
          <Kpis />
          <div className="row between">
            <span className="t16 b">받을 수 있는 요청 <span className="green num">{a.list.length}건</span></span>
            <button type="button" className="btn line" onClick={() => a.go("orders")}>전체 보기</button>
          </div>
          {a.list.slice(0, 3).map((o) => <OrderCard key={o.id} o={o} saved={a.isSaved(o.id)} onClick={() => a.open(o.id)} />)}
          {!a.list.length && <EmptyCard onReset={a.resetAll} />}
        </div>
      </div>
      <Tabs screen="home" go={a.go} />
    </>
  );
}

export function BOrders({ a }: ScreenProps) {
  return (
    <>
      <div className="view">
        <div className="appbar">
          <div className="bar-title"><span className="t20 b">운반 요청 <span className="num">{a.list.length}</span>건</span></div>
          <div className="bar-body">
            <label className="search grow"><Ic k="search" s={16} /><input id="q" aria-label="출발지, 도착지, 품목, 콜 종류 검색" placeholder="출발지, 도착지, 품목, 콜 종류" value={a.q} onChange={(e) => a.setQ(e.target.value)} /></label>
          </div>
        </div>
        <div className="subbar">
          <div className="chips"><FilterChip count={a.filterCount} onClick={a.openFilters} /><SortChips sort={a.sort} setSort={a.setSort} /></div>
        </div>
        {a.bmap ? <MapView kind="pins" {...a.mapProps} orders={a.list} onPin={a.open} style={{ marginTop: "var(--s3)" }} /> : (
          <div className="scroll has-fab">
            {a.list.map((o) => <OrderCard key={o.id} o={o} saved={a.isSaved(o.id)} onClick={() => a.open(o.id)} />)}
            {!a.list.length && <EmptyCard onReset={a.resetAll} />}
          </div>
        )}
        <button type="button" className="btn fab" data-bmap onClick={a.toggleMap}><Ic k={a.bmap ? "list" : "map"} />{a.bmap ? "목록 보기" : "지도 보기"}</button>
      </div>
      <Tabs screen="orders" go={a.go} />
    </>
  );
}

export function BDetail({ a }: ScreenProps) {
  const o = a.order;
  return (
    <>
      <div className="view">
        <MapView kind="selected" {...a.mapProps} order={o} fixed height={280} />
        <BackFloat go={a.go} onLocate={a.locate} saved={a.isSaved(o.id)} onSave={a.toggleSaved} />
        <div className="scroll">
          <div className="card">
            <div className="row between">
              <span className="stack-1"><span className="t12 dim m">총 운임 · 수수료 0원</span><span className="t28 b green num">{won(o.fare)}</span></span>
              <span className="stack-1 right"><span className="t12 dim">공차 포함 km당</span><span className="t14 b num">{won(o.perKm)}</span></span>
            </div>
            <Metrics o={o} />
            <div className="row wrap"><Tags o={o} /><span className="tag">{o.pay}</span></div>
          </div>
          <div className="card"><Stops o={o} /></div>
          <div className="card"><FareBreak o={o} /></div>
          <div className="card">
            <div className="stack" style={{ gap: "var(--s3)" }}>
              <div className="list-row"><span className="t14">품목</span><span className="t14 b">{o.item}</span></div>
              <div className="list-row"><span className="t14">마대 · 중량</span><span className="t14 b num">{o.bags}개 · {o.ton}t</span></div>
              <div className="list-row"><span className="t14">화주 평점</span><span className="t14 b num">{o.rating} / 5.0</span></div>
            </div>
          </div>
        </div>
      </div>
      <AcceptFooter cd={a.cd} go={a.go} onAccept={a.accept} onRetry={a.retry} />
    </>
  );
}

export function BTrip({ a }: ScreenProps) {
  const t = a.trip, o = a.tripOrder;
  return (
    <>
      <div className="view">
        <div className="appbar">
          <div className="bar-title"><span className="t20 b">{tripTitle(t, o)}</span><span className="t12 dim num">PASS-2026-000123</span></div>
          <div className="bar-body"><Steps stage={t.stage} /></div>
        </div>
        <div className="scroll">
          <TripBody t={t} o={o} onScan={a.scan} />
          {t.stage === 1 && (
            <div className="card">
              <div className="stack" style={{ gap: "var(--s3)" }}>
                <div className="list-row"><span className="stack-1"><span className="t14 b num">KM-0042-000883</span><span className="t12 dim">PP · 198kg · 순도 98.1%</span></span><Ic k="check" /></div>
                <div className="list-row"><span className="stack-1"><span className="t14 b num">KM-0042-000879</span><span className="t12 warn">사진에서 PE 혼입 의심</span></span><button type="button" className="btn line" onClick={() => a.say("적재 사진을 엽니다 (시연)")}>사진 보기</button></div>
              </div>
            </div>
          )}
          <div className="card flush"><MapView kind="trip" {...a.mapProps} order={o} trip={t} fixed height={176} /></div>
          <NavLink t={t} o={o} />
        </div>
        <div className="footer"><TripAction t={t} onStage={a.stage} go={a.go} /></div>
      </div>
      <Tabs screen="trip" go={a.go} />
    </>
  );
}
