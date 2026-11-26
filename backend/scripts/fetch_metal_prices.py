"""국제 비철금속 월평균 가격(달러/톤)과 월평균 원/달러 환율을 한국은행 경제통계(ECOS)에서 받아 data/metal_prices.json에 쓴다.
실행: python scripts/fetch_metal_prices.py [시작월 YYYYMM] [끝월 YYYYMM]   (생략하면 이번 달까지 최근 14개월, 아직 안 나온 달은 건너뜀)
키: 환경변수 ECOS_API_KEY, 없으면 로컬 설정 파일($MASDAE_HOME 또는 ~/.local/share/masdae의 local.env),
그것도 없으면 ECOS 견본 키(한 번에 10행)로 나눠 받는다. 키는 어디에도 찍지 않는다.
원/kg = 달러/톤 × 원/달러 ÷ 1000. 정련 금속 국제 가격이라 스크랩 매입가가 아니다."""
import json
import os
import sys
from datetime import date
from pathlib import Path

import httpx

OUT = Path(__file__).resolve().parents[2] / "data" / "metal_prices.json"
BASE = "https://ecos.bok.or.kr/api/StatisticSearch"
METALS = {"040202": "구리", "040203": "알루미늄", "040204": "니켈", "040201": "아연"}   # 902Y003 국제상품가격
FX = ("731Y004", "0000001", "0000100")   # 주요국 통화의 대원화환율, 원/미국달러(매매기준율), 평균자료


def months(start: str, end: str) -> list[str]:
    y, m, out = int(start[:4]), int(start[4:]), []
    while f"{y}{m:02d}" <= end:
        out.append(f"{y}{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def api_key() -> str:
    if os.environ.get("ECOS_API_KEY"):
        return os.environ["ECOS_API_KEY"]
    env = Path(os.environ.get("MASDAE_HOME") or Path.home() / ".local/share/masdae") / "local.env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith("ECOS_API_KEY=") and line.split("=", 1)[1].strip():
                return line.split("=", 1)[1].strip()
    return "sample"


def fetch(stat: str, items: list[str], start: str, end: str) -> dict[str, float]:
    key = api_key()
    span = months(start, end)
    out: dict[str, float] = {}
    for i in range(0, len(span), 10):   # 견본 키는 10행까지
        part = span[i:i + 10]
        url = f"{BASE}/{key}/json/kr/1/10/{stat}/M/{part[0]}/{part[-1]}/" + "/".join(items)
        rows = httpx.get(url, timeout=30).json().get("StatisticSearch", {}).get("row", [])
        out |= {r["TIME"]: float(r["DATA_VALUE"]) for r in rows}
    return out


def main(start: str, end: str) -> None:
    fx = fetch(FX[0], list(FX[1:]), start, end)
    rows = []
    for code, metal in METALS.items():
        usd = fetch("902Y003", [code], start, end)
        for month in sorted(usd):
            if month in fx:
                rows.append({"metal": metal, "month": f"{month[:4]}-{month[4:]}", "usd_per_ton": usd[month],
                             "krw_per_usd": fx[month], "krw_per_kg": round(usd[month] * fx[month] / 1000, 1)})
    OUT.write_text(json.dumps({"source": "D3-METAL", "retrieved": date.today().isoformat(), "rows": rows},
                              ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(rows)}행 저장: {OUT}")


if __name__ == "__main__":
    today = date.today()
    end = sys.argv[2] if len(sys.argv) > 2 else f"{today.year}{today.month:02d}"
    y, m = int(end[:4]), int(end[4:]) - 13
    while m < 1:
        y, m = y - 1, m + 12
    main(sys.argv[1] if len(sys.argv) > 1 else f"{y}{m:02d}", end)
