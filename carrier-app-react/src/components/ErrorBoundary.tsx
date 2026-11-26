import { Component, type ReactNode } from "react";

interface State { message: string | null }

/** 데이터를 못 읽었거나 화면에 오류가 나도 빈 화면 대신 이유를 보여 준다 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { message: null };
  static getDerivedStateFromError(e: unknown): State {
    return { message: e instanceof Error ? e.message : "알 수 없는 오류가 났습니다." };
  }
  override render() {
    if (this.state.message === null) return this.props.children;
    return (
      <main className="hub" role="alert">
        <div className="panel">
          <h2>앱을 열지 못했습니다</h2>
          <p style={{ margin: 0 }}>{this.state.message}</p>
          <button className="lab-btn" type="button" onClick={() => location.reload()}>다시 불러오기</button>
        </div>
      </main>
    );
  }
}
