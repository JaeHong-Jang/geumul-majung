import type { MapCommon } from "../components/MapView";
import type { Filters, Order, ScreenId, SortKey, Trip, Version } from "../types";

/** 화면 컴포넌트가 쓰는 값과 동작 */
export interface ScreenApi {
  version: Version;
  online: boolean;
  list: Order[];
  id: number;
  order: Order;
  tripOrder: Order;
  trip: Trip;
  sort: SortKey;
  filters: Filters;
  filterCount: number;
  q: string;
  bmap: boolean;
  cd: number;
  isSaved: (id: number) => boolean;
  mapProps: MapCommon;
  toggle: () => void;
  go: (s: ScreenId) => void;
  open: (id: number) => void;
  select: (id: number) => void;
  say: (m: string) => void;
  locate: () => void;
  setSort: (k: SortKey) => void;
  setQ: (q: string) => void;
  toggleMap: () => void;
  openFilters: () => void;
  resetAll: () => void;
  accept: () => void;
  retry: () => void;
  scan: () => void;
  stage: () => void;
  toggleSaved: () => void;
}
export interface ScreenProps { a: ScreenApi }
