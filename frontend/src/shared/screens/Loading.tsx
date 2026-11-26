import { useEffect } from "react";
import TruckLoading from "./TruckLoading";
import "./loading.css";
// The overlay never waits for network requests; the destination loads underneath.
export function LoadingScreen({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let timer = window.setTimeout(onComplete, media?.matches ? 100 : 4300);
    const changed = () => {
      if (media?.matches) {
        window.clearTimeout(timer);
        timer = window.setTimeout(onComplete, 100);
      }
    };
    media?.addEventListener("change", changed);
    return () => {
      window.clearTimeout(timer);
      media?.removeEventListener("change", changed);
    };
  }, [onComplete]);
  return <div className="splash" role="status" aria-label="잔재미 앱을 불러오는 중">
    <div aria-hidden="true"><TruckLoading done eyebrow="잔재미" title="산업 부산물 거래" subtitle="불러오는 중" /></div>
  </div>;
}
