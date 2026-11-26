import { session } from '../../../shared/api/client';
// 서버가 내리기 때 해제하는 연결만 보관합니다. 계정별로 분리하며 추정해서 연결하지 않습니다.
function key() { return `seller:withdrawn:${session('seller')?.company.id || 'guest'}`; }
export function withdrawnBags(id) {
  try { return JSON.parse(localStorage.getItem(key()) || '{}')[id] || []; } catch { return []; }
}
export function rememberWithdrawal(listing, bags) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(key()) || '{}'); } catch { /* 손상된 캐시를 다시 만듭니다. */ }
  localStorage.setItem(key(), JSON.stringify({...saved, [listing.id]: bags}));
}
export function listingBags(listing, bags) {
  if (listing.status === 'withdrawn') return (listing.former_bags || []).filter(b => b.available).map(b => ({...b, total_kg: b.weight_kg}));
  const embedded = listing.bags?.length ? listing.bags : listing.bag ? [listing.bag] : [];
  if (embedded.length) return embedded.map(b => {
    const saved = withdrawnBags(listing.id).find(row => row.id === b.id);
    const current = bags.find(row => row.id === b.id);
    return {...saved, ...current, ...b, target_material: b.target_material || current?.target_material || saved?.target_material || listing.target_material};
  });
  const ids = listing.bag_ids?.length ? listing.bag_ids : withdrawnBags(listing.id).map(b => b.id);
  return ids.map(id => bags.find(b => b.id === id) || withdrawnBags(listing.id).find(b => b.id === id)).filter(Boolean);
}
