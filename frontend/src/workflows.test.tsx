import { authNavigation } from "./shared/api/auth";
import { readCart } from "./apps/buyer/cartStore";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App, { Login } from "./App";
import { api, session } from "./shared/api/client";
import {
  BuyerHome,
  BundleDetail,
  Cart,
  Explore,
  ListingDetail,
  Purchase,
  RequestDone,
} from "./apps/buyer/index";
import {
  Addresses,
  Interests,
  Notifications,
  NotificationSettings,
} from "./shared/screens/account";
import { HandoverScreen, OrderDetail, Orders, Review, TradeDone } from "./shared/screens/orders";
import { MarketScreen, Volumes } from "./shared/screens/market";
import {
  roleName,
  serverRole,
  type Bundle,
  type Company,
  type Home,
  type Listing,
  type Order,
  type Role,
} from "./types";
const company: Company = {
  id: 1,
  name: "가상 자원",
  role: "recycler",
  verified: true,
  permit_codes: ["51-03-01"],
  region: "구미",
};
const listing: Listing = {
  id: 10,
  status: "posted",
  waste_code: "51-03-01",
  waste_name: "폐합성수지류(자세한 설명)",
  target_material: "pp",
  grade: "A",
  total_kg: 1200,
  price_krw_per_kg: 150,
  factory_id: 2,
  factory_name: "가상 공장",
  bag_count: 2,
  region: "구미",
  distance_km: 4,
  purity_avg: 0.98,
  bags: [
    {
      id: 30,
      waste_code: "51-03-01",
      total_kg: 600,
      pass_id: "PASS30",
      qr: "MDP-30-30",
    },
    {
      id: 31,
      waste_code: "51-03-01",
      total_kg: 600,
      pass_id: "PASS31",
      qr: "MDP-31-31",
    },
  ],
};
const bundle: Bundle = {
  id: "b1",
  waste_code: "51-03-01",
  waste_name: "폐합성수지류",
  target_material: "pp",
  grade: "A",
  listing_ids: [10, 11],
  seller_count: 2,
  total_kg: 2400,
  avg_distance_km: 3.2,
  min_lot_kg: 2000,
  meets_min_lot: true,
  avg_price: 150,
  market: null,
  reasons: ["가까운 두 기업의 같은 등급 물량입니다."],
  listings: [listing],
};
const order: Order = {
  id: 100,
  status: "dispatched",
  listing_id: 10,
  goods_krw: 180000,
  freight_cap_krw: 80000,
  held_krw: 269000,
  total_kg: 1200,
  waste_name: "폐합성수지류",
  grade: "A",
  bags: listing.bags!,
  bag_ids: [30, 31],
  factory_name: "가상 공장",
  recycler_name: "가상 자원",
};
const preview = {
  goods_krw: 180000,
  held_krw: 269000,
  fee_krw: 0,
  items: [],
  pickup_groups: [
    {
      factory_ids: [2, 3],
      listing_ids: [10, 11],
      total_kg: 2400,
      radius_km: 5,
    },
  ],
};
const home: Home = {
  company,
  listings: [listing],
  prices: [
    {
      item: "PP 압축",
      category: "폐플라스틱",
      price: 120,
      unit: "원/kg",
      date: "2026-09-10",
      change_pct: null,
    },
  ],
  bundles: [bundle],
  volumes: [],
  unread: 1,
};
type Handler = (
  path: string,
  method: string,
  body: Record<string, unknown>,
) => unknown;
let handler: Handler;
const fetchMock = vi.fn();
function response(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}
function calls(path: string, method = "POST") {
  return fetchMock.mock.calls
    .filter(([p, options]) => p === `/v1${path}` && options?.method === method)
    .map(([, options]) => JSON.parse(options.body ?? "{}"));
}
const go = vi.fn();
const back = vi.fn();
beforeEach(() => {
  vi.spyOn(authNavigation, "redirect").mockImplementation(() => {});
  vi.spyOn(window, "alert").mockImplementation(() => {});
  sessionStorage.clear();
  localStorage.clear();
  go.mockReset();
  back.mockReset();
  handler = (p) =>
    p === "/me/addresses"
      ? [{ id: 1, label: "본사", address: "구미 공장로 1", is_default: true }]
      : p === "/listings"
        ? [listing]
        : p === "/orders/preview"
          ? preview
          : p === "/buyer/home"
            ? home
            : p.startsWith("/market/prices/")
              ? [
                  { date: "2025", price: 100 },
                  { date: "2026-09-10", price: 120 },
                ]
              : p === "/me/orders"
                ? []
                : {};
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, options: RequestInit) => {
    if (url === "/v1/auth/providers") return response([]);
    const result = handler(
      url.replace("/v1", ""),
      options?.method ?? "GET",
      JSON.parse(String(options?.body ?? "{}")),
    );
    return result instanceof Response ? result : response(result);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function text(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function click(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}
async function purchaseChoices() {
  // 입고지는 주소록의 기본 입고지가 먼저 골라진다(쇼핑몰 배송지 방식)
  expect(await screen.findByText("구미 공장로 1")).toBeVisible();
  // 운송 방식 선택은 없고 판매자가 운송을 맡는다
  expect(screen.queryByRole("radio", { name: /직접 수거/ })).not.toBeInTheDocument();
  expect(screen.queryByText("운송은 판매자가 맡음")).not.toBeInTheDocument();   // 안내 카드는 없앰
  // 결제는 안전결제 하나, 세금계산서 발행 요청은 기본으로 켜져 있고 이메일이 필요
  expect(screen.queryByRole("radio", { name: /세금계산서 발행 후 계좌이체/ })).not.toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "세금계산서 발행 요청" })).toBeChecked();
  text("세금계산서 받을 이메일", "tax@example.com");
  text("희망 도착일 (선택)", "2026-12-01");
  text("판매자에게 남길 말 (선택)", "수거 전 연락");
  fireEvent.click(screen.getByRole("checkbox", { name: "검수 결과에 따른 정산 금액 조정 동의" }));
}
describe("공통 역할 로그인", () => {
  for (const role of ["buyer", "seller"] as Role[]) {
    it(`${role} 성공, 회사 응답 저장 및 /me 생략`, async () => {
      handler = () => ({
        access_token: "token",
        company: { ...company, role: serverRole[role] },
      });
      render(<Login appRole={role} onLogin={go} />);
      text("사업자 계정", "demo");
      text("비밀번호", "password");
      click(`${roleName[role]}로 로그인`);
      await waitFor(() => expect(go).toHaveBeenCalledOnce());
      expect(session(role)?.access_token).toBe("token");
      expect(calls("/auth/login")[0]).toEqual({
        login_id: "demo",
        password: "password",
      });
      expect(fetchMock.mock.calls.filter(([url]) => url === "/v1/auth/login")).toHaveLength(1);
    });
    it(`${role} 다른 역할 앱 이동`, async () => {
      handler = () => ({
        access_token: "token",
        company: {
          ...company,
          role: role === "buyer" ? "factory" : "recycler",
        },
      });
      render(<Login appRole={role} onLogin={go} />);
      text("사업자 계정", "demo");
      text("비밀번호", "password");
      click(`${roleName[role]}로 로그인`);
      const target = role === 'buyer' ? 'seller' : 'buyer';
      await waitFor(() => expect(authNavigation.redirect).toHaveBeenCalledWith(`/${target}/`));
      expect(session(target)?.access_token).toBe('token');
      expect(session(role)).toBeNull();
      expect(go).not.toHaveBeenCalled();
    });
    it(`${role} iframe 교차 로그인은 메시지만 보내고 비밀번호를 비움`, async () => {
      const postMessage = vi.fn();
      vi.stubGlobal('parent', { postMessage });
      const target = role === 'buyer' ? 'seller' : 'buyer';
      handler = () => ({ access_token: 'token', company: { ...company, role: target === 'seller' ? 'factory' : 'recycler' } });
      render(<Login appRole={role} onLogin={go} />);
      text('사업자 계정', 'demo');
      text('비밀번호', 'password');
      click(`${roleName[role]}로 로그인`);
      await waitFor(() => expect(postMessage).toHaveBeenCalledWith({ type: 'janjaemi:open-app', role: target }, location.origin));
      expect(authNavigation.redirect).not.toHaveBeenCalled();
      expect(go).not.toHaveBeenCalled();
      expect(screen.getByLabelText('비밀번호')).toHaveValue('');
      expect(screen.getByLabelText('사업자 계정')).toBeVisible();
      expect(window.alert).toHaveBeenCalledWith(`${roleName[target]} 앱 로그인 완료`);
      expect(session(target)?.access_token).toBe('token');
    });
    it(`${role} 실패 시 입력 유지`, async () => {
      fetchMock.mockResolvedValue(
        response({ detail: ["비밀번호가 틀렸어요"] }, 400),
      );
      render(<Login appRole={role} onLogin={go} />);
      text("사업자 계정", "demo");
      text("비밀번호", "bad");
      click(`${roleName[role]}로 로그인`);
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "입력값 확인 필요",
      );
      expect(screen.getByLabelText("사업자 계정")).toHaveValue("demo");
      expect(screen.getByLabelText("비밀번호")).toHaveValue("bad");
    });
  }
});
it("401 세션 삭제 이벤트", async () => {
  sessionStorage.setItem(
    "janjaemi:buyer",
    JSON.stringify({ access_token: "expired", company }),
  );
  const onExpired = vi.fn();
  window.addEventListener("session-expired", onExpired);
  fetchMock.mockResolvedValue(response({ detail: "로그인 필요" }, 401));
  await expect(api("buyer", "/buyer/home")).rejects.toThrow("로그인 필요");
  expect(session("buyer")).toBeNull();
  expect(onExpired).toHaveBeenCalledOnce();
  window.removeEventListener("session-expired", onExpired);
});
it("단건 주문 transport/payment/날짜/배송지/메모 전송, 서버 보류액 완료 표시", async () => {
  const old = handler;
  handler = (p, m, b) =>
    p === "/orders" && m === "POST"
      ? { ...order, held_krw: 73123 }
      : old(p, m, b);
  render(<Purchase id={10} ids={undefined} go={go} back={back} />);
  await purchaseChoices();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "구매 요청 보내기" }),
    ).toBeEnabled(),
  );
  click("구매 요청 보내기");
  await waitFor(() => expect(go).toHaveBeenCalled());
  expect(calls("/orders")[0]).toEqual({
    listing_id: 10,
    transport: "seller",
    payment: "escrow",
    dock: { unload: "forklift", max_vehicle: "11t", hours: "평일 09:00~18:00", note: null },
    delivery_address: "구미 공장로 1",
    desired_date: "2026-12-01",
    note: "수거 전 연락",
    tax_invoice: { email: "tax@example.com" },
  });
  cleanup();
  render(<RequestDone orders={[{ ...order, held_krw: 73123 }]} go={go} />);
  expect(screen.getByText("73,123원")).toBeVisible();
});
it("묶음 구매 batch 원자 요청", async () => {
  const old = handler;
  handler = (p, m, b) =>
    p === "/orders/batch" ? { orders: [order] } : old(p, m, b);
  render(<Purchase id={undefined} ids={[10, 11]} go={go} back={back} />);
  await purchaseChoices();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "구매 요청 보내기" }),
    ).toBeEnabled(),
  );
  click("구매 요청 보내기");
  await waitFor(() => expect(calls("/orders/batch")).toHaveLength(1));
  expect(calls("/orders/batch")[0]).toMatchObject({
    listing_ids: [10, 11],
    transport: "seller",
    payment: "escrow",
    tax_invoice: { email: "tax@example.com" },
  });
  // 운송과 운임은 판매자가 맡아 운임 부담 주체를 따로 보내지 않는다
  expect(calls("/orders/batch")[0]).not.toHaveProperty("freight_payer");
});
it("묶음 상세 사유와 매물 ID 유지", () => {
  render(<BundleDetail bundle={bundle} go={go} back={back} />);
  expect(screen.getByText(bundle.reasons[0]!)).toBeVisible();
  click("묶음 구매 요청");
  expect(go).toHaveBeenCalledWith({ name: "purchase", ids: [10, 11] });
});
it("장바구니 선택/삭제/미리보기와 합배송 제안", async () => {
  localStorage.setItem(
    "janjaemi:cart:guest",
    JSON.stringify([listing, { ...listing, id: 11 }]),
  );
  render(<Cart go={go} />);
  expect(await screen.findByText(/매물 2건, 합계/)).toBeVisible();
  expect(calls("/orders/preview")[0]).toEqual({
    listing_ids: [10, 11],
    transport: "seller",
  });   // 운송은 판매자가 맡고 운임은 판매자 부담(운임 칸 없음)
  click("선택 삭제");
  expect(readCart()).toEqual([]);
});
it("홈 bundles 우선, 실제 시세 그래프, 자리표시자 없음", async () => {
  const { container } = render(<BuyerHome go={go} />);
  expect(await screen.findByText("최소 구매량 충족")).toBeVisible();
  expect(
    await screen.findByRole("img", { name: /PP 압축 실제 시세 추이/ }),
  ).toBeVisible();
  expect(container.textContent).not.toMatch(/\[[^\]]+\]/);
  expect(container.textContent).not.toContain("자세한 설명");
  expect(screen.getByText(/2개 기업/)).toBeVisible();
});
it("물량의 합계/가격/재질 표시", () => {
  render(
    <Volumes
      volumes={[
        {
          waste_code: "51-03-01",
          waste_name: "폐합성수지류(설명)",
          target_material: "pp",
          total_kg: 12345,
          listing_count: 2,
          seller_count: 2,
          bag_count: 20,
          min_price: 1200,
          max_price: 2000,
          grades: { A: 12345 },
          market: null,
        },
      ]}
    />,
  );
  expect(screen.getByText("12,345 kg")).toBeVisible();
  expect(screen.getByText("1,200 ~ 2,000원/kg")).toBeVisible();
  expect(screen.getByText("PP, 폐합성수지류")).toBeVisible();
});
it("시세 null 등락률을 지어내지 않음", async () => {
  handler = (p) =>
    p.startsWith("/market/prices?")
      ? home.prices
      : p.includes("/history")
        ? [
            { date: "2025", price: 100 },
            { date: "2026-09-10", price: 120 },
          ]
        : {};
  render(<MarketScreen appRole="buyer" back={back} />);
  expect((await screen.findAllByText("PP 압축")).length).toBeGreaterThan(0);
  expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
});
it("원료 찾기: 검색, 대표 품목, 정렬, 지역 필터 (등급 없음)", async () => {
  handler = (p) =>
    p.startsWith("/listings?")
      ? [listing, { ...listing, id: 11, region: "대전", grade: "B", target_material: "pe" }]
      : {};
  render(<Explore go={go} />);
  expect(await screen.findByRole("heading", { name: "판매 중 2건" })).toBeVisible();
  // 대표 품목을 고르면 그 재질만 남고, 선택 카드에 주 재질이 크게 보인다
  fireEvent.click(screen.getByRole("button", { name: "PP, 매물 1건" }));
  expect(await screen.findByRole("heading", { name: "판매 중 1건" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "PP, 매물 1건" }));   // 다시 누르면 선택 해제
  // 검색어는 재질, 품목, 판매처를 함께 찾는다
  text("검색", "PE");
  expect(await screen.findByRole("heading", { name: "판매 중 1건" })).toBeVisible();
  text("검색", "");
  // 정렬과 지역은 시트에서 고르고, 등급은 서버에 보내지 않는다
  fireEvent.click(screen.getByRole("button", { name: /최신 순/ }));
  expect(screen.queryByRole("button", { name: "A등급" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "가격 낮은 순" }));
  await waitFor(() =>
    expect(fetchMock.mock.calls.some(([url]) => url.includes("sort=price"))).toBe(true),
  );
  expect(fetchMock.mock.calls.some(([url]) => url.includes("grade="))).toBe(false);
  fireEvent.click(await screen.findByRole("button", { name: "대전" }));
  expect(await screen.findByRole("heading", { name: "판매 중 1건" })).toBeVisible();
  expect(document.body.textContent).not.toMatch(/등급|통과증|마대|순도/);
});
it("매물 찜 PUT과 DELETE, 상세에 등급·통과증·마대 없음", async () => {
  let favorite = false;
  handler = (p, m) =>
    p === "/listings/10"
      ? { ...listing, favorite }
      : p === "/favorites/10"
        ? ((favorite = m === "PUT"), {})
        : {};
  render(<ListingDetail id={10} go={go} back={back} />);
  await screen.findByText(/^전체 [0-9.,]+(kg|t), /);
  expect(screen.getByRole("heading", { name: "PP" })).toBeVisible();
  expect(screen.getByText("150")).toBeVisible();
  expect(screen.queryByText(/내 공장까지/)).not.toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/등급|통과증|마대|순도|이물질/);
  click("찜하기");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "찜 해제" })).toHaveAttribute(
      "aria-pressed",
      "true",
    ),
  );
  expect(calls("/favorites/10", "PUT")[0]).toEqual({});
  click("찜 해제");
  await waitFor(() => expect(calls("/favorites/10", "DELETE")).toHaveLength(1));
  expect(calls("/favorites/10", "DELETE")[0]).toEqual({});
  await waitFor(() => expect(screen.getByRole("button", {name:"찜하기"})).toHaveAttribute("aria-pressed", "false"));
});
it("배송지 추가·기본 지정·삭제 요청", async () => {
  handler = (p, m) =>
    p === "/me/addresses" && m === "GET"
      ? [{ id: 4, label: "공장", address: "구미", is_default: false }]
      : {};
  render(<Addresses appRole="buyer" back={back} />);
  await screen.findByText("공장");
  text("배송지 이름", "창고");
  text("주소", "대전 창고로 2");
  click("배송지 추가");
  await waitFor(() =>
    expect(calls("/me/addresses")[0]).toEqual({
      label: "창고",
      address: "대전 창고로 2",
    }),
  );
  click("기본으로 설정");
  await waitFor(() => expect(calls("/me/addresses/4/default")).toHaveLength(1));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "삭제" })).toBeEnabled(),
  );
  click("삭제");
  await waitFor(() =>
    expect(calls("/me/addresses/4", "DELETE")).toHaveLength(1),
  );
});
it("관심 품목 PUT, 등급 선택 없음", async () => {
  handler = () => ({ waste_codes: [], min_grade: "B" });
  render(<Interests appRole="buyer" back={back} />);
  await screen.findByText("관심 품목");
  expect(screen.queryByLabelText("최소 등급")).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("폐합성수지류"));
  click("설정 저장");
  await waitFor(() =>
    expect(calls("/me/interests", "PUT")[0]).toEqual({
      waste_codes: ["51-03-01"],
      min_grade: null,
    }),
  );
});
it("알림 읽음과 설정 PUT", async () => {
  handler = (p) =>
    p === "/notifications"
      ? {
          unread: 1,
          items: [
            {
              id: 9,
              title: "출고 완료",
              body: "판매자가 물품을 출고했습니다",
              read: false,
              order_id: 100,
              created_at: "2026-11-05",
            },
          ],
        }
      : { orders: true, market: false };
  render(<Notifications appRole="buyer" go={go} back={back} />);
  await screen.findByText("판매자가 물품을 출고했습니다");
  expect(screen.getByText("출고 완료")).toBeVisible();
  fireEvent.click(screen.getByRole("button", {name:/판매자가 물품을 출고했습니다/}));
  await waitFor(() => expect(calls("/notifications/9/read")).toHaveLength(1));
  expect(go).toHaveBeenCalledWith({ name: "order", id: 100 });
  cleanup();
  render(<NotificationSettings appRole="buyer" back={back} />);
  await screen.findByText("주문 상태 알림");
  fireEvent.click(screen.getByLabelText("시세 알림"));
  click("알림 설정 저장");
  await waitFor(() =>
    expect(calls("/me/notification-settings", "PUT")[0]).toEqual({
      orders: true,
      market: true,
    }),
  );
});
it("입고 검사: 받은 전체 무게 한 칸, 불합격, 메모 요청", async () => {
  handler = (p) =>
    p === "/orders/100"
      ? { ...order, status: "arrived" }
      : { status: "disputed" };
  render(<Review appRole="buyer" id={100} go={go} back={back} />);
  await screen.findByLabelText("받은 전체 무게 (kg)");
  expect(document.body.textContent).not.toMatch(/마대|통과증|등급/);
  text("받은 전체 무게 (kg)", "1100");
  expect(screen.getByText(/5% 넘게 차이/)).toBeVisible();
  fireEvent.click(screen.getByLabelText("불합격"));
  text("검사 메모", "혼입 확인");
  click("입고 검사 제출");
  // 서버 형식은 마대별이라 신고 무게(600, 600) 비율로 나눠 보낸다
  await waitFor(() =>
    expect(calls("/orders/100/inspect")[0]).toEqual({
      bag_weights: [
        { bag_id: 30, kg: 550 },
        { bag_id: 31, kg: 550 },
      ],
      passed: false,
      note: "혼입 확인",
    }),
  );
  expect(await screen.findByText(/이의 확인 상태/)).toBeVisible();
});
it("운송 중 주문은 구매자가 도착 확인과 입고 검사를 한 번에", async () => {
  handler = (p) => (p === "/orders/100" ? { ...order, status: "picked_up" } : {});
  render(<OrderDetail appRole="buyer" id={100} go={go} back={back} />);
  fireEvent.click(await screen.findByRole("button", { name: "도착 확인, 입고 검사" }));
  expect(go).toHaveBeenCalledWith({ name: "review", id: 100 });
  cleanup();
  render(<OrderDetail appRole="seller" id={100} go={go} back={back} />);
  await screen.findByText("거래 대화");
  expect(screen.queryByRole("button", { name: "도착 확인, 입고 검사" })).not.toBeInTheDocument();
  cleanup();
  render(<Review appRole="buyer" id={100} go={go} back={back} />);
  expect(await screen.findByLabelText("받은 전체 무게 (kg)")).toBeVisible();
  expect(screen.getByText("입고 검사 제출")).toBeVisible();
});
it("입고 검사 합격이면 거래 완료 화면으로 넘어가 영수증과 남은 일 표시", async () => {
  handler = (p) =>
    p === "/orders/100"
      ? { ...order, status: "arrived" }
      : { status: "settled", settlement: { factory_krw: 171000, platform_krw: 9000 } };
  render(<Review appRole="buyer" id={100} go={go} back={back} />);
  await screen.findByLabelText("받은 전체 무게 (kg)");
  text("받은 전체 무게 (kg)", "1200");
  click("입고 검사 제출");
  await waitFor(() => expect(go).toHaveBeenCalledWith({ name: "trade-done", id: 100 }));
  cleanup();
  handler = () => ({ ...order, status: "settled", settlement: { factory_krw: 171000, platform_krw: 9000 } });
  render(<TradeDone appRole="buyer" id={100} go={go} />);
  expect(await screen.findByRole("heading", { name: "거래 완료" })).toBeVisible();
  expect(screen.getByLabelText("주문 100 영수증")).toHaveTextContent("판매자 정산");
  click("인계서 작성");
  expect(go).toHaveBeenCalledWith({ name: "handover", id: 100 });
});
it("판매자 번호는 3칸 작성 뒤 등록, 번호 있으면 잠금", async () => {
  let locked = false;
  handler = (p, m) =>
    p.endsWith("/handover/number")
      ? ((locked = true), {})
      : p.endsWith("/handover")
        ? {
            emitter: {},
            carrier: {},
            processor: {},
            allbaro_no: locked ? "AB123" : null,
          }
        : m === "GET"
          ? { ...order, status: "settled" }
          : {};
  render(<HandoverScreen appRole="seller" id={100} back={back} />);
  await screen.findByLabelText("올바로 번호");
  text("올바로 번호", "AB123");
  click("번호 등록");
  await waitFor(() =>
    expect(calls("/orders/100/handover/number")[0]).toEqual({
      allbaro_no: "AB123",
    }),
  );
  expect(await screen.findByText("올바로 번호, 작성 잠금")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "번호 등록" }),
  ).not.toBeInTheDocument();
});
it("세션 유지로 시작 화면 뒤 홈 진입, 401 로그인 이동", async () => {
  sessionStorage.setItem(
    "janjaemi:buyer",
    JSON.stringify({ access_token: "saved", company }),
  );
  vi.useFakeTimers();
  render(<App appRole="buyer" />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4300);
  });
  vi.useRealTimers();
  vi.restoreAllMocks();
  expect(await screen.findByRole("heading", {name:"가상 자원"})).toBeVisible();
  expect(
    fetchMock.mock.calls.some(([url]) => url.includes("/auth/login")),
  ).toBe(false);
  act(() =>
    window.dispatchEvent(
      new CustomEvent("session-expired", { detail: "buyer" }),
    ),
  );
  expect(screen.getByRole("textbox", { name: "사업자 계정" })).toBeVisible();
});
it("주문 취소와 confirmed 상태 대응", async () => {
  handler = (p) =>
    p === "/orders/100" ? { ...order, status: "payment_held" } : {};
  render(<OrderDetail appRole="buyer" id={100} go={go} back={back} />);
  await screen.findByText("주문 취소");
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  click("주문 취소");
  expect(confirm).toHaveBeenCalledOnce();
  expect(calls("/orders/100/cancel")).toHaveLength(0);
  confirm.mockReturnValue(true);
  click("주문 취소");
  await waitFor(() => expect(calls("/orders/100/cancel")).toEqual([{}]));
  cleanup();
  // 판매자 출고 준비 중에도 구매자가 취소할 수 있고, 배차 해제와 운행 진행 버튼은 없다
  handler = (p) => (p === "/orders/100" ? order : {});
  render(<OrderDetail appRole="buyer" id={100} go={go} back={back} />);
  expect(await screen.findByRole("button", { name: "주문 취소" })).toBeEnabled();
  expect(screen.getAllByText("판매자 출고 준비").length).toBeGreaterThan(0);
  expect(screen.queryByText("배차 해제")).not.toBeInTheDocument();
  expect(screen.queryByText("운행 진행")).not.toBeInTheDocument();
  cleanup();
  // 판매자 화면에는 주문 취소가 없다
  render(<OrderDetail appRole="seller" id={100} go={go} back={back} />);
  await screen.findByText("거래 대화");
  expect(screen.queryByRole("button", { name: "주문 취소" })).not.toBeInTheDocument();
  cleanup();
  handler = () => [{ ...order, status: "confirmed" }];
  render(<Orders appRole="buyer" go={go} />);
  expect(await screen.findByText("검사 확정")).toBeVisible();
});
it("입고 후기의 판매자 별점 요청과 운송 평가 없음", async () => {
  handler = () => ({ ...order, status: "settled", transport: "seller", allbaro_no: "AB123" });
  render(<Review appRole="buyer" id={100} go={go} back={back} />);
  await screen.findByText("판매자 평가");
  click("판매자 4점");
  text("거래 후기", "정확합니다");
  click("후기 등록");
  await waitFor(() =>
    expect(calls("/ratings")[0]).toEqual({
      order_id: 100,
      target: "factory",
      score: 4,
      comment: "정확합니다",
    }),
  );
  await screen.findByText("후기 저장 완료");
  // 운송기사 역할이 없어져 판매자 운송 주문에도 운송 평가가 없다
  expect(screen.queryByText("운송 평가")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "운송기사 3점" })).not.toBeInTheDocument();
  expect(calls("/ratings")).toHaveLength(1);
  cleanup();
  handler = () => ({
    ...order,
    status: "settled",
    transport: "self",
    allbaro_no: "AB123",
  });
  render(<Review appRole="buyer" id={100} go={go} back={back} />);
  await screen.findByText("판매자 평가");
  expect(screen.queryByText("운송 평가")).not.toBeInTheDocument();
});
it("번호 등록 전에는 후기를 보내지 못함", async () => {
  handler = () => ({ ...order, status: "settled", allbaro_no: null });
  render(<Review appRole="buyer" id={100} go={go} back={back} />);
  await screen.findByText("판매자 평가");
  expect(screen.getByRole("button", { name: "후기 등록" })).toBeDisabled();
  expect(calls("/ratings")).toHaveLength(0);
});
it("브라우저 뒤로 가기·앞으로 가기와 원료 찾기 입력 유지", async () => {
  const old = handler;
  handler = (p, m, b) =>
    p.startsWith("/listings?") ? [listing] : old(p, m, b);
  sessionStorage.setItem(
    "janjaemi:buyer",
    JSON.stringify({ access_token: "saved", company }),
  );
  vi.useFakeTimers();
  render(<App appRole="buyer" />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4300);
  });
  vi.useRealTimers();
  vi.restoreAllMocks();
  await screen.findByRole("heading", {name:"가상 자원"});
  click("매물");
  await screen.findByRole("heading", { name: "판매 중 1건" });
  fireEvent.change(screen.getByRole("textbox", { name: "검색" }), {
    target: { value: "원료" },
  });
  act(() =>
    window.dispatchEvent(
      new PopStateEvent("popstate", { state: { janjaemi: "buyer", index: 0 } }),
    ),
  );
  expect(screen.getByRole("heading", {name:"가상 자원"})).toBeVisible();
  act(() =>
    window.dispatchEvent(
      new PopStateEvent("popstate", { state: { janjaemi: "buyer", index: 1 } }),
    ),
  );
  expect(screen.getByRole("textbox", { name: "검색" })).toHaveValue("원료");
});
