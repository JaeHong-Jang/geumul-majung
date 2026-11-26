"""행정안전부 도로명주소 좌표제공 API로 도로명주소를 좌표로 바꾼다(ARCHITECTURE §14.5). 결과는 저장해도 되는 공공 데이터다.

공식 샘플(apiSampleJSON)과 테스트 키 `TESTJUSOGOKR`의 실제 응답, 그리고 승인받은 좌표제공 키의 실제 응답(양재동 → 37.469346, 127.040002)으로
2026-11-05 확인했다: 요청 변수(confmKey, admCd, rnMgtSn, udrtYn, buldMnnm, buldSlno, resultType), 응답 구조(results.common.errorCode,
results.juso[]), 필드 entX·entY. 검색 응답의 siNm·sggNm 필드명도 확인했다. 좌표제공 키와 주소검색 키는 별개다(검색 키가 없어도 위젯 코드로 동작). 테스트 키는 입력과 상관없이 고정 예시(상암동 한국지역정보개발원)를 주므로 임의 주소의 정확도는 실제 승인키로 확인해야 한다.
좌표계는 그 예시를 UTM-K(EPSG:5179)로 변환했을 때 상암동에 놓이는 것으로 확인했다. 공식 문서의 좌표계 명시는 아직 못 봤다.
변환 결과가 한반도 범위를 벗어나면 실패로 처리한다.
"""
import logging
import math
import os

import httpx

from app.features._shared.regions import region_from_address


log = logging.getLogger(__name__)


LINK_URL = "https://business.juso.go.kr/addrlink/addrLinkApi.do"     # 주소 검색: 도로명주소 → admCd·rnMgtSn 등


COORD_URL = "https://business.juso.go.kr/addrlink/addrCoordApi.do"   # 좌표제공


# EPSG:5179 (UTM-K, GRS80): 원점 위도 38°, 중앙 경선 127.5°, 축척 0.9996, 가산값 동 1,000,000 / 북 2,000,000 (가정)
A, F = 6378137.0, 1 / 298.257222101


LAT0, LON0, K0, FE, FN = 38.0, 127.5, 0.9996, 1_000_000.0, 2_000_000.0


def _meridian(lat: float) -> float:
    e2 = F * (2 - F)
    e4, e6 = e2 * e2, e2 ** 3
    return A * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * lat - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * math.sin(2 * lat)
                + (15 * e4 / 256 + 45 * e6 / 1024) * math.sin(4 * lat) - (35 * e6 / 3072) * math.sin(6 * lat))


def wgs84_to_utmk(lat: float, lon: float) -> tuple[float, float]:
    """위경도 → UTM-K(m). 역변환 검증용 정변환."""
    e2 = F * (2 - F)
    ep2 = e2 / (1 - e2)
    phi, lam = math.radians(lat), math.radians(lon - LON0)
    n = A / math.sqrt(1 - e2 * math.sin(phi) ** 2)
    t, c, a = math.tan(phi) ** 2, ep2 * math.cos(phi) ** 2, lam * math.cos(phi)
    x = FE + K0 * n * (a + (1 - t + c) * a ** 3 / 6 + (5 - 18 * t + t * t + 72 * c - 58 * ep2) * a ** 5 / 120)
    y = FN + K0 * (_meridian(phi) - _meridian(math.radians(LAT0)) + n * math.tan(phi) * (
        a * a / 2 + (5 - t + 9 * c + 4 * c * c) * a ** 4 / 24 + (61 - 58 * t + t * t + 600 * c - 330 * ep2) * a ** 6 / 720))
    return x, y


def utmk_to_wgs84(x: float, y: float) -> tuple[float, float]:
    """UTM-K(m) → 위경도(WGS84, GRS80과 같은 것으로 본다)."""
    e2 = F * (2 - F)
    ep2 = e2 / (1 - e2)
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    m = _meridian(math.radians(LAT0)) + (y - FN) / K0
    mu = m / (A * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256))
    phi1 = (mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
            + (151 * e1 ** 3 / 96) * math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * math.sin(8 * mu))
    s = math.sin(phi1)
    n1 = A / math.sqrt(1 - e2 * s * s)
    t1, c1 = math.tan(phi1) ** 2, ep2 * math.cos(phi1) ** 2
    r1 = A * (1 - e2) / (1 - e2 * s * s) ** 1.5
    d = (x - FE) / (n1 * K0)
    lat = phi1 - (n1 * math.tan(phi1) / r1) * (d * d / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * d ** 4 / 24
                                                + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * d ** 6 / 720)
    lon = math.radians(LON0) + (d - (1 + 2 * t1 + c1) * d ** 3 / 6
                                + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * d ** 5 / 120) / math.cos(phi1)
    return math.degrees(lat), math.degrees(lon)


