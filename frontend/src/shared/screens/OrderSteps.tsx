import { orderStatusText } from "../orderStatus";
import { Ic } from "../ui/index";
const stages = [
  "payment_held",
  "dispatched",
  "picked_up",
  "arrived",
  "settled",
];
export function Steps({ status, transport }: { status: string; transport?: string | null | undefined }) {
  const at =
    status === "confirmed"
      ? 4
      : status === "rated"
        ? 4
        : stages.indexOf(status);
  return (
    <div
      className="steps"
      aria-label={`현재 단계 ${orderStatusText(status, transport)}`}
    >
      {["구매 요청", transport === "self" ? "수거 준비" : "출고 준비", transport === "self" ? "직접 운반" : "운송 중", "입고 검사", "정산 완료"].map(
        (s, i) => (
          <span
            key={s}
            className={`step ${i <= at ? "on" : ""} ${i === at ? "current" : ""}`}
          >
            <span className="step-mark">
              <Ic
                name={
                  i < at
                    ? "step_done"
                    : i === at
                      ? "step_current"
                      : "step_pending"
                }
              />
            </span>
            {s}
          </span>
        ),
      )}
    </div>
  );
}
