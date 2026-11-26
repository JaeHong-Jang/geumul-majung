import type { LocalData, RoadGraph, RoadGraphMeta } from "./types";

declare global {
  interface Window {
    /** public 데이터 스크립트가 넣는 값. 앱 코드보다 먼저 읽힌다 */
    TILES?: Record<string, string>;
    ROAD_GRAPH?: RoadGraph & { meta: RoadGraphMeta };
    LOCAL_DATA?: LocalData;
  }
}
export {};
