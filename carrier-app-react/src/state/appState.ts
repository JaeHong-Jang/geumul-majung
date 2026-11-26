/* 앱 전체 상태. 화면 코드와 분리해 상태 변화만 따로 테스트한다. */
import type { Filters, ScreenId, SortKey, Trip, TripStage, Version } from "../types";
import { DEFAULT_FILTERS } from "../lib/orders";

export const ACCEPT_SECONDS = 45;
export const BAGS_TO_SCAN = 18;

export interface AppState {
  version: Version;
  screen: ScreenId;
  online: boolean;
  id: number;
  sort: SortKey;
  filters: Filters;
  q: string;
  bmap: boolean;
  filterOpen: boolean;
  cd: number;
  trip: Trip;
  saved: number[];
}

export type Action =
  | { type: "version"; version: Version }
  | { type: "go"; screen: ScreenId }
  | { type: "toggleOnline" }
  | { type: "select"; id: number }
  | { type: "open"; id: number }
  | { type: "sort"; sort: SortKey }
  | { type: "query"; q: string }
  | { type: "toggleMap" }
  | { type: "filterSheet"; open: boolean }
  | { type: "filters"; filters: Filters }
  | { type: "tick" }
  | { type: "retry" }
  | { type: "accept" }
  | { type: "scan" }
  | { type: "stage" }
  | { type: "toggleSaved"; id: number };

export function initialState(overrides: Partial<AppState> = {}): AppState {
  return { version: "b", screen: "home", online: false, id: 1, sort: "fare", filters: DEFAULT_FILTERS, q: "", bmap: false, filterOpen: false, cd: ACCEPT_SECONDS, trip: { id: 1, stage: 1, scanned: 12 }, saved: [], ...overrides };
}

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case "version": return { ...s, version: a.version, filterOpen: false };
    case "go": return { ...s, screen: a.screen, filterOpen: false };
    case "toggleOnline": return { ...s, online: !s.online };
    case "select": return { ...s, id: a.id };
    case "open": return { ...s, id: a.id, cd: ACCEPT_SECONDS, screen: "detail", filterOpen: false };
    case "sort": return { ...s, sort: a.sort };
    case "query": return { ...s, q: a.q };
    case "toggleMap": return { ...s, bmap: !s.bmap };
    case "filterSheet": return { ...s, filterOpen: a.open };
    case "filters": return { ...s, filters: a.filters };
    case "tick": return { ...s, cd: Math.max(0, s.cd - 1) };
    case "retry": return { ...s, cd: ACCEPT_SECONDS };
    case "accept": return s.cd > 0 ? { ...s, trip: { id: s.id, stage: 0, scanned: 0 }, screen: "trip" } : s;
    case "scan": return { ...s, trip: { ...s.trip, scanned: Math.min(BAGS_TO_SCAN, s.trip.scanned + 1) } };
    case "stage": {
      if (s.trip.stage === 1 && s.trip.scanned < BAGS_TO_SCAN) return s;
      return { ...s, trip: { ...s.trip, stage: Math.min(4, s.trip.stage + 1) as TripStage } };
    }
    case "toggleSaved": return { ...s, saved: s.saved.includes(a.id) ? s.saved.filter((x) => x !== a.id) : [...s.saved, a.id] };
  }
}

/* 브라우저에 남겨 다음 방문에도 쓰는 값 */
const KEY = "carrier-app:v1";
export interface Persisted { version?: Version; sort?: SortKey; filters?: Filters; saved?: number[] }

const isVersion = (x: unknown): x is Version => x === "a" || x === "b" || x === "c";
const isSort = (x: unknown): x is SortKey => x === "fare" || x === "near" || x === "per";
const isNumOrNull = (x: unknown): x is number | null => x === null || typeof x === "number";
function isFilters(x: unknown): x is Filters {
  if (typeof x !== "object" || x === null) return false;
  const f = x as Record<string, unknown>;
  return typeof f.fit === "boolean" && Array.isArray(f.types) && f.types.every((t) => typeof t === "string") && (f.region === "all" || f.region === "local" || f.region === "far") && isNumOrNull(f.maxEmptyKm) && isNumOrNull(f.minPerKm) && typeof f.savedOnly === "boolean";
}

/** 저장 값이 깨졌거나 옛 형식이면 그 항목만 버린다 */
export function parsePersisted(raw: string | null): Persisted {
  if (!raw) return {};
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const out: Persisted = {};
    if (isVersion(p.version)) out.version = p.version;
    if (isSort(p.sort)) out.sort = p.sort;
    if (isFilters(p.filters)) out.filters = p.filters;
    if (Array.isArray(p.saved) && p.saved.every((n) => typeof n === "number")) out.saved = p.saved as number[];
    return out;
  } catch {
    return {};
  }
}
export function loadPersisted(): Persisted {
  try {
    return parsePersisted(localStorage.getItem(KEY));
  } catch {
    return {};
  }
}
export function savePersisted(s: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: s.version, sort: s.sort, filters: s.filters, saved: s.saved } satisfies Persisted));
  } catch {
    /* 저장소를 쓸 수 없어도 앱은 그대로 동작한다 */
  }
}
