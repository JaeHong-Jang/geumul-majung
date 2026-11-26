/* 운송 파트너 앱 콜 화면 시안. 운임과 업체명은 예시이고, 거리와 시간은 도로 그래프에서 계산한다. */
(function () {
  var router = Dijkstra.createRouter(window.ROAD_GRAPH);
  var BOUNDS = [[36, 128.2], [36.36, 128.56]];
  var TILE_BOUNDS = [[34.6, 126.4], [37.6, 130]], LIVE = false;
  var EMPTY_TILE = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
  var DataTiles = L.TileLayer.extend({ getTileUrl: function (c) { var k = this._getZoomForUrl() + "/" + c.x + "/" + c.y; return window.TILES[k] || (LIVE ? "https://tile.openstreetmap.org/" + k + ".png" : EMPTY_TILE); } });
  var DEPOT = { name: "우리 차고지 · 구미", at: window.LOCAL_DATA.depot };
  var GB = window.ROAD_GRAPH.meta.bbox;
  function inGraph(p) { return p[0] >= GB[0] && p[0] <= GB[2] && p[1] >= GB[1] && p[1] <= GB[3]; }
  var ICON = {
    pin: '<path d="M12 22s7-7.5 7-12a7 7 0 0 0-14 0c0 4.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    truck: '<path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    home: '<path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
    won: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    back: '<path d="m15 6-6 6 6 6"/>', next: '<path d="m9 6 6 6-6 6"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM21 14v3M14 21h7"/>',
    check: '<path d="M20 6 9 17l-5-5"/>', play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    nav: '<path d="m3 11 18-8-8 18-2-8z"/>',
    locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'
  };
  function ic(k, s) { s = s || 20; return '<svg aria-hidden="true" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICON[k] + "</svg>"; }
  function won(n) { return n.toLocaleString("ko-KR") + "원"; }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

  var ORDERS = window.LOCAL_DATA.orders;
  /* 차고지에서 첫 상차지까지(공차), 상차지부터 마지막 하차지까지(적재)를 각각 다익스트라로 계산한다 */
  ORDERS.forEach(function (o) {
    o.empty = o.pre && o.pre.empty ? o.pre.empty : router.route(DEPOT.at, o.stops[0]);
    o.legs = o.pre ? o.pre.legs : [];
    if (!o.pre) for (var i = 0; i + 1 < o.stops.length; i++) o.legs.push(router.route(o.stops[i], o.stops[i + 1]));
    o.km = o.legs.reduce(function (a, l) { return a + l.meters; }, 0) / 1000;
    o.min = Math.round(o.legs.reduce(function (a, l) { return a + l.seconds; }, 0) / 60);
    o.emptyKm = o.empty.meters / 1000; o.emptyMin = Math.round(o.empty.seconds / 60);
    o.perKm = Math.round(o.fare / (o.km + o.emptyKm));
    o.line = o.legs.reduce(function (a, l) { return a.concat(l.coords); }, []);
  });
  function km1(x) { return x.toFixed(1) + "km"; }
  function byId(id) { return ORDERS.filter(function (o) { return o.id === id; })[0]; }

  var LEDGER = [
    { d: "11.03 (화)", n: "구미 공단 → 칠곡 약목", v: 97000, s: "정산 예정", bundle: false },
    { d: "11.03 (화)", n: "구미 구포 → 칠곡 가산", v: 87000, s: "정산 예정", bundle: true },
    { d: "11.02 (월)", n: "구미 임수 → 구미 고아", v: 58000, s: "정산 예정", bundle: false },
    { d: "10.31 (토)", n: "구미 산동 → 김천 아포", v: 112000, s: "정산 예정", bundle: false },
    { d: "10.30 (금)", n: "구미 시미 → 칠곡 석적", v: 46000, s: "정산 완료", bundle: false },
    { d: "10.29 (목)", n: "구미 공단 → 칠곡 북삼", v: 124000, s: "정산 완료", bundle: true },
    { d: "10.28 (수)", n: "구미 금전 → 칠곡 약목", v: 88000, s: "정산 완료", bundle: true }
  ];
  var WEEK = [["수", 88000], ["목", 124000], ["금", 46000], ["토", 112000], ["일", 0], ["월", 58000], ["화", 184000]];
  var WEEK_TOTAL = WEEK.reduce(function (a, d) { return a + d[1]; }, 0);
  var PENDING = LEDGER.filter(function (l) { return l.s === "정산 예정"; }).reduce(function (a, l) { return a + l.v; }, 0);
  var STAGES = ["이동", "상차·검수", "운송", "하차·계량", "완료"];
  var SCREENS = [["home", "홈"], ["orders", "운반 요청"], ["detail", "요청 상세"], ["trip", "운행 중"], ["earn", "정산"], ["my", "마이"]];
  var VERSIONS = {
    a: { name: "A. 지도 우선형", sub: "지도에서 일감을 고르는 방식", refs: "Uber Driver, 카카오 T, 쿠팡이츠 배달 파트너의 지도 위 시트 구성을 참고했습니다.", why: ["주변 요청을 운임 표식으로 지도에 올립니다.", "목록을 고르면 공차와 적재 구간이 바로 그려집니다.", "처음 쓰는 기사도 위치 판단이 쉽습니다."], best: "단거리·지역 운행 기사에게 맞습니다." },
    b: { name: "B. 오더 보드형", sub: "목록을 빠르게 훑는 방식", refs: "전국24시콜, 원콜 같은 화물 정보망의 목록 구성을 참고했습니다. 원콜의 운임순·거리순 정렬과 지급일 확정 표시를 반영했습니다.", why: ["한 화면에 요청을 가장 많이 보여줍니다.", "운임순, 가까운순, km당 운임순으로 정렬합니다.", "정보망에 익숙한 기존 기사가 바로 쓸 수 있습니다."], best: "장거리·전업 기사에게 맞습니다." },
    c: { name: "C. 단일 콜형", sub: "콜 한 건에 집중하는 야간 화면", refs: "배민커넥트, 쿠팡이츠의 콜 수락 화면과 제한시간 구성을 참고했습니다.", why: ["한 번에 한 건만 크게 보여줍니다.", "제한시간과 수락 버튼이 화면의 중심입니다.", "어두운 화면이라 야간과 새벽 운행에 맞습니다."], best: "신규·야간 기사와 자동 배차에 맞습니다." }
  };
  var FIXED = document.body.getAttribute("data-version");
  var S = { v: FIXED || "a", s: "home", online: false, id: 1, sort: "fare", fit: true, q: "", bmap: false, cd: 41, trip: { id: 1, stage: 1, scanned: 12 }, toast: "" };
  var phone = document.getElementById("phone"), live = [], toastT = null, cdT = null;

  function sorted() {
    var q = S.q.trim();
    var l = ORDERS.filter(function (o) { return (!S.fit || o.ton <= 5) && (!q || (o.from + o.to + o.item + o.tags.join(" ")).indexOf(q) >= 0); });
    var key = { fare: function (o) { return -o.fare; }, near: function (o) { return o.emptyKm; }, per: function (o) { return -o.perKm; } }[S.sort];
    return l.slice().sort(function (a, b) { return key(a) - key(b); });
  }
  function gradeTag(o) { return '<span class="tag ' + o.grade.toLowerCase() + '">통과증 ' + o.grade + "</span>"; }
  function tags(o) { return gradeTag(o) + o.tags.map(function (t, i) { return '<span class="tag' + (i === 0 ? " y" : "") + '">' + t + "</span>"; }).join(""); }
  function routeTitle(o) { return esc(o.from) + " → " + esc(o.to); }
  function orderCard(o, sel, act) {
    return '<button class="card' + (sel ? " selected" : "") + '" data-act="' + (act || "pick") + '" data-id="' + o.id + '">' +
      '<span class="row wrap">' + tags(o) + "</span>" +
      '<span class="row between"><span class="stack-1 grow"><span class="t16 b">' + routeTitle(o) + '</span><span class="t12 dim">' + o.item + " · 마대 " + o.bags + "개 · " + o.ton + "t</span></span>" +
      '<span class="stack-1 right"><span class="t20 b green num">' + won(o.fare) + '</span><span class="t12 dim">' + o.pay + "</span></span></span>" +
      '<span class="row between t12"><span class="m">' + o.when + '</span><span class="dim num">적재 ' + km1(o.km) + " · 공차 " + km1(o.emptyKm) + "</span></span></button>";
  }
  function compactRow(o) {
    return '<button class="card" data-act="open" data-id="' + o.id + '"><span class="row between"><span class="stack-1 grow"><span class="t14 b">' + routeTitle(o) + '</span><span class="t12 dim">' + o.when + " · 공차 " + km1(o.emptyKm) + '</span></span><span class="t16 b green num">' + won(o.fare) + "</span></span></button>";
  }
  function kpis() {
    return '<div class="kpis">' + [["오늘 수입", "184,000원", 1], ["완료 운행", "2건"], ["운행 거리", "86km"]].map(function (k) { return '<div class="kpi"><span class="t12 dim m">' + k[0] + '</span><span class="t14 b num' + (k[2] ? " green" : "") + '">' + k[1] + "</span></div>"; }).join("") + "</div>";
  }
  function switchRow() {
    return '<div class="row between"><div class="stack-1"><span class="t12 dim m">운행 상태</span><span class="t20 b">' + (S.online ? "콜 받는 중" : "운행 대기 중") + '</span></div><button class="switch" role="switch" aria-checked="' + S.online + '" aria-label="콜 받기" data-act="toggle"><i></i></button></div>';
  }
  function stops(o) {
    var first = '<div class="stop"><span class="pin"></span><div class="stack-1 grow"><span class="t14 b">' + esc(o.shipper) + " · " + esc(o.from) + '</span><span class="t12 dim">' + o.window + " · " + o.cond + "</span></div></div>";
    var via = o.via ? '<div class="stop"><span class="pin"></span><div class="stack-1 grow"><span class="t14 b">' + o.via + '</span><span class="t12 dim">' + (o.viaNote || "두 번째 상차지") + '</span></div></div>' : "";
    return '<div class="stops">' + first + via + '<div class="stop"><span class="pin drop"></span><div class="stack-1 grow"><span class="t14 b">' + esc(o.consignee) + " · " + esc(o.dropLabel || o.to) + '</span><span class="t12 dim">' + o.dropNote + "</span></div></div></div>";
  }
  function fareBreak(o) {
    return '<div class="kpis">' + [["기본 운임", o.base], ["등급 프리미엄", o.premium], ["대기 보상", o.wait]].map(function (k) { return '<div class="stack-1"><span class="t12 dim">' + k[0] + '</span><span class="t14 b num">' + won(k[1]) + "</span></div>"; }).join("") + "</div>";
  }
  function metrics(o) { return '<span class="t12 dim num">공차 ' + km1(o.emptyKm) + " " + o.emptyMin + "분 + 적재 " + km1(o.km) + " " + o.min + "분 (예상)</span>"; }
  function steps(st) { return '<div class="steps">' + STAGES.map(function (n, i) { return '<div class="step' + (i <= st ? " on" : "") + '"><i></i>' + n + "</div>"; }).join("") + "</div>"; }
  function tabs() {
    var T = [["home", "홈", "home"], ["orders", "운반요청", "list"], ["trip", "운행중", "truck"], ["earn", "정산", "won"], ["my", "마이", "user"]];
    return '<nav class="tabs" aria-label="주요 메뉴">' + T.map(function (t) { return '<button class="tab" data-go="' + t[0] + '"' + (S.s === t[0] ? ' aria-current="page"' : "") + ">" + ic(t[2], 20) + t[1] + "</button>"; }).join("") + "</nav>";
  }
  function backFloat() { return '<div class="float-top"><button class="round" aria-label="뒤로" data-go="orders">' + ic("back") + '</button><button class="round" aria-label="내 위치에서 다시 계산" data-act="locate">' + ic("locate") + "</button></div>"; }
  function acceptFooter(lg) {
    var over = S.cd <= 0, cl = lg ? " lg" : "";
    return '<div class="footer"><button class="btn line' + cl + '" data-go="orders">건너뛰기</button><button class="btn grow' + cl + '" data-act="' + (over ? "retry" : "accept") + '">' + (over ? "시간 초과 · 다시 받기" : '수락하기 <span class="num" data-cd>0:' + ("0" + S.cd).slice(-2) + "</span>") + "</button></div>";
  }
  function tripAction(t) {
    if (t.stage === 0) return '<button class="btn lg full" data-act="stage">상차지 도착</button>';
    if (t.stage === 1) { var left = 18 - t.scanned; return '<button class="btn lg full" data-act="stage"' + (left > 0 ? " disabled" : "") + ">" + (left > 0 ? "상차 완료 · " + left + "개 더 스캔" : "상차 완료") + "</button>"; }
    if (t.stage === 2) return '<button class="btn lg full" data-act="stage">하차지 도착</button>';
    if (t.stage === 3) return '<button class="btn lg full" data-act="stage">인계서 전송 · 운행 완료</button>';
    return '<button class="btn lg full" data-go="earn">정산 내역 보기</button>';
  }
  function navLink(t, o, grow) {
    var at = t.stage === 0 ? o.stops[0] : o.stops[o.stops.length - 1], name = t.stage === 0 ? o.shipper : o.consignee;
    return '<a class="btn line ' + (grow ? "grow" : "full") + '" target="_blank" rel="noopener" href="https://map.kakao.com/link/to/' + encodeURIComponent(name) + "," + at[0] + "," + at[1] + '">' + ic("nav") + "카카오맵 길안내</a>";
  }
  function tripTitle(t, o) { return ["상차지로 이동 중", esc(o.shipper) + "에서 상차 중", esc(o.consignee) + "로 운송 중", esc(o.consignee) + "에서 하차 중", "운행 완료"][t.stage]; }
  function qrCard(t) {
    var pct = Math.round(t.scanned / 18 * 100);
    return '<div class="card"><div class="row between"><div class="stack-1"><span class="t12 dim m">마대 QR 검수</span><span class="t20 b num">' + t.scanned + ' / 18개</span></div><button class="btn" data-act="scan"' + (t.scanned >= 18 ? " disabled" : "") + ">" + ic("qr") + 'QR 스캔</button></div><div class="bar"><i style="width:' + pct + '%"></i></div><span class="t12 dim">전부 스캔해야 상차 완료 버튼이 열립니다.</span></div>';
  }
  function tripBody(t, o) {
    if (t.stage === 1) return qrCard(t);
    if (t.stage >= 3) return '<div class="card"><span class="t12 dim m">' + (t.stage === 3 ? "하차 처리" : "이번 운행") + '</span><span class="t20 b num">' + (t.stage === 3 ? "계량 후 인계서를 전송하세요" : won(o.fare) + " 정산 예정") + '</span><span class="t12 dim">폐기물 인계서는 앱이 자동으로 작성합니다.</span></div>';
    var nextName = t.stage === 0 ? o.shipper : o.consignee, info = t.stage === 0 ? km1(o.emptyKm) + " · " + o.emptyMin + "분" : km1(o.km) + " · " + o.min + "분";
    return '<div class="card"><span class="t12 dim m">다음 목적지</span><span class="t20 b">' + esc(nextName) + '</span><span class="t14 dim num">' + info + " (예상) · 화물차 조건 반영</span></div>";
  }
  function sortChips(inner) {
    var c = [["fare", "운임순"], ["near", "가까운순"], ["per", "km당 운임"]].map(function (x) { return '<button class="chip" data-act="sort" data-k="' + x[0] + '" aria-pressed="' + (S.sort === x[0]) + '">' + x[1] + "</button>"; }).join("");
    return inner ? c : '<div class="chips">' + c + "</div>";
  }

  /* 버전 A: 지도 우선 */
  var A = {
    home: function () {
      var nearest = sorted().slice().sort(function (x, y) { return x.emptyKm - y.emptyKm; })[0];
      var body = S.online ? kpis() + '<div class="row between"><span class="t16 b">가장 가까운 요청</span><button class="btn line" data-go="orders">전체 보기</button></div>' + compactRow(nearest) : '<button class="btn lg full" data-act="toggle">' + ic("play") + "운행 시작</button>" + kpis();
      return '<div class="view"><div class="map" data-map="pins"></div><div class="float-top"><button class="pill" data-act="toast" data-msg="차고지 변경은 마이에서 합니다">' + ic("pin", 16) + DEPOT.name + '</button><button class="round" aria-label="알림" data-act="toast" data-msg="새 알림 1건: 묶음 요청이 등록됐습니다">' + ic("bell") + '<span class="dot"></span></button></div><div class="sheet">' + switchRow() + body + "</div></div>" + tabs();
    },
    orders: function () {
      return '<div class="view"><div class="map" data-map="selected"></div><div class="float-top"><span class="pill num">요청 ' + sorted().length + "건 · 내 차량 맞춤</span></div>" + '<div class="sheet" style="height:52%">' + sortChips() + '<div class="scroll-in">' + sorted().map(function (o) { return orderCard(o, o.id === S.id); }).join("") + "</div></div></div>" + tabs();
    },
    detail: function () {
      var o = byId(S.id);
      return '<div class="view"><div class="map" data-map="selected"></div>' + backFloat() + '<div class="sheet"><div class="scroll-in"><div class="row between"><div class="stack-1"><span class="t12 dim m">총 운임 · 수수료 0원</span><span class="t28 b green num">' + won(o.fare) + '</span></div><div class="row wrap" style="justify-content:flex-end">' + gradeTag(o) + '<span class="tag">' + o.pay + "</span></div></div>" + metrics(o) + '<div class="card">' + stops(o) + '</div><div class="card">' + fareBreak(o) + "</div></div></div></div>" + acceptFooter();
    },
    trip: function () {
      var t = S.trip, o = byId(t.id);
      return '<div class="view"><div class="map" data-map="trip"></div><div class="float-top" style="display:block"><div class="card" style="box-shadow:var(--shadow)"><span class="t14 b">' + tripTitle(t, o) + "</span>" + steps(t.stage) + '</div></div><div class="sheet">' + tripBody(t, o) + '<div class="row"><button class="btn line grow" data-act="toast" data-msg="담당자에게 전화를 겁니다 (시연)">' + ic("phone") + '담당자</button>' + navLink(t, o, true) + "</div>" + tripAction(t) + "</div></div>" + tabs();
    }
  };
  /* 버전 B: 오더 보드 */
  var B = {
    home: function () {
      return '<div class="view"><div class="appbar"><div class="bar-title"><span class="row t20 b">' + ic("pin", 16) + DEPOT.name + '</span><button class="round flat" aria-label="알림" data-act="toast" data-msg="새 알림 1건: 묶음 요청이 등록됐습니다">' + ic("bell") + '<span class="dot"></span></button></div><div class="bar-body"><span class="tag g">' + ic("truck", 16) + '5톤 윙바디 · 경북 89바 1234</span><span class="tag y">' + ic("check", 16) + '통과증 스캐너 인증</span></div></div><div class="scroll"><div class="card">' + switchRow() + "</div>" + kpis() + '<div class="row between"><span class="t16 b">받을 수 있는 요청 <span class="green num">' + sorted().length + '건</span></span><button class="btn line" data-go="orders">전체 보기</button></div>' + sorted().slice(0, 3).map(function (o) { return orderCard(o, false, "open"); }).join("") + "</div></div>" + tabs();
    },
    orders: function () {
      var l = sorted();
      var body = S.bmap ? '<div class="map" data-map="pins" style="margin-top:var(--s3)"></div>' : '<div class="scroll has-fab">' + l.map(function (o) { return orderCard(o, false, "open"); }).join("") + (l.length ? "" : '<div class="card"><span class="t14 b">조건에 맞는 요청이 없습니다</span><span class="t12 dim">검색어를 지우거나 내 차량 맞춤을 끄세요.</span></div>') + "</div>";
      return '<div class="view"><div class="appbar"><div class="bar-title"><span class="t20 b">운반 요청 <span class="num">' + l.length + '</span>건</span></div><div class="bar-body"><label class="search grow">' + ic("search", 16) + '<input id="q" aria-label="출발지, 도착지, 품목 검색" placeholder="출발지, 도착지, 품목 검색" value="' + esc(S.q).replace(/"/g, "&quot;") + '"></label></div></div><div class="subbar"><div class="chips"><button class="chip" data-act="fit" aria-pressed="' + S.fit + '">내 차량 맞춤</button>' + sortChips(true) + "</div></div>" + body + '<button class="btn fab" data-act="bmap">' + ic(S.bmap ? "list" : "map") + (S.bmap ? "목록 보기" : "지도 보기") + "</button></div>" + tabs();
    },
    detail: function () {
      var o = byId(S.id);
      return '<div class="view"><div class="map fixed" data-map="selected" style="height:280px"></div>' + backFloat() + '<div class="scroll"><div class="card"><div class="row between"><span class="stack-1"><span class="t12 dim m">총 운임 · 수수료 0원</span><span class="t28 b green num">' + won(o.fare) + '</span></span><span class="stack-1 right"><span class="t12 dim">km당 운임</span><span class="t14 b num">' + won(o.perKm) + "</span></span></div>" + metrics(o) + '<div class="row wrap">' + tags(o) + '<span class="tag">' + o.pay + '</span></div></div><div class="card">' + stops(o) + '</div><div class="card">' + fareBreak(o) + '</div><div class="card"><div class="stack" style="gap:var(--s3)"><div class="list-row"><span class="t14">품목</span><span class="t14 b">' + o.item + '</span></div><div class="list-row"><span class="t14">마대 · 중량</span><span class="t14 b num">' + o.bags + "개 · " + o.ton + 't</span></div><div class="list-row"><span class="t14">화주 평점</span><span class="t14 b num">' + o.rating + " / 5.0</span></div></div></div></div></div>" + acceptFooter();
    },
    trip: function () {
      var t = S.trip, o = byId(t.id);
      var items = t.stage === 1 ? '<div class="card"><div class="stack" style="gap:var(--s3)"><div class="list-row"><span class="stack-1"><span class="t14 b num">KM-0042-000883</span><span class="t12 dim">PP · 198kg · 순도 98.1%</span></span>' + ic("check") + '</div><div class="list-row"><span class="stack-1"><span class="t14 b num">KM-0042-000879</span><span class="t12 warn">사진에서 PE 혼입 의심</span></span><button class="btn line" data-act="toast" data-msg="적재 사진을 엽니다 (시연)">사진 보기</button></div></div></div>' : "";
      return '<div class="view"><div class="appbar"><div class="bar-title"><span class="t20 b">' + tripTitle(t, o) + '</span><span class="t12 dim num">PASS-2026-000123</span></div><div class="bar-body">' + steps(t.stage) + '</div></div><div class="scroll">' + tripBody(t, o) + items + '<div class="card flush"><div class="map fixed" data-map="trip" style="height:176px"></div></div>' + navLink(t, o) + '</div><div class="footer">' + tripAction(t) + "</div></div>" + tabs();
    }
  };
  /* 버전 C: 단일 콜 */
  var C = {
    home: function () {
      var inner = S.online
        ? '<div class="stack-1"><span class="t12 dim m">콜 받는 중</span><span class="t20 b">새 콜이 도착했습니다</span></div>' + orderCard(sorted()[0], false, "open") + '<button class="btn line full" data-act="toggle">콜 받기 끄기</button>'
        : '<button class="bigstart" data-act="toggle">' + ic("play", 32) + "운행 시작</button>" + kpis();
      return '<div class="view"><div class="map" data-map="pins"></div><div class="float-top"><span class="pill">' + ic("pin", 16) + DEPOT.name + '</span></div><div class="sheet">' + inner + "</div></div>" + tabs();
    },
    orders: function () {
      var l = sorted(), o = byId(S.id); if (l.indexOf(o) < 0) { o = l[0]; S.id = o.id; }
      var i = l.indexOf(o);
      return '<div class="view"><div class="map" data-map="selected"></div><div class="float-top"><span class="pill num">콜 ' + (i + 1) + " / " + l.length + '</span></div><div class="sheet"><div class="row wrap">' + tags(o) + '</div><span class="t20 b">' + routeTitle(o) + '</span><span class="t28 b green num">' + won(o.fare) + "</span>" + metrics(o) + '<div class="row"><button class="btn line grow" data-act="callstep" data-d="-1">' + ic("back") + '이전</button><button class="btn line grow" data-act="callstep" data-d="1">다음' + ic("next") + '</button></div><button class="btn lg full" data-act="open" data-id="' + o.id + '">이 콜 자세히 보기</button></div></div>' + tabs();
    },
    detail: function () {
      var o = byId(S.id), deg = Math.round(S.cd / 45 * 360);
      return '<div class="view"><div class="map" data-map="selected"></div>' + backFloat() + '<div class="sheet"><div class="row between"><div class="stack grow"><div class="row wrap">' + gradeTag(o) + '<span class="tag">' + o.pay + '</span></div><span class="t28 b green num">' + won(o.fare) + '</span><span class="t16 b">' + routeTitle(o) + '</span></div><div class="ring" data-ring style="background:conic-gradient(var(--primary) ' + deg + 'deg,var(--line) 0)"><b class="num" data-cd2>' + S.cd + "</b></div></div>" + metrics(o) + '<span class="t14 m">' + o.item + " · 마대 " + o.bags + "개 · " + o.ton + "t · " + o.when + "</span></div></div>" + acceptFooter(true);
    },
    trip: function () {
      var t = S.trip, o = byId(t.id);
      return '<div class="view"><div class="map" data-map="trip"></div><div class="sheet"><div class="stack"><span class="t20 b">' + tripTitle(t, o) + "</span>" + steps(t.stage) + "</div>" + tripBody(t, o) + navLink(t, o) + tripAction(t) + "</div></div>" + tabs();
    }
  };
  function earn(v) {
    var max = Math.max.apply(null, WEEK.map(function (d) { return d[1]; }));
    var bars = v === "b" ? "" : '<div class="card"><span class="t16 b">최근 7일 수입</span><div class="bars" role="img" aria-label="최근 7일 일별 수입. 화요일 184,000원이 가장 높습니다.">' + WEEK.map(function (d, i) { return '<div class="barcol' + (i === 6 ? " today" : "") + '"><i style="height:' + Math.max(4, Math.round(d[1] / max * 76)) + 'px"></i>' + d[0] + "</div>"; }).join("") + "</div></div>";
    var head = '<div class="appbar"><div class="bar-title"><span class="t20 b">정산</span></div><div class="bar-body between"><span class="t28 b num">' + won(WEEK_TOTAL) + '</span><span class="stack-1 right"><span class="t12 dim">10.28 ~ 11.03 수입</span><span class="t12 m">운행 7건 · 묶음 3건</span></span></div></div>';
    var settle = '<div class="card"><div class="row between"><div class="stack-1"><span class="t12 dim m">다음 정산 · 11.06 (금) 입금</span><span class="t20 b num">' + won(PENDING) + '</span><span class="t12 dim">세금계산서 자동 발행 · 수수료 0원</span></div><button class="btn line" data-act="toast" data-msg="세금계산서 내역을 엽니다 (시연)">내역</button></div></div>';
    var pct = Math.round(WEEK_TOTAL / 8000);
    var promo = v === "c" ? '<div class="card"><span class="t12 dim m">이번 주 목표 800,000원</span><div class="bar"><i style="width:' + pct + '%"></i></div><span class="t14 b num">' + pct + "% 달성 · " + won(800000 - WEEK_TOTAL) + " 남음</span></div>" : '<div class="card accent-card"><span class="t12 dim m">주유 쿠폰</span><span class="t14 b">이번 주 묶음 운행 3건 달성 · 15,000원 지급</span></div>';
    var rows = (v === "c" ? LEDGER.slice(0, 3) : LEDGER).map(function (l) { return '<div class="list-row"><span class="stack-1 grow"><span class="t14 b">' + l.n + (l.bundle ? ' <span class="tag y">묶음</span>' : "") + '</span><span class="t12 dim">' + l.d + '</span></span><span class="stack-1 right"><span class="t14 b num">' + won(l.v) + '</span><span class="t12 ' + (l.s === "정산 예정" ? "warn" : "dim") + '">' + l.s + "</span></span></div>"; }).join("");
    return '<div class="view">' + head + '<div class="scroll">' + settle + bars + promo + '<div class="card"><span class="t16 b">운행 내역</span><div class="stack" style="gap:var(--s3)">' + rows + "</div></div></div></div>" + tabs();
  }
  function my() {
    var g = window.ROAD_GRAPH.meta;
    return '<div class="view"><div class="appbar"><div class="bar-title"><span class="t20 b">마이</span></div><div class="bar-body"><span class="t14 m">경북 89바 1234 · 5톤 윙바디</span></div></div><div class="scroll"><div class="card"><span class="t16 b">경로 계산에 쓰는 차량 조건</span><div class="stack" style="gap:var(--s3)"><div class="list-row"><span class="t14">전고</span><span class="t14 b num">' + g.vehicle.heightM + 'm</span></div><div class="list-row"><span class="t14">총중량</span><span class="t14 b num">' + g.vehicle.grossT + 't</span></div><div class="list-row"><span class="t14">통행 제한으로 뺀 도로</span><span class="t14 b num">' + g.excludedWays + '구간</span></div></div><span class="t12 dim">높이·중량 제한이 차량 조건에 걸리는 도로는 경로에서 뺍니다.</span></div><div class="card"><span class="t16 b">내 인증</span><div class="row wrap"><span class="tag y">' + ic("check", 16) + '통과증 스캐너 인증</span><span class="tag">인계서 자동 작성</span></div></div><div class="card"><div class="list-row"><span class="stack-1"><span class="t12 dim m">차고지</span><span class="t14 b">' + DEPOT.name + '</span></span><span class="t12 dim num">' + DEPOT.at.join(", ") + "</span></div></div></div></div>" + tabs();
  }

  function render() {
    live.forEach(function (m) { m.remove(); }); live = [];
    phone.setAttribute("data-theme-v", S.v);
    var set = { a: A, b: B, c: C }[S.v], html;
    if (S.s === "earn") html = earn(S.v); else if (S.s === "my") html = my(); else html = set[S.s]();
    phone.innerHTML = html + (S.toast ? '<div class="toast" role="status">' + esc(S.toast) + "</div>" : "");
    Array.prototype.forEach.call(phone.querySelectorAll("[data-map]"), mountMap);
    var sel = phone.querySelector(".card.selected"), box = sel && sel.closest(".scroll-in");
    if (box) box.scrollTop = sel.offsetTop - box.offsetTop;
    syncHub();
    clearInterval(cdT);
    if (S.s === "detail" && !window.__freeze) cdT = setInterval(tick, 1000);
    try { history.replaceState(null, "", "#" + S.v + "-" + S.s); } catch (e) { /* 샌드박스에서는 무시 */ }
  }
  function tick() {
    if (S.cd <= 0) { clearInterval(cdT); return; }
    S.cd--;
    if (S.cd === 0) return render();
    var a = phone.querySelector("[data-cd]"); if (a) a.textContent = "0:" + ("0" + S.cd).slice(-2);
    var b = phone.querySelector("[data-cd2]"); if (b) b.textContent = S.cd;
    var r = phone.querySelector("[data-ring]"); if (r) r.style.background = "conic-gradient(var(--primary) " + Math.round(S.cd / 45 * 360) + "deg,var(--line) 0)";
  }
  function addTiles(m) {
    return new DataTiles("", { minZoom: LIVE ? 6 : 8, minNativeZoom: LIVE ? undefined : 8, maxNativeZoom: LIVE ? 19 : 13, maxZoom: LIVE ? 19 : 15, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 기여자' }).addTo(m);
  }
  function baseMap(el) {
    var m = L.map(el, { zoomControl: false, minZoom: LIVE ? 6 : 8, maxZoom: LIVE ? 19 : 15, maxBounds: LIVE ? null : TILE_BOUNDS, maxBoundsViscosity: 1, zoomSnap: 0.25, attributionControl: true });
    m.attributionControl.setPrefix(false);
    addTiles(m);
    return m;
  }
  var FACTORIES = window.LOCAL_DATA.factories;
  function factoryDots(m, list, color) {
    var rd = L.canvas({ padding: 0.3 });
    list.forEach(function (x) { L.circleMarker([x[0], x[1]], { renderer: rd, radius: 2.5, weight: 0, fillColor: color, fillOpacity: 0.75, interactive: false }).addTo(m); });
  }
  function factoryAt(p) {
    for (var i = 0; i < FACTORIES.length; i++) { var x = FACTORIES[i]; if (Math.abs(x[0] - p[0]) < 0.0003 && Math.abs(x[1] - p[1]) < 0.0003) return x; }
    return null;
  }
  function nearestFactory(p, meters) {
    var best = null, bd = meters;
    FACTORIES.forEach(function (x) { if (Math.abs(x[0] - p[0]) > 0.02 || Math.abs(x[1] - p[1]) > 0.02) return; var d = Dijkstra.haversine(p, x); if (d < bd) { bd = d; best = x; } });
    return best;
  }
  function divIcon(cls, html, w, h) { return L.divIcon({ className: "", html: '<div class="mk ' + cls + '">' + (html || "") + "</div>", iconSize: [w, h], iconAnchor: [w / 2, h / 2] }); }
  function dot(m, at, cls) { L.marker(at, { icon: divIcon(cls, "", 20, 20), keyboard: false, interactive: false }).addTo(m); }
  function truck(m, at) { L.marker(at, { icon: divIcon("mk-truck", ic("truck", 16), 32, 32), keyboard: false, interactive: false, zIndexOffset: 500 }).addTo(m); }
  function label(m, at, text, dir) {
    var i = L.divIcon({ className: "", html: '<div class="mk mk-label" style="transform:translate(-50%,' + (dir === "up" ? "-170%" : "60%") + ')">' + text + "</div>", iconSize: [0, 0] });
    L.marker(at, { icon: i, keyboard: false, interactive: false }).addTo(m);
  }
  function lineOn(m, coords, color, dash) {
    if (!dash) L.polyline(coords, { color: "#FFFFFF", weight: 8, opacity: .9, lineJoin: "round", interactive: false }).addTo(m);
    L.polyline(coords, { color: color, weight: dash ? 4 : 5, dashArray: dash || null, lineJoin: "round", interactive: false }).addTo(m);
  }
  function drawOrder(m, o) {
    var dark = S.v === "c";
    lineOn(m, o.empty.coords, dark ? "#C9D3CE" : "#5C6963", "2 8");
    lineOn(m, o.line, dark ? "#F3D46B" : "#1F5A3F");
    truck(m, S.me || DEPOT.at);
    o.stops.slice(0, -1).forEach(function (s) { dot(m, s, "mk-pick"); });
    dot(m, o.stops[o.stops.length - 1], "mk-drop");
    label(m, o.stops[0], "상차", "up");
    label(m, o.stops[o.stops.length - 1], "하차", "down");
  }
  function mountMap(el) {
    var kind = el.getAttribute("data-map"), m = baseMap(el); live.push(m);
    var inFlow = !el.classList.contains("fixed");
    var top = kind === "trip" ? (S.v === "a" ? 184 : (inFlow ? 72 : 24)) : (S.v === "a" && S.s === "orders" ? 160 : (inFlow ? 120 : 40));
    var pad = { paddingTopLeft: [inFlow ? 40 : 72, top], paddingBottomRight: [40, inFlow ? 72 : 48], maxZoom: LIVE ? 15 : 13 };
    m.invalidateSize();
    if (kind === "pins") {
      factoryDots(m, FACTORIES.filter(function (x) { return x[0] >= BOUNDS[0][0] && x[0] <= BOUNDS[1][0] && x[1] >= BOUNDS[0][1] && x[1] <= BOUNDS[1][1]; }), S.v === "c" ? "#C9D3CE" : "#2B5C9E");
      var pts = [S.me || DEPOT.at];
      truck(m, S.me || DEPOT.at);
      sorted().forEach(function (o) {
        if (inGraph(o.stops[0])) pts.push(o.stops[0]);
        var i = L.divIcon({ className: "", html: '<button class="mk mk-fare" style="transform:translate(-50%,-50%)" aria-label="' + routeTitle(o) + " " + won(o.fare) + '">' + (o.fare / 10000).toFixed(1) + "만</button>", iconSize: [0, 0] });
        L.marker(o.stops[0], { icon: i, keyboard: false }).on("click", function () { openDetail(o.id); }).addTo(m);
      });
      m.fitBounds(pts, pad);
    } else if (kind === "selected") {
      var o = byId(S.id); drawOrder(m, o);
      m.fitBounds(o.empty.coords.concat(o.line), pad);
    } else {
      var t = S.trip, od = byId(t.id), col = S.v === "c" ? "#F3D46B" : "#1F5A3F", at, coords;
      if (t.stage === 0) { coords = od.empty.coords; at = S.me || DEPOT.at; }
      else { coords = od.line; at = t.stage === 1 ? od.stops[0] : t.stage === 2 ? coords[Math.floor(coords.length * .4)] : od.stops[od.stops.length - 1]; }
      lineOn(m, coords, col);
      if (t.stage === 0) dot(m, od.stops[0], "mk-pick");
      else { od.stops.slice(0, -1).forEach(function (s) { dot(m, s, "mk-pick"); }); dot(m, od.stops[od.stops.length - 1], "mk-drop"); }
      truck(m, at);
      m.fitBounds(coords, pad);
    }
  }
  function setOrigin(at) {
    S.me = at;
    ORDERS.forEach(function (o) { if (!inGraph(o.stops[0])) return; o.empty = router.route(at, o.stops[0]); o.emptyKm = o.empty.meters / 1000; o.emptyMin = Math.round(o.empty.seconds / 60); o.perKm = Math.round(o.fare / (o.km + o.emptyKm)); });
  }
  function locate() {
    if (!navigator.geolocation) return say("이 브라우저에서는 위치를 쓸 수 없습니다.");
    navigator.geolocation.getCurrentPosition(function (p) {
      var at = [p.coords.latitude, p.coords.longitude];
      if (!inGraph(at)) return say("지금 위치는 내장 경로 범위(구미·칠곡) 밖입니다.");
      setOrigin(at); say("내 위치 기준으로 공차 거리를 다시 계산했습니다.");
    }, function () { say("위치를 가져오지 못했습니다. 브라우저에서 위치 권한을 허용해 주세요."); }, { enableHighAccuracy: true, timeout: 10000 });
  }
  function openDetail(id) { S.id = id; S.cd = S.v === "c" ? 45 : 41; S.s = "detail"; render(); }
  function say(msg) { S.toast = msg; render(); clearTimeout(toastT); toastT = setTimeout(function () { S.toast = ""; render(); }, 2400); }

  phone.addEventListener("click", function (e) {
    var b = e.target.closest("[data-go],[data-act]"); if (!b) return;
    var go = b.getAttribute("data-go"), act = b.getAttribute("data-act");
    if (go) { S.s = go; return render(); }
    var id = +b.getAttribute("data-id");
    if (act === "toggle") { S.online = !S.online; render(); }
    else if (act === "pick") { if (S.id !== id) { S.id = id; render(); } else openDetail(id); }
    else if (act === "open") openDetail(id);
    else if (act === "sort") { S.sort = b.getAttribute("data-k"); render(); }
    else if (act === "fit") { S.fit = !S.fit; render(); }
    else if (act === "bmap") { S.bmap = !S.bmap; render(); }
    else if (act === "callstep") { var l = sorted(), i = l.indexOf(byId(S.id)), d = +b.getAttribute("data-d"); S.id = l[(i + d + l.length) % l.length].id; render(); }
    else if (act === "accept") { S.trip = { id: S.id, stage: 0, scanned: 0 }; S.s = "trip"; render(); }
    else if (act === "retry") { S.cd = 45; render(); }
    else if (act === "scan") { S.trip.scanned = Math.min(18, S.trip.scanned + 1); render(); }
    else if (act === "stage") { S.trip.stage = Math.min(4, S.trip.stage + 1); render(); }
    else if (act === "locate") locate();
    else if (act === "toast") say(b.getAttribute("data-msg"));
  });
  phone.addEventListener("input", function (e) {
    if (e.target.id !== "q") return;
    S.q = e.target.value; var pos = e.target.selectionStart; render();
    var q = document.getElementById("q"); if (q) { q.focus(); q.setSelectionRange(pos, pos); }
  });

  /* 안내 화면 */
  var vbox = document.getElementById("versions"), sbox = document.getElementById("screens"), note = document.getElementById("vnote");
  Object.keys(VERSIONS).filter(function (k) { return !FIXED || k === FIXED; }).forEach(function (k) { var b = document.createElement("button"); b.className = "vbtn"; b.dataset.v = k; b.innerHTML = "<b>" + VERSIONS[k].name + "</b><span>" + VERSIONS[k].sub + "</span>"; b.onclick = function () { S.v = k; render(); }; vbox.appendChild(b); });
  SCREENS.forEach(function (s) { var b = document.createElement("button"); b.dataset.s = s[0]; b.textContent = s[1]; b.onclick = function () { if (s[0] === "detail") openDetail(S.id); else { S.s = s[0]; render(); } }; sbox.appendChild(b); });
  function syncHub() {
    Array.prototype.forEach.call(vbox.children, function (b) { b.setAttribute("aria-pressed", b.dataset.v === S.v); });
    Array.prototype.forEach.call(sbox.children, function (b) { b.setAttribute("aria-pressed", b.dataset.s === S.s); });
    var V = VERSIONS[S.v];
    note.innerHTML = "<h2>" + V.name + '</h2><p class="muted" style="margin:0">' + V.refs + '</p><ul class="notes">' + V.why.map(function (w) { return "<li>" + w + "</li>"; }).join("") + '</ul><p style="margin:0;font-weight:700">' + V.best + "</p>";
  }
  /* 좌표 실험 */
  var lab = baseMap(document.getElementById("labmap")), labLayer = L.layerGroup().addTo(lab), nextEnd = "from";
  lab.fitBounds(BOUNDS);
  factoryDots(lab, FACTORIES, "#2B5C9E");
  var f = { fa: document.getElementById("fromLat"), fo: document.getElementById("fromLon"), ta: document.getElementById("toLat"), to: document.getElementById("toLon") };
  var labToken = 0;
  function labMsg(t) { document.getElementById("labstat").innerHTML = "<tr><th>" + esc(t) + "</th></tr>"; }
  function factoryLabel(p) { var x = factoryAt(p); return x ? x[3] + " #" + x[2] : "공장 좌표 아님"; }
  function labShow(r, a, b, source) {
    labLayer.clearLayers();
    L.polyline(r.coords, { color: "#FFF", weight: 7 }).addTo(labLayer); L.polyline(r.coords, { color: "#1F5A3F", weight: 4 }).addTo(labLayer);
    L.marker(a, { icon: divIcon("mk-pick", "", 20, 20), interactive: false }).addTo(labLayer); L.marker(b, { icon: divIcon("mk-drop", "", 20, 20), interactive: false }).addTo(labLayer);
    lab.fitBounds(r.coords, { padding: [24, 24] });
    document.getElementById("labstat").innerHTML = [["거리", km1(r.meters / 1000)], ["예상 시간 (정체 미반영)", Math.round(r.seconds / 60) + "분"], ["탐색한 교차점", r.settled.toLocaleString("ko-KR") + " / " + r.totalNodes.toLocaleString("ko-KR")], ["계산 시간", r.computeMs.toFixed(1) + "ms"], ["도로까지 보정 거리", r.snapFrom + "m / " + r.snapTo + "m"], ["출발 공장", factoryLabel(a)], ["도착 공장", factoryLabel(b)], ["도로 데이터", source]].map(function (x) { return "<tr><th>" + x[0] + "</th><td>" + x[1] + "</td></tr>"; }).join("");
    window.__lastRoute = { km: r.meters / 1000, min: r.seconds / 60, source: source };
  }
  function labRun() {
    var a = [parseFloat(f.fa.value), parseFloat(f.fo.value)], b = [parseFloat(f.ta.value), parseFloat(f.to.value)], token = ++labToken;
    if (a.concat(b).some(isNaN) || Math.abs(a[0]) > 90 || Math.abs(b[0]) > 90 || Math.abs(a[1]) > 180 || Math.abs(b[1]) > 180) return labMsg("좌표를 숫자로 입력해 주세요. 예: 위도 37.3055, 경도 126.79");
    if (inGraph(a) && inGraph(b)) {
      var r = router.route(a, b);
      if (!r) return labMsg("두 지점을 잇는 도로를 찾지 못했습니다.");
      return labShow(r, a, b, "내장");
    }
    if (!LIVE) return labMsg("인터넷 연결 없이는 구미·칠곡 범위 안에서만 계산합니다.");
    var direct = Dijkstra.haversine(a, b) / 1000;
    if (direct > 100) return labMsg("직선거리 100km 이내만 실시간으로 계산합니다. 지금은 " + Math.round(direct) + "km입니다.");
    labMsg("실제 도로 데이터를 받는 중입니다.");
    var post = function (host) { var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, 40000); return fetch(host + "/api/interpreter", { signal: ctl.signal, method: "POST", body: "data=" + encodeURIComponent(RoadNet.query(a, b, direct)), headers: { "Content-Type": "application/x-www-form-urlencoded" } }).then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); }).finally(function () { clearTimeout(tm); }); };
    post("https://overpass-api.de").catch(function () { return post("https://overpass.kumi.systems"); })
      .then(function (osm) {
        if (token !== labToken) return;
        var g = RoadNet.build(osm, window.ROAD_GRAPH.meta.vehicle, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
        var r2 = g && Dijkstra.createRouter(g).route(a, b);
        if (!r2) return labMsg("두 지점을 잇는 도로를 찾지 못했습니다.");
        if (r2.snapFrom > 1000 || r2.snapTo > 1000) return labMsg("좌표 근처 1km 안에 화물차가 다닐 도로가 없습니다. 좌표를 도로 가까이 옮겨 주세요.");
        labShow(r2, a, b, "실시간");
      })
      .catch(function () { if (token === labToken) labMsg("도로 데이터 서버가 응답하지 않습니다. 잠시 뒤 다시 눌러 주세요."); });
  }
  function searchPlace(end) {
    var q = document.getElementById("place").value.trim(); if (!q) return labMsg("찾을 주소나 장소를 입력해 주세요.");
    if (!LIVE) return labMsg("주소 검색은 인터넷 연결이 필요합니다. 좌표를 직접 넣어 주세요.");
    labMsg("주소를 찾는 중입니다.");
    fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=kr&q=" + encodeURIComponent(q))
      .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(function (l) {
        if (!l.length) return labMsg("검색 결과가 없습니다. 시·군·구까지 넣어 다시 찾아보세요.");
        var la = (+l[0].lat).toFixed(5), lo = (+l[0].lon).toFixed(5);
        if (end === "from") { f.fa.value = la; f.fo.value = lo; } else { f.ta.value = la; f.to.value = lo; }
        labRun();
      })
      .catch(function () { labMsg("주소 검색 서버가 응답하지 않습니다. 좌표를 직접 넣어 주세요."); });
  }
  document.getElementById("placeFrom").addEventListener("click", function () { searchPlace("from"); });
  document.getElementById("placeTo").addEventListener("click", function () { searchPlace("to"); });
  lab.on("click", function (e) { var hit = nearestFactory([e.latlng.lat, e.latlng.lng], 400), la = hit ? hit[0] : e.latlng.lat.toFixed(5), lo = hit ? hit[1] : e.latlng.lng.toFixed(5); if (nextEnd === "from") { f.fa.value = la; f.fo.value = lo; nextEnd = "to"; } else { f.ta.value = la; f.to.value = lo; nextEnd = "from"; labRun(); } });
  document.getElementById("labform").addEventListener("submit", function (e) { e.preventDefault(); labRun(); });
  var o0 = ORDERS[0]; f.fa.value = o0.stops[0][0]; f.fo.value = o0.stops[0][1]; f.ta.value = o0.stops[o0.stops.length - 1][0]; f.to.value = o0.stops[o0.stops.length - 1][1]; labRun();
  var meta = window.ROAD_GRAPH.meta;
  function labNote() { document.getElementById("labmeta").textContent = "공장 좌표 " + FACTORIES.length.toLocaleString("ko-KR") + "곳을 파란 점으로 표시합니다. " + (LIVE ? "지도: 실시간 OpenStreetMap. 전국을 이동·확대할 수 있고 범위 밖 좌표는 실제 도로 데이터를 받아 계산합니다." : "지도: 내장 OpenStreetMap (" + meta.extractedAt.slice(0, 10) + " 기준). 인터넷을 쓸 수 없어 구미·칠곡 일대만 표시합니다.") + " 일방통행과 차량 제한을 반영했고, 회전 제한과 실시간 교통은 반영하지 않았습니다."; }
  labNote();

  var h = (location.hash || "").match(/^#([abc])-(home|orders|detail|trip|earn|my)$/);
  if (h) { if (!FIXED) S.v = h[1]; S.s = h[2]; }
  window.__app = { S: S, render: render, orders: ORDERS, openDetail: openDetail, live: function () { return LIVE; } };
  render();
  var probe = new Image();
  probe.onload = function () {
    LIVE = true;
    lab.setMaxBounds(null); lab.setMinZoom(6); lab.setMaxZoom(19);
    lab.eachLayer(function (l) { if (l instanceof L.TileLayer) lab.removeLayer(l); });
    addTiles(lab); labNote(); render();
  };
  probe.src = "https://tile.openstreetmap.org/14/13963/6362.png";
})();
