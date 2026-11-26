import { FileInput } from '../ui/FileInput';
import { validateAttachments, uploadAttachment, downloadAttachment } from "../supportFiles";
import { useRef, useState } from "react";
import { api, useAction, useResource } from "../api/client";
import { AppButton, AppCard, Feedback, Field, Section, StatusTag, TopBar } from "../ui/index";
import { type Role } from "../../types";
export function Support({
  appRole: role,
  back,
  id,
}: {
  appRole: Role;
  id?: number;
  back: () => void;
}) {
  const faq = useResource<{ question: string; answer: string }[]>(
    role,
    "/support/faq",
  );
  const tickets = useResource<
    {
      id: number;
      subject: string;
      body: string;
      status: string;
      created_at: string;
      attachments?: {id:number; content_type:string}[];
    }[]
  >(role, "/support/tickets");
  const [subject, setSubject] = useState(id ? `주문 #${id} 문의, 분쟁` : "");
  const [body, setBody] = useState("");
  const a = useAction();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileKey, setFileKey] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  return (
    <>
      <TopBar title="고객센터" back={back} />
      <Section title="자주 묻는 질문">
        <Feedback {...faq} />
        {faq.data?.map((f) => (
          <AppCard key={f.question}>
            <details>
              <summary>{f.question}</summary>
              <p style={{ marginTop: 12, lineHeight: 1.5 }}>{f.answer}</p>
            </details>
          </AppCard>
        ))}
      </Section>
      <Section title="문의 등록">
        <Field
          label="문의 제목"
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <label className="field">
          문의 내용
          <textarea value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <FileInput key={fileKey} label="문의 첨부" id="support-attachments" ref={fileInput} multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => setFiles(Array.from(e.target.files ?? []))} />
        <p>JPEG, PNG, WebP, PDF, 파일당 2MB, 최대 5개, 합계 6MB까지 등록 가능</p>
        {files.map((f,i)=><small key={i}>{f.name}</small>)}
        <AppButton
          disabled={a.busy || !subject.trim() || !body.trim()}
          onClick={() =>
            void a.run(
              async () => {
                validateAttachments(files);
                const ticket = await api<{id:number}>(role, "/support/tickets", "POST", {subject: subject.trim(), body: body.trim()});
                setSubject(""); setBody("");
                try { for(const file of files) await uploadAttachment(role, ticket.id, file); setFiles([]); setFileKey(k => k + 1); if(fileInput.current) fileInput.current.value = ""; }
                finally { void tickets.refresh(); }
              },
              () => {
                a.setMessage("문의 등록 완료");
                setSubject("");
                setBody("");
                void tickets.refresh();
              },
            )
          }
        >
          문의 보내기
        </AppButton>
        <Feedback {...a} />
      </Section>
      <Section title="내 문의">
        <Feedback {...tickets} />
        {tickets.data?.map((t) => (
          <AppCard key={t.id}>
            <div className="stack">
              <b>{t.subject}</b>
              <p>{t.body}</p>
              <StatusTag>{t.status === "open" ? "접수됨" : t.status === "closed" ? "처리 완료" : "처리 중"}</StatusTag>
              {t.attachments?.map(file => <AppButton key={file.id} outlined disabled={a.busy} onClick={() => void a.run(() => downloadAttachment(role,t.id,file))}>첨부 {file.id} 내려받기</AppButton>)}
              <FileInput label={`문의 ${t.id} 첨부 추가`} id={`support-${t.id}`} multiple accept="image/jpeg,image/png,image/webp,application/pdf" disabled={a.busy || (t.attachments?.length ?? 0) >= 5} onChange={e => { const selected = Array.from(e.target.files ?? []); void a.run(async () => { validateAttachments(selected, t.attachments?.length); try { for(const file of selected) await uploadAttachment(role,t.id,file); } finally { void tickets.refresh(); } }); e.target.value = ""; }} />
            </div>
          </AppCard>
        ))}
      </Section>
    </>
  );
}
