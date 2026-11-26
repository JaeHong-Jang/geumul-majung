"""공공 좌표가 없는 공장의 주소를 행안부 주소검색 → 좌표제공 API로 좌표로 바꾼다.
실행: JUSO_SEARCH_KEY=... JUSO_COORD_KEY=... python scripts/geocode_factories.py <service_factories.csv> <결과.csv> [개수]
이미 결과에 있는 공장은 건너뛰므로 끊겨도 다시 돌리면 이어진다. 결과는 저장소 밖에 둔다. 키는 어디에도 찍지 않는다.
검색 결과가 여럿이고 주소가 똑같이 맞는 것이 없으면 짐작하지 않고 ambiguous로 남긴다."""
import csv
import os
import re
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.features.auth.juso import COORD_URL, LINK_URL, in_korea, utmk_to_wgs84  # noqa: E402

FIELDS = ["factory_id", "status", "lat", "lon", "matched_address"]
ROAD_RE = re.compile(r"^(.*?[로길]\s+\d+(?:-\d+)?)(?![\d가-힣])")     # 창경궁로1길 14: 로 바로 뒤 숫자는 도로 이름의 일부
ROAD_GLUED_RE = re.compile(r"^(.*?[로길]\d+(?:-\d+)?)(?=\s|$)")     # 경인로154처럼 붙여 쓴 주소
LOT_RE = re.compile(r"^(.*?[동리가]\s*(?:산\s*)?\d+(?:-\d+)?)(?!\d)")
PAUSE_S = 1.0           # E0007(짧은 시간 다량 요청)이 0.3초 간격에서는 나오고 1초 간격에서는 안 났다
BACKOFF_S = (10, 30, 60)
MAX_API_ERRORS = 5          # 연속으로 이만큼 API 오류면 멈춘다(한도 초과·키 문제)


class ApiStop(RuntimeError):
    """키·한도 문제처럼 계속 돌려도 소용없는 오류. 메시지에 키·주소를 싣지 않는다."""


class Throttled(RuntimeError):
    """E0007: 기다렸다가 같은 공장을 다시 시도한다."""


def clean_address(address: str) -> str:
    head = re.split(r"[,(]", address)[0].strip()
    match = ROAD_RE.match(head) or ROAD_GLUED_RE.match(head) or LOT_RE.match(head)
    return re.sub(r"\s+", " ", match.group(1) if match else head).strip()


def _norm(text: str) -> str:
    return re.sub(r"\s+", "", text or "")


def pick(query: str, rows: list[dict]) -> dict | None:
    """결과가 하나면 그것, 여럿이면 도로명·지번 주소가 검색어와 똑같은 것이 하나일 때만 고른다."""
    if len(rows) == 1:
        return rows[0]
    same = [r for r in rows if _norm(query) in (_norm(r.get("roadAddrPart1")), _norm(r.get("jibunAddr")))]
    return same[0] if len(same) == 1 else None


def call(client: httpx.Client, url: str, params: dict) -> list[dict]:
    response = client.get(url, params={**params, "resultType": "json"})
    response.raise_for_status()
    results = response.json()["results"]
    code = str(results["common"]["errorCode"])
    if code == "0":
        return results.get("juso") or []
    if code == "E0007":
        raise Throttled(code)
    if code in ("E0005", "E0006"):      # 검색어 없음·주소를 상세히 입력: 이 주소만의 문제
        return []
    raise ApiStop(f"errorCode {code}")


def geocode(client: httpx.Client, address: str, search_key: str, coord_key: str) -> dict:
    query = clean_address(address)
    rows = call(client, LINK_URL, {"confmKey": search_key, "keyword": query, "currentPage": 1, "countPerPage": 10})
    if not rows:
        return {"status": "not_found"}
    row = pick(query, rows)
    if row is None:
        return {"status": "ambiguous"}
    codes = {k: row[k] for k in ("admCd", "rnMgtSn", "udrtYn", "buldMnnm", "buldSlno")}
    points = call(client, COORD_URL, {"confmKey": coord_key, **codes})
    if not points or not points[0].get("entX"):
        return {"status": "no_coord", "matched_address": row.get("roadAddrPart1", "")}
    lat, lon = utmk_to_wgs84(float(points[0]["entX"]), float(points[0]["entY"]))
    if not in_korea(lat, lon):
        return {"status": "out_of_korea", "matched_address": row.get("roadAddrPart1", "")}
    return {"status": "ok", "lat": f"{lat:.7f}", "lon": f"{lon:.7f}", "matched_address": row.get("roadAddrPart1", "")}


def geocode_patiently(client: httpx.Client, address: str, search_key: str, coord_key: str) -> dict:
    for wait in BACKOFF_S:
        try:
            return geocode(client, address, search_key, coord_key)
        except Throttled:
            time.sleep(wait)
    raise ApiStop("errorCode E0007 계속됨")


def main(source: Path, out: Path, limit: int | None) -> None:
    search_key, coord_key = os.environ["JUSO_SEARCH_KEY"], os.environ["JUSO_COORD_KEY"]
    done = set()
    if out.exists():
        with out.open(encoding="utf-8", newline="") as f:
            done = {r["factory_id"] for r in csv.DictReader(f)}
    with source.open(encoding="utf-8-sig", newline="") as f:
        todo = [r for r in csv.DictReader(f) if r["좌표_출처"] != "공공" and r["factory_id"] not in done]
    todo = todo[:limit] if limit else todo
    print(f"이미 처리 {len(done)}, 이번 대상 {len(todo)}", flush=True)
    out.parent.mkdir(parents=True, exist_ok=True)
    errors = 0
    is_new = not out.exists()
    with out.open("a", encoding="utf-8", newline="") as f, httpx.Client(timeout=15) as client:
        writer = csv.DictWriter(f, FIELDS, extrasaction="ignore")
        if is_new:
            writer.writeheader()
        for n, row in enumerate(todo, 1):
            try:
                result = geocode_patiently(client, row["주소"], search_key, coord_key)
                errors = 0
            except (ApiStop, httpx.HTTPError, KeyError, ValueError) as e:
                errors += 1
                print(f"{n}번째 오류: {type(e).__name__} {e if isinstance(e, ApiStop) else ''}", flush=True)
                if errors >= MAX_API_ERRORS:
                    sys.exit(f"연속 오류 {errors}회로 멈춤. 다시 실행하면 이어집니다. 처리 {n - errors}/{len(todo)}")
                time.sleep(2)
                continue
            writer.writerow({"factory_id": row["factory_id"], **result})
            f.flush()
            if n % 250 == 0:
                print(f"진행 {n}/{len(todo)}", flush=True)
            time.sleep(PAUSE_S)
    print(f"끝: 이번 처리 {len(todo)}", flush=True)


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        sys.exit(__doc__)
    main(Path(sys.argv[1]), Path(sys.argv[2]), int(sys.argv[3]) if len(sys.argv) == 4 else None)
