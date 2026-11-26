// 마이크 녹음 → 서버 음성 인식용 본문 { content_type, audio_base64 }. 음성은 서버의 로컬 Whisper만 받는다.
export const MAX_SECONDS = 30;
const SERVER_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/mpeg'];
const RECORD_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];

export interface AudioBody { content_type: string; audio_base64: string }
export interface Recording { stop: () => Promise<Blob>; cancel: () => void }

export const canRecord = () =>
  typeof window !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof window.MediaRecorder === 'function';

// 말이 끝났는지 보는 기준: 소리 크기(RMS)가 SPEECH 넘은 뒤 QUIET 아래로 QUIET_MS 이어지면 끝
const SPEECH = 0.04;
const QUIET = 0.02;
const QUIET_MS = 1500;

// 말이 끝나면 onSilence를 한 번 부른다. 소리 분석을 못 쓰는 브라우저면 아무것도 하지 않는다(누르면 끝은 그대로).
function watchSilence(stream: MediaStream, onSilence?: () => void): () => void {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!onSilence || !Ctx) return () => {};
  const ctx = new Ctx();
  const node = ctx.createAnalyser();
  try {
    ctx.resume?.().catch(() => {});
    node.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(node);
  } catch {
    ctx.close?.().catch(() => {});
    return () => {};
  }
  const buf = new Uint8Array(node.fftSize);
  let spoke = false;
  let quietSince = 0;
  const t = setInterval(() => {
    node.getByteTimeDomainData(buf);
    const rms = Math.sqrt(buf.reduce((s, v) => s + ((v - 128) / 128) ** 2, 0) / buf.length);
    if (rms > SPEECH) {
      spoke = true;
      quietSince = 0;
    } else if (spoke && rms < QUIET) {
      quietSince ||= Date.now();
      if (Date.now() - quietSince >= QUIET_MS) {
        clearInterval(t);
        onSilence();
      }
    }
  }, 100);
  return () => {
    clearInterval(t);
    ctx.close?.().catch(() => {});
  };
}

/** 녹음을 시작하고 { stop(): Promise<Blob>, cancel() }를 돌려준다. 마이크 권한이 없으면 오류. onSilence: 말이 끝나면 부름. */
export async function startRecording({ onSilence }: { onSilence?: () => void } = {}): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const type = RECORD_TYPES.find((t) => window.MediaRecorder.isTypeSupported?.(t));
  const rec = new window.MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.start();
  const unwatch = watchSilence(stream, onSilence);
  const release = () => {
    unwatch();
    stream.getTracks().forEach((t) => t.stop());
  };
  return {
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = () => {
          release();
          resolve(new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' }));
        };
        rec.stop();
      }),
    cancel: () => {
      rec.onstop = release;
      if (rec.state !== 'inactive') rec.stop();
      else release();
    },
  };
}

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('녹음 읽기 실패'));
    r.readAsDataURL(blob);
  });

export async function audioBody(blob: Blob): Promise<AudioBody> {
  const base = (blob.type || 'audio/webm').split(';')[0] ?? 'audio/webm';
  return { content_type: SERVER_TYPES.includes(base) ? base : 'audio/webm', audio_base64: await toBase64(blob) };
}

export function micErrorText(e: unknown) {
  const name = (e as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return '마이크 사용 허용 필요';
  if (name === 'NotFoundError') return '연결된 마이크 없음';
  return '녹음 시작 실패';
}
