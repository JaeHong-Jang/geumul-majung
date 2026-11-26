// 판매 등록(07) → 내용 확인(08) 사이에 들고 가는 값. 화면이 바뀌어도 새로고침 전까지 유지.
let draft = null;
export const getDraft = () => draft;
export const setDraft = (d) => {
  draft = d;
};
export const clearDraft = () => {
  draft = null;
};

