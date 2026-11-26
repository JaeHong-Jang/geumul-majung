import { geocodeBody, loadPostcode, type PostcodeData } from './geocode';
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, useAction, useResource } from '../api/client';
import { AppButton, Feedback, Field } from '../ui';
import type { Role } from '../../types';
export interface LocationValue { address: string; region: string; lat?: number; lon?: number }
export function AddressInput({ appRole, value, onChange, onBusyChange }: { appRole: Role; value: LocationValue; onChange: (value: LocationValue) => void; onBusyChange?: (busy: boolean) => void }) {
  const regions = useResource<{ region?: string; name?: string; lat: number; lon: number }[]>(appRole, '/regions');
  const a = useAction();
  const requestId = useRef(0);
  const selectedAddress = useRef<{address:string;data:PostcodeData} | null>(null);
  useEffect(() => { onBusyChange?.(a.busy); }, [a.busy, onBusyChange]);
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const latest = useRef({ value, onChange });
  useEffect(() => { latest.current = { value, onChange }; });
  useEffect(() => {
    if (value.lat == null || value.lon == null) { map.current?.remove(); map.current = null; marker.current = null; return; }
    if (!node.current) return;
    if (!map.current) {
      map.current = L.map(node.current).setView([value.lat, value.lon], 14);
      map.current.attributionControl.setPrefix(false);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map.current);
      marker.current = L.marker([value.lat, value.lon], { draggable: true, icon: L.divIcon({ html: '●', className: 'address-pin', iconSize: [24,24] }) }).addTo(map.current);
      marker.current.on('dragend', () => { const point = marker.current!.getLatLng(); latest.current.onChange({ ...latest.current.value, lat: point.lat, lon: point.lng }); });
    } else { marker.current?.setLatLng([value.lat, value.lon]); map.current.setView([value.lat, value.lon]); }
  }, [value.lat, value.lon]);
  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);
  const locate = (address: string, data?: PostcodeData) => {
    const id = ++requestId.current;
    if (data) selectedAddress.current = {address, data};
    const codes = data ?? (selectedAddress.current?.address === address ? selectedAddress.current.data : undefined);
    onChange({ address, region: '' });
    void a.run(() => api<{lat: number | null; lon: number | null; region: string | null}>(appRole, '/geocode', 'POST', geocodeBody(address, codes)), point => {
      if (id !== requestId.current) return;
      onChange({ address, region: point.region ?? '', ...(point.lat != null && point.lon != null ? {lat: point.lat, lon: point.lon} : {}) });
    });
  };
  return <div className="stack">
    <Field label="도로명주소" required value={value.address} onChange={e => { requestId.current++; selectedAddress.current = null; onChange({ address: e.target.value, region: '' }); }} />
    <AppButton type="button" outlined onClick={() => void a.run(async () => { await loadPostcode(); new window.daum!.Postcode({ oncomplete: d => locate(d.roadAddress || d.address, d) }).open(); })}>주소 검색</AppButton>
    <AppButton type="button" outlined disabled={!value.address.trim() || a.busy} onClick={() => locate(value.address)}>주소 좌표 확인</AppButton>
    {<label className="field">시, 군 선택<select name="region" required disabled={a.busy} value={value.region} onChange={e => { const r = regions.data?.find(r => (r.region || r.name) === e.target.value); onChange({ ...value, region: e.target.value, ...(r ? {lat: value.lat ?? r.lat, lon: value.lon ?? r.lon} : {}) }); }}><option value="">지역 선택</option>{regions.data?.map(r => <option key={r.region || r.name}>{r.region || r.name}</option>)}</select></label>}
    {value.lat != null && value.lon != null && <><p role="status">좌표 확인 완료: 위도 {value.lat.toFixed(5)}, 경도 {value.lon.toFixed(5)}</p><div className="address-map" ref={node} /><small>핀을 끌어 사업장 위치 보정</small></>}
    <Feedback {...a} /><Feedback error={regions.error} />
  </div>;
}
