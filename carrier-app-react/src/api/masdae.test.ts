import { describe, expect, it, vi } from "vitest";
import { actionForStage, ApiError, callToSeed, createMasdaeClient, statusForStage, type CallDto } from "./masdae";

const CALL: CallDto = { order_id: 9, waste_code: "51-03", total_kg: 3200, pickup: { lat: 36.1, lon: 128.3 }, dropoff: { lat: 36.04, lon: 128.34 } };
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("마대 장터 API", () => {
  it("회사 헤더를 붙여 콜 목록을 읽는다", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(ok([CALL]));
    await expect(createMasdaeClient("http://x", 5, f).listCalls()).resolves.toEqual([CALL]);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("http://x/v1/calls");
    expect(init?.method).toBe("GET");
    expect(init?.headers).toMatchObject({ "X-Company-Id": "5" });
  });
  it("수락은 계약대로 freight_krw를 보낸다", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(ok({ order_id: 9, status: "dispatched", hauler_id: 5 }));
    await createMasdaeClient("http://x", 5, f).acceptCall(9, 71000);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("http://x/v1/calls/9/accept");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ freight_krw: 71000 }));
  });
  it("먼저 수락한 기사에게 밀리면(409) 알아듣기 쉬운 문구를 준다", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 409 }));
    const err = await createMasdaeClient("http://x", 5, f).acceptCall(9, 1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).message).toContain("이미 다른 기사");
  });
  it("운행 단계를 주문 상태와 동작에 맞춘다", () => {
    expect(statusForStage(0)).toBe("dispatched");
    expect(statusForStage(2)).toBe("picked_up");
    expect(statusForStage(3)).toBe("arrived");
    expect(actionForStage({ id: 1, stage: 1, scanned: 18 })).toBe("pickup");
    expect(actionForStage({ id: 1, stage: 2, scanned: 18 })).toBe("arrive");
    expect(actionForStage({ id: 1, stage: 0, scanned: 0 })).toBeNull();
  });
  it("백엔드 콜을 화면 콜로 바꾼다", () => {
    const s = callToSeed(CALL);
    expect(s.id).toBe(9);
    expect(s.stops).toEqual([[36.1, 128.3], [36.04, 128.34]]);
    expect(s.ton).toBe(3.2);
    expect(s.fare).toBe(0);
  });
});
