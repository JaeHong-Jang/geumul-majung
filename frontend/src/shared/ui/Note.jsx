/** 서버가 준 오류(detail)나 처리 결과를 화면에 그대로 보여 주는 줄 */
export function ErrorNote({ error }) {
  if (!error) return null;
  return (
    <p className="error-note" role="alert">
      {typeof error === 'string' ? error : error.message}
    </p>
  );
}

export function OkNote({ children }) {
  if (!children) return null;
  return <p className="ok-note">{children}</p>;
}
