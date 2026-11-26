import MapView from "../components/MapView";
import { AcceptFooter, BackFloat, EmptyCard, GradeTag, Ic, Kpis, Metrics, NavLink, OrderCard, Steps, SwitchRow, Tabs, Tags, TripAction, TripBody } from "../components/ui";
import { DEPOT } from "../lib/data";
import { routeTitle, won, tripTitle } from "../lib/orders";
import type { ScreenProps } from "./api";

export function CHome({ a }: ScreenProps) {
  const first = a.list[0];
  return (
    <>
      <div className="view">
        <MapView kind="pins" {...a.mapProps} orders={a.list} onPin={a.open} />
        <div className="float-top"><span className="pill"><Ic k="pin" s={16} />{DEPOT.name}</span></div>
        <div className="sheet">
          {a.online ? (
            <>
              {first ? (
                <>
                  <div className="stack-1"><span className="t12 dim m">콜 받는 중</span><span className="t20 b">새 콜이 도착했습니다</span></div>
                  <OrderCard o={first} saved={a.isSaved(first.id)} onClick={() => a.open(first.id)} />
                </>
              ) : <SwitchRow online={a.online} onToggle={a.toggle} />}
              <button type="button" className="btn line full" onClick={a.toggle}>콜 받기 끄기</button>
            </>
          ) : (
            <>
              <button type="button" className="bigstart" onClick={a.toggle}><Ic k="play" s={32} />운행 시작</button>
              <Kpis />
            </>
          )}
        </div>
      </div>
      <Tabs screen="home" go={a.go} />
    </>
  );
}

export function COrders({ a }: ScreenProps) {
  const i = Math.max(0, a.list.findIndex((o) => o.id === a.id));
  const o = a.list[i];
  const step = (d: number) => {
    const next = a.list[(i + d + a.list.length) % a.list.length];
    if (next) a.select(next.id);
  };
  if (!o) {
    return (
      <>
        <div className="view"><div className="scroll"><EmptyCard onReset={a.resetAll} /></div></div>
        <Tabs screen="orders" go={a.go} />
      </>
    );
  }
  return (
    <>
      <div className="view">
        <MapView kind="selected" {...a.mapProps} order={o} />
        <div className="float-top"><span className="pill num">콜 {i + 1} / {a.list.length}</span></div>
        <div className="sheet">
          <div className="row wrap"><Tags o={o} /></div>
          <span className="t20 b">{routeTitle(o)}</span>
          <span className="t28 b green num">{won(o.fare)}</span>
          <Metrics o={o} />
          <div className="row">
            <button type="button" className="btn line grow" onClick={() => step(-1)}><Ic k="back" />이전</button>
            <button type="button" className="btn line grow" onClick={() => step(1)}>다음<Ic k="next" /></button>
          </div>
          <button type="button" className="btn lg full" onClick={() => a.open(o.id)}>이 콜 자세히 보기</button>
        </div>
      </div>
      <Tabs screen="orders" go={a.go} />
    </>
  );
}

export function CDetail({ a }: ScreenProps) {
  const o = a.order;
  return (
    <>
      <div className="view">
        <MapView kind="selected" {...a.mapProps} order={o} />
        <BackFloat go={a.go} onLocate={a.locate} saved={a.isSaved(o.id)} onSave={a.toggleSaved} />
        <div className="sheet">
          <div className="row between">
            <div className="stack grow">
              <div className="row wrap"><GradeTag o={o} /><span className="tag">{o.pay}</span></div>
              <span className="t28 b green num">{won(o.fare)}</span>
              <span className="t16 b">{routeTitle(o)}</span>
            </div>
            <div className="ring" style={{ background: `conic-gradient(var(--primary) ${Math.round((a.cd / 45) * 360)}deg,var(--line) 0)` }}><b className="num">{a.cd}</b></div>
          </div>
          <Metrics o={o} />
          <span className="t14 m">{o.item} · 마대 {o.bags}개 · {o.ton}t · {o.when}</span>
        </div>
      </div>
      <AcceptFooter cd={a.cd} lg go={a.go} onAccept={a.accept} onRetry={a.retry} />
    </>
  );
}

export function CTrip({ a }: ScreenProps) {
  const t = a.trip, o = a.tripOrder;
  return (
    <>
      <div className="view">
        <MapView kind="trip" {...a.mapProps} order={o} trip={t} />
        <div className="sheet">
          <div className="stack"><span className="t20 b">{tripTitle(t, o)}</span><Steps stage={t.stage} /></div>
          <TripBody t={t} o={o} onScan={a.scan} />
          <NavLink t={t} o={o} />
          <TripAction t={t} onStage={a.stage} go={a.go} />
        </div>
      </div>
      <Tabs screen="trip" go={a.go} />
    </>
  );
}
