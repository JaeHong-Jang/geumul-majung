import { ScreenHeading } from "../../../shared/ui/Navigation";
import { useNav } from '../lib/nav';
import { Ic } from '../../../shared/ui';

export default function ScreenHeader({ title, back = false, onBack, right = null }) {
  const nav = useNav();
  return <ScreenHeading title={title} back={back ? (onBack ?? nav.back) : undefined} right={right} icon={<Ic name="back" size={24} />} />;
}
