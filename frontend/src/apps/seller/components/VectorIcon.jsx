import { asset } from '../lib/asset';

/**
 * 피그마 아이콘을 원본 그대로 배치합니다.
 * 피그마는 아이콘 틀(size) 안에 벡터 그룹을 inset 비율로 두고,
 * 선 두께만큼 바깥으로 넘치는 SVG(bleed)를 내보냅니다. 그 구조를 그대로 따릅니다.
 *
 * @param src   public/assets/figma 안의 파일 이름 (예: '289a6.svg')
 * @param size  아이콘 틀 크기(px). 가로세로가 다르면 width/height
 * @param inset 벡터 그룹 위치 (CSS inset, 예: '20.83% 37.5% 20.83% 33.33%')
 * @param bleed SVG가 그룹 밖으로 넘치는 정도 (CSS inset, 예: '-6.43% -12.86%')
 */
export default function VectorIcon({
  src,
  size = 24,
  width,
  height,
  inset = '0',
  bleed = '0',
  className = '',
  style,
}) {
  return (
    <span
      className={`vicon ${className}`}
      style={{ width: width ?? size, height: height ?? size, ...style }}
      aria-hidden="true"
    >
      <span className="vicon__group" style={{ inset }}>
        <span className="vicon__bleed" style={{ inset: bleed }}>
          <img src={asset(src)} alt="" />
        </span>
      </span>
    </span>
  );
}