def in_korea(lat: float, lon: float) -> bool:
    return 32.5 <= lat <= 39.5 and 124.0 <= lon <= 132.0


def clean_codes(adm_cd, rn_mgt_sn, udrt_yn, buld_mnnm, buld_slno) -> dict | None:
    """프론트(다음 우편번호 위젯)가 보낸 행정 코드. 하나라도 형식이 틀리면 전부 무시한다(400이 아님)."""
    def digits(v, length=None, max_len=None):
        t = str(v).strip() if v is not None and not isinstance(v, bool) else ""
        ok = t.isdigit() and t.isascii() and (len(t) == length if length else len(t) <= (max_len or 5))
        return t if ok else None
    out = {"admCd": digits(adm_cd, 10), "rnMgtSn": digits(rn_mgt_sn, 12), "buldMnnm": digits(buld_mnnm), "buldSlno": digits(buld_slno)}
    udrt = str(udrt_yn).strip() if udrt_yn is not None and not isinstance(udrt_yn, bool) else ""
    out["udrtYn"] = udrt if udrt in ("0", "1") else None
    return out if all(v is not None for v in out.values()) else None


def _results(resp: httpx.Response) -> dict:
    """응답의 results. errorCode가 0이 아니면 실패로 보고 예외를 낸다(메시지에 키·주소를 싣지 않는다)."""
    resp.raise_for_status()
    results = resp.json()["results"]
    code = str(results["common"]["errorCode"])
    if code != "0":
        raise RuntimeError(f"errorCode {code}")
    return results


def geocode(road_address: str, codes: dict | None = None) -> tuple[float, float, str | None] | None:
    """(lat, lon, 지역) 또는 None.
    좌표제공 키(JUSO_COORD_KEY)와 주소검색 키(JUSO_SEARCH_KEY)는 별개다. 위젯이 준 행정 코드(codes)가 있으면 검색 없이 바로
    좌표 API를 부르고, 없으면 검색 키가 있을 때만 검색으로 코드를 얻는다. 어느 쪽도 안 되면 None.
    지역은 입력 주소(와 검색 결과의 시·도·시군구 이름)에서 가입 지역 목록과 맞는 것이 있을 때만 준다.
    실패하면 None. 로그에는 예외 종류와 errorCode만 남기고 요청 주소(confmKey가 들어 있음)는 남기지 않는다."""
    key = os.environ.get("JUSO_COORD_KEY")
    if not key:
        return None
    try:
        names = road_address
        if codes is None:
            search_key = os.environ.get("JUSO_SEARCH_KEY")
            if not search_key:
                return None
            found = _results(httpx.get(LINK_URL, params={"confmKey": search_key, "currentPage": 1, "countPerPage": 1,
                                                         "keyword": road_address, "resultType": "json"}, timeout=8))
            juso = (found.get("juso") or [None])[0]
            if juso is None:
                return None
            codes = {k: juso[k] for k in ("admCd", "rnMgtSn", "udrtYn", "buldMnnm", "buldSlno")}
            names = f"{juso.get('siNm', '')} {juso.get('sggNm', '')} {road_address}"
        coord = _results(httpx.get(COORD_URL, params={"confmKey": key, **codes, "resultType": "json"}, timeout=8))
        row = (coord.get("juso") or [None])[0]
        if row is None:
            return None
        lat, lon = utmk_to_wgs84(float(row["entX"]), float(row["entY"]))
        if not in_korea(lat, lon):
            return None
        return round(lat, 6), round(lon, 6), region_from_address(names)
    except Exception as e:
        status = getattr(getattr(e, "response", None), "status_code", None)
        log.error("좌표제공 API 호출 실패: %s%s %s", type(e).__name__, f" HTTP {status}" if status else "", e if isinstance(e, RuntimeError) else "")
        return None
