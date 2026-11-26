import './forms.css';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { AppButton } from './index';
export function QrCode({ value, label = '물품 QR', save = true }: {
    value: string;
    label?: string;
    save?: boolean;
}) { const [src, setSrc] = useState(''), [error, setError] = useState(''); useEffect(() => { let active = true; QRCode.toDataURL(value, { width: 540, margin: 4, errorCorrectionLevel: 'M' }).then(url => { if (active)
    setSrc(url); }).catch(() => { if (active)
    setError('QR 그림 생성 실패'); }); return () => { active = false; }; }, [value]); return <div className="qr-code">{src && <img src={src} width={180} height={180} alt={`${label} ${value}`}/>}<p>{value}</p>{error && <p role="alert">{error}</p>}{save && <AppButton outlined disabled={!src} onClick={() => { const a = document.createElement('a'); a.href = src; a.download = `${value}.png`; a.click(); }}>이미지 저장</AppButton>}</div>; }
