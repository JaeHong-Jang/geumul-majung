import { Field, Section } from "../ui/index";
import { fmt, type Order } from "../../types";
export function Weights({
  order,
  values,
  setValues,
}: {
  order: Order;
  values: Record<number, string>;
  setValues: (v: Record<number, string>) => void;
}) {
  return (
    <Section title="물품별 실측 무게">
      {(
        order.bags ??
        order.bag_ids?.map((id) => ({ id, total_kg: undefined })) ??
        []
      ).map((b) => (
        <Field
          key={b.id}
          label={`물품 ${b.id} 실측 무게 (kg)${b.total_kg != null ? `, 신고 ${fmt(b.total_kg)} kg` : ""}`}
          type="number"
          min="0.001"
          max="50000"
          step="any"
          required
          value={values[b.id] ?? ""}
          onChange={(e) => setValues({ ...values, [b.id]: e.target.value })}
        />
      ))}
    </Section>
  );
}
