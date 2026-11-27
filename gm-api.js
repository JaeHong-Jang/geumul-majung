// 그물마중 서버 연결 (docs/GEUMUL_API.md). 대시보드(index.html)와 모바일 웹앱(app/)이 같이 쓴다.
// 서버 주소: 주소창 ?api=http://… > 저장된 값 > http://127.0.0.1:8000. ?api=off 이면 서버 없이 기기 저장소만 쓴다.
// 서버에 닿지 않으면 start()가 null을 돌려주고 화면은 예전처럼 기기 저장소로 돈다.
(function () {
  "use strict";
  const KEY = "geumulmajung:api";
  const param = new URLSearchParams(location.search).get("api");
  let base = param;
  try {
    if (param && param !== "off") localStorage.setItem(KEY, param); // off는 이번 한 번만
    base = base || localStorage.getItem(KEY);
  } catch {}
  base = (base || "http://127.0.0.1:8000").replace(/\/+$/, "");
  const off = base === "off";
  // 한 기기에서 세 역할을 차례로 시연한다. 서버는 동작마다 역할을 확인한다.
  const ROLES = ["factory", "operator", "recycler"];
  const tokens = {};

  async function call(role, method, path, body, timeout = 8000) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(base + "/v1/gm" + path, {
        method,
        signal: ctl.signal,
        headers: {
          "Content-Type": "application/json",
          ...(tokens[role] ? { Authorization: "Bearer " + tokens[role] } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const d = data.detail;
        throw new Error(
          typeof d === "string" ? d : Array.isArray(d) ? d.join(", ") : "서버 오류 " + res.status,
        );
      }
      return data;
    } catch (e) {
      if (e.name === "AbortError") throw new Error("서버 응답 없음");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  const list = () => call("operator", "GET", "/shipments");
  const path = (id) => "/shipments/" + encodeURIComponent(id);
  const FIELDS = ["kind", "material", "weight", "bags", "packaging", "route", "departure", "note", "checks", "photo",
    "facility", "baseRate", "feeRate", "directCost"];

  async function start() {
    if (off) return null;
    try {
      for (const role of ROLES) {
        tokens[role] = (await call(role, "POST", "/demo-login/" + role, undefined, 3000)).access_token;
      }
      return await list();
    } catch {
      return null;
    }
  }

  // 화면이 바꾼 기록(next)을 이전 기록(old)과 비교해 맞는 API를 부르고, 서버가 저장한 기록을 돌려준다.
  async function push(old, next) {
    if (!old) {
      const body = {};
      for (const k of FIELDS) if (next[k] != null) body[k] = next[k];
      return call("factory", "POST", "/shipments", body);
    }
    if (old.status === "registered") {
      const rec = await call("operator", "PUT", path(old.id) + "/quotes", {
        quotes: next.quotes,
        version: old.version,
      });
      if (next.status !== "confirmed") return rec;
      return call("operator", "POST", path(old.id) + "/confirm", {
        choice: next.choice,
        version: rec.version,
      });
    }
    if (old.status === "confirmed" && next.status === "settled") {
      return call("recycler", "POST", path(old.id) + "/settle", {
        ...next.actual,
        version: old.version,
      });
    }
    throw new Error("서버에 없는 단계 변경");
  }

  async function reset() {
    await call("operator", "POST", "/demo/reset");
    return list();
  }

  // ── AI 기능 (docs/GEUMUL_SYSTEM.md 4절). 역할은 실제 현장에서 그 일을 하는 쪽 ──
  const ai = {
    status: () => call("operator", "GET", "/ai/status"),
    // body: {text} 또는 {audio_base64, content_type}. 음성 인식은 첫 호출에 모델을 올려 오래 걸릴 수 있다
    intake: (body) => call("factory", "POST", "/intake", body, 90000),
    checklist: (id) => call("operator", "GET", path(id) + "/checklist", undefined, 20000),
    ask: (message) => call("factory", "POST", "/ask", { message }, 20000),
    scan: (id, image) => call("recycler", "POST", path(id) + "/scans", { image }, 120000),
    confirmScan: (scanId, fields) =>
      call("recycler", "POST", "/scans/" + scanId + "/confirm", { fields }),
  };

  // ── 자원 순환 판매, 업체 회신, 서류 ──
  const trade = {
    checkLot: (id, lot) => call("factory", "POST", path(id) + "/sales/check", { lot }, 20000),
    addLot: (id, lot) => call("factory", "POST", path(id) + "/sales", { lot }, 20000),
    // 업체 이름을 적으면 운영이 전화·문자로 받은 제안을 대신 입력, 비우면 업체 계정이 직접 제안
    offer: (id, lot, body) =>
      call(body.buyer ? "operator" : "recycler", "POST", path(id) + "/sales/" + lot + "/offers", body),
    accept: (id, lot, offer) => call("operator", "POST", path(id) + "/sales/" + lot + "/accept", { offer }),
    market: () => call("recycler", "GET", "/market"),
    reply: (id, idx, body) => call("recycler", "POST", path(id) + "/quotes/" + idx + "/reply", body),
    docs: (id) => call("operator", "GET", path(id) + "/documents", undefined, 20000),
    // 운항 상태(예정·결항·연기·완료). 연기는 새 출항일, 견적 유효일을 넘으면 서버가 재협의로 되돌림
    route: (id, body) => call("operator", "POST", path(id) + "/route", body),
    // 인쇄용 초안 HTML은 인증이 필요해 글로 받아 새 창에 띄운다
    async openDoc(id, key) {
      const win = window.open("", "_blank");
      const res = await fetch(base + "/v1/gm" + path(id) + "/documents/" + key, {
        headers: { Authorization: "Bearer " + tokens.operator },
      });
      const text = await res.text();
      if (!res.ok) {
        win?.close();
        throw new Error("초안을 만들 수 없음");
      }
      if (win) {
        win.document.open();
        win.document.write(text);
        win.document.close();
      }
    },
  };

  window.GmServer = Object.freeze({ base, start, list, push, reset, ai, trade });
})();
