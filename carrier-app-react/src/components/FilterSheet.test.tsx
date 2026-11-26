import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_FILTERS } from "../lib/orders";
import FilterSheet from "./FilterSheet";

const setup = (filters = DEFAULT_FILTERS) => {
  const onChange = vi.fn(), onClose = vi.fn();
  render(<FilterSheet filters={filters} callTypes={["장거리", "혼적"]} resultCount={4} onChange={onChange} onClose={onClose} />);
  return { onChange, onClose, user: userEvent.setup() };
};

describe("필터 시트", () => {
  it("결과 수를 버튼에 보여 주고 처음에 그 버튼에 초점을 둔다", () => {
    setup();
    const done = screen.getByRole("button", { name: "콜 4건 보기" });
    expect(done).toHaveFocus();
  });
  it("공차 상한을 고른다", async () => {
    const { onChange, user } = setup();
    await user.click(screen.getByRole("button", { name: "10km 이내" }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, maxEmptyKm: 10 });
  });
  it("콜 종류는 여러 개를 켜고 끌 수 있다", async () => {
    const { onChange, user } = setup({ ...DEFAULT_FILTERS, types: ["혼적"] });
    await user.click(screen.getByRole("button", { name: "장거리" }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, types: ["혼적", "장거리"] });
    await user.click(screen.getByRole("button", { name: "혼적" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, types: [] });
  });
  it("초기화하면 기본값으로 돌아간다", async () => {
    const { onChange, user } = setup({ ...DEFAULT_FILTERS, savedOnly: true });
    await user.click(screen.getByRole("button", { name: "초기화" }));
    expect(onChange).toHaveBeenCalledWith(DEFAULT_FILTERS);
  });
  it("Esc로 닫힌다", async () => {
    const { onClose, user } = setup();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
  it("켜진 항목을 보조기기에 알린다", () => {
    setup({ ...DEFAULT_FILTERS, region: "far" });
    expect(screen.getByRole("button", { name: "다른 지역" })).toHaveAttribute("aria-pressed", "true");
  });
});
