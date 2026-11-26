// 피그마에서 내려받은 아이콘·이미지는 public/assets/figma 에 해시 이름 그대로 들어 있습니다.
// BASE_URL을 붙여서 하위 경로 배포(GitHub Pages 등)에서도 동작하게 합니다.
export const asset = (fileName) => `${import.meta.env.BASE_URL}assets/figma/${fileName}`;
