import { useState } from "react";
import { api, useAction, useResource } from "../api/client";
import { AppButton, Feedback, Section, TopBar } from "../ui/index";
import { codes, type Role } from "../../types";
export function InterestsForm({
  appRole: role,
  initial,
}: {
  appRole: Role;
  initial: { waste_codes: string[]; min_grade: string | null };
}) {
  const [selected, setSelected] = useState(initial.waste_codes);
  const a = useAction();
  return (
    <>
      <Section title="관심 품목">
        {codes.map(([code, name]) => (
          <label className="option" key={code}>
            <input
              type="checkbox"
              checked={selected.includes(code)}
              onChange={() =>
                setSelected((s) =>
                  s.includes(code) ? s.filter((x) => x !== code) : [...s, code],
                )
              }
            />
            {name}
          </label>
        ))}
      </Section>
      <Feedback {...a} />
      <AppButton
        disabled={a.busy}
        onClick={() =>
          void a.run(
            () =>
              api(role, "/me/interests", "PUT", {
                waste_codes: selected,
                min_grade: null,
              }),
            () => a.setMessage("관심 품목 저장 완료"),
          )
        }
      >
        설정 저장
      </AppButton>
    </>
  );
}
export function Interests({
  appRole: role,
  back,
}: {
  appRole: Role;
  back: () => void;
}) {
  const r = useResource<{ waste_codes: string[]; min_grade: string | null }>(
    role,
    "/me/interests",
  );
  return (
    <>
      <TopBar title="관심 품목 설정" back={back} />
      <Feedback {...r} />
      {r.data && <InterestsForm appRole={role} initial={r.data} />}
    </>
  );
}
