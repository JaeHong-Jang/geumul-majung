import type { CSSProperties } from 'react';
import './agent-steps.css';

export interface AgentStep { id: string; name: string; ok: boolean; used_llm: boolean; lines: string[] }

/**
 * AI 작업 카드: 서버 하네스의 에이전트 단계(steps)를 순서대로 보여 준다.
 * 문장은 서버 게이트를 통과한 것만 온다. 화면은 받은 문장을 그대로 쓴다.
 */
export function AgentSteps({ steps, heard, footer }: { steps: AgentStep[] | null | undefined; heard?: string | undefined; footer?: string | undefined }) {
  if (!steps || steps.length === 0) return null;
  return (
    <section className="agent-steps" aria-label="AI 작업">
      <h2 className="agent-steps__title">
        <img src="/icons/sparkle_16.svg" alt="" />
        AI 작업
        <small>{`에이전트 ${steps.length}단계`}</small>
      </h2>
      {heard && (
        <p className="agent-steps__heard">
          <span>들은 말</span>
          {heard}
        </p>
      )}
      <ol className="agent-steps__list">
        {steps.map((s, i) => (
          <li key={s.id} className={s.ok ? 'is-ok' : 'is-fail'} style={{ '--i': i } as CSSProperties}>
            <span className="agent-steps__no" aria-hidden="true">{s.ok ? '✓' : '!'}</span>
            <div>
              <b>
                {s.name}
                {s.used_llm && <em>AI</em>}
              </b>
              {(s.lines.length ? s.lines : ['채울 값 없음']).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </li>
        ))}
      </ol>
      {footer && <p className="agent-steps__foot">{footer}</p>}
    </section>
  );
}
