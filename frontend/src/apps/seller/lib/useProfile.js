import useResource from './useResource';

/** 내 회사 정보. /v1/me/profile 이 서버에 아직 없으면 /v1/seller/home 의 company 로 대신합니다. */
export default function useProfile(options = { poll: false }) {
  const profile = useResource('/me/profile', options);
  const fallback = useResource(profile.error ? '/seller/home' : null, options);
  if (profile.data) return { profile: profile.data, loading: false, error: null, full: true };
  if (profile.error && fallback.data) return { profile: fallback.data.company, loading: false, error: null, full: false };
  return {
    profile: null,
    loading: profile.loading || (!!profile.error && fallback.loading),
    error: fallback.error || null,
    full: false,
  };
}
