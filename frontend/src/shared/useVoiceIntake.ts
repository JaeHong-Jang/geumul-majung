import { useEffect, useRef, useState } from 'react';
import { MAX_SECONDS, audioBody, micErrorText, startRecording, type AudioBody, type Recording } from './voice';

export type VoiceState = 'idle' | 'recording' | 'busy';
export interface VoiceIntake { ready: boolean | null; voice: VoiceState; seconds: number; error: string | null; toggle: () => void; cancel: () => void }

/**
 * 말로 입력: 버튼을 누르면 녹음 → 서버 음성 인식과 에이전트 → onResult. 다시 누르기, 말 끝남, 30초 중 먼저 오는 것으로 끝난다.
 * 화면에 들어가자마자 듣지 않는다(해설하며 시연할 때 해설이 칸에 들어가지 않게). status: 음성 인식 사용 가능 여부(서버가 이때 모델을 미리 올림).
 */
export function useVoiceIntake<T>({ status, send, onResult, errorText }: {
  status: () => Promise<{ stt?: boolean } | null>;
  send: (body: AudioBody) => Promise<T>;
  onResult: (result: T) => void;
  errorText: (e: unknown) => string;
}): VoiceIntake {
  const [ready, setReady] = useState<boolean | null>(null);
  const [voice, setVoice] = useState<VoiceState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<Recording | null>(null);
  const alive = useRef(true);
  const latest = useRef({ send, onResult, errorText });
  latest.current = { send, onResult, errorText };

  useEffect(() => {
    let live = true;
    alive.current = true;
    status().then((d) => live && setReady(Boolean(d && d.stt))).catch(() => live && setReady(false));
    return () => {
      live = false;
      alive.current = false;
      recorder.current?.cancel();
      recorder.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (voice !== 'recording') return undefined;
    const t = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [voice]);

  const finish = async () => {
    const rec = recorder.current;
    if (!rec) return;
    recorder.current = null;
    setVoice('busy');
    try {
      const got = await latest.current.send(await audioBody(await rec.stop()));
      if (alive.current) latest.current.onResult(got);
    } catch (e) {
      if (alive.current) setError(latest.current.errorText(e));
    } finally {
      if (alive.current) setVoice('idle');
    }
  };

  const start = async () => {
    setError(null);
    try {
      const rec = await startRecording({ onSilence: () => void finish() });
      if (!alive.current) return rec.cancel();
      recorder.current = rec;
      setSeconds(0);
      setVoice('recording');
    } catch (e) {
      if (alive.current) setError(micErrorText(e));
    }
  };

  useEffect(() => {
    if (voice === 'recording' && seconds >= MAX_SECONDS) void finish();
  }, [seconds]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    ready, voice, seconds, error,
    toggle: () => { if (voice === 'recording') void finish(); else if (voice === 'idle') void start(); },
    cancel: () => { recorder.current?.cancel(); recorder.current = null; setVoice('idle'); },
  };
}
