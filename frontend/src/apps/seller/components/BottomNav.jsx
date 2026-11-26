import { BottomTabs } from '../../../shared/ui/shell';
import { useNav } from '../lib/nav';

export default function BottomNav({ active = 'home' }) {
  const nav = useNav();
  return <BottomTabs appRole="seller" className="bottom-nav" label="하단 탐색" active={active} go={({name}) => {
    if (name !== active) nav.go(name);
  }} />;
}
