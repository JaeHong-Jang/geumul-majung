import type { ReactElement } from 'react';
export const TRUCK_TIMING: { enter: number; leave: number };
export default function TruckLoading(props: {
  done?: boolean;
  onFinish?: () => void;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
}): ReactElement;
