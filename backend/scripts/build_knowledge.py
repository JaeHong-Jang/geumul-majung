"""공모전 폴더의 정리된 자료를 지식 검색(app/tools/knowledge.py)용 파일로 만든다.
실행: python scripts/build_knowledge.py <공모전 폴더> <출력 폴더>   출력은 저장소 밖에 둔다(원자료 표 배포 금지).

공개 조건(data/22_데이터검증/VERDICT.md 용도 B)을 여기서 지킨다.
- 카카오 좌표를 넣지 않는다: 원본의 공공 좌표와 행안부 변환 좌표(scripts/geocode_factories.py의 결과)만 옮기고, 없으면 비운다.
- 업체명에 '개인'이 든 행은 뺀다. 공장 표에는 사업자번호·연락처·현재 위탁처를 옮기지 않는다.
- re.or.kr 자료: 순환자원 인정은 품목·유형별 집계로만, 환경성평가 승인은 신청 업체명·주소를 빼고 옮기며 출처를 적는다.
"""
import csv
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

REPO_DATA = Path(__file__).resolve().parents[2] / "data"
RE_OR_KR = "순환자원정보센터(re.or.kr)"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def doc(kind: str, id_: str, title: str, text: str, source: str, url: str = "") -> dict:
    return {"kind": kind, "id": id_, "title": title, "text": text, "source": source, "url": url}


def law_docs() -> list[dict]:
    return [doc("law", a["id"], f"{a['article']} {a['title']}", a["summary"], a["law"], a.get("url", ""))
            for a in read_json(REPO_DATA / "law_articles.json")]


def recognition_docs(rows: list[dict]) -> list[dict]:
    groups = defaultdict(list)
    for r in rows:
        groups[(r["material"], r["use"])].append(r)
    out = []
    for i, ((material, use), items) in enumerate(sorted(groups.items()), 1):
        years = sorted(r["year"] for r in items)
        regions = Counter(r["region"].split()[0] for r in items if r.get("region")).most_common(3)
        where = ", ".join(f"{name} {n}건" for name, n in regions)
        text = f"{material}을 {use} 용도로 순환자원 인정받은 사례 {len(items)}건({years[0]}~{years[-1]}년). 많은 지역: {where}."
        out.append(doc("recognition", f"REC-AGG-{i}", f"순환자원 인정 집계: {material}", text, f"{RE_OR_KR} 순환자원 인정 집계"))
    return out


def eval_docs(rows: list[dict]) -> list[dict]:
    return [doc("evaluation", f"EVAL-{r['no']}", f"환경성평가 승인 {r['no']}: {r['waste']}",
                f"{r['date']} 승인. 폐기물 {r['waste']}({r['wasteCode']}). 방법: {r['method']}",
                f"{RE_OR_KR} 재활용환경성평가 승인") for r in rows]


def cement_docs(rows: list[dict]) -> list[dict]:
    return [doc("cement", f"CEM-{i}", f"{r['company']} {r['plant']} {r['period']} {r['wasteType']}",
                f"{r['company']} {r['plant']}이 {r['period']}에 {r['wasteType']} {r['amountT']}톤을 반입(원산지 {r['origin']}). 성분: {r.get('components') or '공개 없음'}",
                f"{r['company']} 분기 공개 자료", r.get("url", "")) for i, r in enumerate(rows, 1)]


def stat_docs(rows: list[dict]) -> list[dict]:
    return [doc("stat", f"STAT-{i}", f"{r['year']}년 {r['scope']} {r['category']} {r['item']}",
                f"{r['year']}년 {r['scope']} {r['category']} {r['item']} 발생량 {r['amountT']}{r['unit']}.",
                "전국 폐기물 통계(2024)") for i, r in enumerate(rows, 1)]


def rule_docs(types: list[dict], criteria: list[dict]) -> list[dict]:
    out = [doc("rule", t["code"], f"재활용 유형 {t['code']} {t['name']}", t.get("note") or t["name"], "폐기물관리법 시행규칙 별표 5의3")
           for t in types]
    out += [doc("rule", c["id"], f"{c['recyclingType']} 기준: {c['item']}", f"{c['text']} (적용: {c['appliesTo']})", "폐기물관리법 시행규칙 별표 5의3")
            for c in criteria]
    return out


def read_juso_coords(path: Path) -> dict[str, tuple[float, float]]:
    if not path.is_file():
        return {}
    with path.open(encoding="utf-8", newline="") as f:
        return {r["factory_id"]: (float(r["lat"]), float(r["lon"])) for r in csv.DictReader(f) if r["status"] == "ok"}


def factories(path: Path, juso: dict[str, tuple[float, float]] | None = None) -> tuple[list[dict], Counter]:
    out, counts = [], Counter()
    with path.open(encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            if "개인" in r["회사명"]:
                counts["개인 제외"] += 1
                continue
            lat, lon, coord = None, None, None
            if r["좌표_출처"] == "공공" and r["lat"]:
                lat, lon, coord = float(r["lat"]), float(r["lon"]), "public"
            elif r["factory_id"] in (juso or {}):
                lat, lon = juso[r["factory_id"]]
                coord = "juso"
            counts[f"좌표 {coord or '없음'}"] += 1
            out.append({"id": r["factory_id"], "name": r["회사명"], "park": r["단지명"], "sido": r["시도"], "sigungu": r["시군구"],
                        "products": r["생산품"], "industry": r["업종_묶음"], "wastes": r["폐기물_목록"], "summary": r["폐기물_요약"],
                        "completeness": r["최고_완전도"], "lat": lat, "lon": lon, "coord_source": coord})
    return out, counts


def main(source: Path, out_dir: Path) -> None:
    processed = source / "masdae-pass" / "data" / "processed"
    docs = (law_docs()
            + rule_docs(read_json(processed / "recycling_types.json"), read_json(processed / "criteria.json"))
            + recognition_docs(read_json(processed / "recognitions.json"))
            + eval_docs(read_json(processed / "eval_approvals.json"))
            + cement_docs(read_json(processed / "cement_disclosures.json"))
            + stat_docs(read_json(processed / "waste_stats.json")))
    juso = read_juso_coords(out_dir.parent / "coords" / "factory_juso_coords.csv")
    plants, counts = factories(source / "data" / "60_서비스데이터셋" / "service_factories.csv", juso)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "docs.json").write_text(json.dumps(docs, ensure_ascii=False), encoding="utf-8")
    (out_dir / "factories.json").write_text(json.dumps(plants, ensure_ascii=False), encoding="utf-8")
    print("문서", dict(Counter(d["kind"] for d in docs)), "합계", len(docs))
    print("공장", len(plants), dict(counts))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(Path(sys.argv[1]), Path(sys.argv[2]))
