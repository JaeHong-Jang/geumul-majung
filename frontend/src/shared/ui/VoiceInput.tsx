import { canRecord } from '../voice';
import type { VoiceIntake } from '../useVoiceIntake';
import './voice-input.css';

const MicIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
);

/** 말로 입력 버튼. 음성 인식을 쓸 수 없거나 마이크가 없으면 숨긴다. example: 무엇을 말하면 되는지 보여 줄 예. */
export function VoiceInput({ v, example }: { v: VoiceIntake; example: string }) {
  if (!canRecord() || v.ready === false) return null;
  return (
    <section className="voice-input" aria-label="말로 입력">
      <button type="button" className={`voice-input__btn is-${v.voice}`} onClick={v.toggle}
        disabled={v.voice === 'busy' || v.ready === null} aria-pressed={v.voice === 'recording'}>
        <MicIcon />
        {v.voice === 'recording' ? `듣는 중 ${v.seconds}초, 누르면 바로 정리`
          : v.voice === 'busy' ? 'AI 에이전트 정리 중…'
            : v.ready === null ? '음성 인식 준비 중' : '말로 입력'}
      </button>
      <p className="voice-input__hint">{v.voice === 'recording' ? '말이 끝나면 AI 에이전트가 칸 자동 입력' : example}</p>
      {v.voice === 'recording' && (
        <>
          <p className="voice-input__hint">{example}</p>
          <button type="button" className="voice-input__skip" onClick={v.cancel}>직접 입력</button>
        </>
      )}
      {v.error && <p className="voice-input__error" role="alert">{v.error}</p>}
    </section>
  );
}
