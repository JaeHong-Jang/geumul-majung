import { describe, expect, it } from "vitest";
import { ACCEPT_SECONDS, BAGS_TO_SCAN, initialState, parsePersisted, reducer } from "./appState";

describe("앱 상태", () => {
  it("콜을 열면 제한시간을 새로 시작한다", () => {
    const s = reducer(initialState({ cd: 3 }), { type: "open", id: 7 });
    expect(s).toMatchObject({ id: 7, cd: ACCEPT_SECONDS, screen: "detail" });
  });
  it("제한시간은 0 아래로 내려가지 않는다", () => expect(reducer(initialState({ cd: 0 }), { type: "tick" }).cd).toBe(0));
  it("시간이 끝난 콜은 수락되지 않는다", () => {
    const s = initialState({ cd: 0, screen: "detail", id: 3 });
    expect(reducer(s, { type: "accept" })).toBe(s);
  });
  it("수락하면 고른 콜로 운행을 처음부터 시작한다", () => {
    expect(reducer(initialState({ id: 3 }), { type: "accept" })).toMatchObject({ screen: "trip", trip: { id: 3, stage: 0, scanned: 0 } });
  });
  it("마대를 전부 스캔하기 전에는 상차 완료로 못 넘어간다", () => {
    const s = initialState({ trip: { id: 1, stage: 1, scanned: BAGS_TO_SCAN - 1 } });
    expect(reducer(s, { type: "stage" }).trip.stage).toBe(1);
    const scanned = reducer(s, { type: "scan" });
    expect(reducer(scanned, { type: "stage" }).trip.stage).toBe(2);
  });
  it("스캔 수와 단계는 끝을 넘지 않는다", () => {
    const s = initialState({ trip: { id: 1, stage: 4, scanned: BAGS_TO_SCAN } });
    expect(reducer(s, { type: "scan" }).trip.scanned).toBe(BAGS_TO_SCAN);
    expect(reducer(s, { type: "stage" }).trip.stage).toBe(4);
  });
  it("콜 저장을 켜고 끈다", () => {
    const on = reducer(initialState(), { type: "toggleSaved", id: 2 });
    expect(on.saved).toEqual([2]);
    expect(reducer(on, { type: "toggleSaved", id: 2 }).saved).toEqual([]);
  });
});

describe("저장 값 읽기", () => {
  it("정상 값을 읽는다", () => {
    expect(parsePersisted(JSON.stringify({ version: "c", sort: "near", saved: [1, 2] }))).toEqual({ version: "c", sort: "near", saved: [1, 2] });
  });
  it("깨진 값은 그 항목만 버린다", () => {
    expect(parsePersisted(JSON.stringify({ version: "z", sort: "near", saved: ["x"], filters: { fit: 1 } }))).toEqual({ sort: "near" });
    expect(parsePersisted("{깨진 JSON")).toEqual({});
    expect(parsePersisted(null)).toEqual({});
  });
});
