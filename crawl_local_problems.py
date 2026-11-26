"""로컬실록지리지(scoutedu.kr/localHeroes) '문제발굴' 글 전체를 CSV 하나로 저장한다.

실행: python crawl_local_problems.py
결과: 같은 폴더의 local_problems.csv (엑셀에서 바로 열리도록 UTF-8 BOM)
"""
import csv
import json
import time
import urllib.request
from pathlib import Path

API = "https://scoutedu.kr/api1/api/v1/localheroes/region-opinions"
OUT = Path(__file__).with_name("local_problems.csv")
DELAY = 0.2  # 요청 사이 대기(초). 서버에 부담을 주지 않기 위함


def get_json(url, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30) as res:
                return json.load(res)
        except Exception as e:
            if attempt == retries - 1:
                raise
            print(f"  재시도 {attempt + 1}: {e}")
            time.sleep(2)


def fetch_list():
    items, page = [], 1
    while True:
        d = get_json(f"{API}?regionOpinionType=QUESTION&size=100&page={page}")
        items += d["data"]
        last = d["pageable"]["last_page"]
        print(f"목록 {page}/{last} 페이지 ({len(items)}건)")
        if page >= last:
            return items
        page += 1
        time.sleep(DELAY)


def to_row(d):
    addr = (d.get("address") or "").split()
    row = {
        "id": d["id"],
        "문제제시": d["title"],
        "부연설명": d["content"],
        "우편번호": d.get("zipcode"),
        "주소": d.get("address"),
        "상세주소": d.get("address_detail"),
        "시도": addr[0] if addr else "",
        "시군구": addr[1] if len(addr) > 1 else "",
        "해시태그": ", ".join(d.get("tags") or []),
        "작성유형": "팀" if d.get("region_opinion_member_type") == "TEAM" else "개인",
        "작성자": (d.get("writer") or {}).get("name"),
        "구성원": d.get("individual_username")
        or ", ".join(x for x in [d.get("team_leader"), d.get("team_member")] if x),
        "팀명": d.get("team_name"),
        "조회수": d.get("views"),
        "인용수": d.get("quote_count"),
        "작성일": (d.get("created_at") or "")[:10],
        "근거수": len(d.get("reasons") or []),
    }
    for i, r in enumerate(sorted(d.get("reasons") or [], key=lambda r: r.get("order") or 0), 1):
        row[f"근거{i}"] = (r.get("reason") or "").strip()
        row[f"근거{i}_출처"] = " | ".join(s["source"].strip() for s in r.get("sources") or [] if s.get("source"))
        row[f"근거{i}_첨부"] = " | ".join(f["original_filename"] for f in r.get("files") or [])
    return row


def main():
    items = fetch_list()
    rows = []
    for n, item in enumerate(items, 1):
        try:
            rows.append(to_row(get_json(f"{API}/{item['id']}")))
        except Exception as e:  # 상세 실패 시 목록 정보만이라도 남김
            print(f"  상세 실패 id={item['id']}: {e}")
            rows.append(to_row({**item, "reasons": []}))
        if n % 50 == 0 or n == len(items):
            print(f"상세 {n}/{len(items)}")
        time.sleep(DELAY)

    # 근거 개수가 글마다 달라서, 가장 많은 글 기준으로 열을 만든다
    columns = []
    for row in rows:
        for k in row:
            if k not in columns:
                columns.append(k)
    base = [c for c in columns if not c.startswith("근거") or c == "근거수"]
    max_r = max((r["근거수"] for r in rows), default=0)
    reason_cols = [f"근거{i}{s}" for i in range(1, max_r + 1) for s in ("", "_출처", "_첨부")]
    with OUT.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=base + reason_cols)
        w.writeheader()
        w.writerows(rows)
    print(f"완료: {len(rows)}건 → {OUT}")


if __name__ == "__main__":
    main()
