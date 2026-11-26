import { useCallback, useEffect, useRef, useState } from "react";
import type { Company, Role } from "../../types";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function session(
  role: Role,
): { access_token: string; company: Company } | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(`janjaemi:${role}`) ?? "null");
    return typeof s?.access_token === "string" && s?.company?.role ? s : null;
  } catch {
    return null;
  }
}
export async function api<T>(
  role: Role,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const token = session(role)?.access_token;
  let response: Response;
  try {
    response = await fetch(`/v1${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error("서버 연결 실패, 다시 시도 필요");
  }
  if (!response.ok) {
    let detail: unknown;
    try {
      detail = (await response.json()).detail;
    } catch {
      detail = null;
    }
    if (response.status === 401 && path !== "/auth/login") {
      sessionStorage.setItem(`janjaemi:expired:${role}`, "1");
      sessionStorage.removeItem(`janjaemi:${role}`);
      window.dispatchEvent(
        new CustomEvent("session-expired", { detail: role }),
      );
    }
    const messages: Record<number, string> = {
      400: "입력값 확인 필요",
      401: "로그인 필요",
      403: "이 작업을 할 권한 없음",
      404: "항목을 찾을 수 없음",
      409: "상태 변경, 다시 확인 필요",
      429: "로그인 시도 횟수 초과, 잠시 후 다시 시도 필요",
    };
    throw new ApiError(
      response.status,
      Array.isArray(detail)
        ? "입력값 확인 필요"
        : typeof detail === "string"
          ? detail
          : (messages[response.status] ?? "요청 처리 실패"),
    );
  }
  if (response.status === 204) return undefined as T;
  const value = (await response.json()) as T;
  if (method !== "GET" && path !== "/auth/login" && path !== "/orders/preview" && !path.endsWith("/release"))
    window.dispatchEvent(new CustomEvent("janjaemi-data", { detail: role }));
  return value;
}
export function useResource<T>(role: Role, path: string | null, poll = false) {
  const [state, setState] = useState<{
    path: string | null;
    data?: T;
    error?: string;
  }>({ path });
  const sequence = useRef({ value: 0 }).current;
  const refresh = useCallback(async () => {
    if (!path) return;
    const n = ++sequence.value;
    try {
      const data = await api<T>(role, path);
      if (n === sequence.value) setState({ path, data });
    } catch (e) {
      if (n === sequence.value)
        setState(() => ({
          path,
          error: (e as Error).message,
        }));
    }
  }, [role, path, sequence]);
  useEffect(() => {
    void refresh();
    const changed = (e: Event) => {
      if ((e as CustomEvent).detail === role) void refresh();
    };
    window.addEventListener("janjaemi-data", changed);
    const timer = poll
      ? window.setInterval(() => {
          if (document.visibilityState !== "hidden") void refresh();
        }, 5000)
      : undefined;
    return () => {
      window.removeEventListener("janjaemi-data", changed);
      sequence.value++;
      if (timer) clearInterval(timer);
    };
  }, [refresh, poll, sequence, role]);
  return {
    data: state.path === path ? state.data : undefined,
    error: state.path === path ? state.error : undefined,
    loading: !!path && (state.path !== path || (!state.data && !state.error)),
    refresh,
  };
}
export function useAction() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const run = async <T>(job: () => Promise<T>, done?: (value: T) => void) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const value = await job();
      done?.(value);
      return value;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { busy, error, message, setMessage, run };
}
