// 사진 파일 → { content_type, data_base64 } (서버 한도 2MB 이하). 크면 줄여서 JPEG로.
const LIMIT = 1.5 * 1024 * 1024;

const toBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('사진 읽기 실패'));
    r.readAsDataURL(blob);
  });

async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const ratio = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * ratio);
  canvas.height = Math.round(bmp.height * ratio);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
}

export async function photoBody(file) {
  let blob = file;
  let type = file.type;
  if (file.size > LIMIT) {
    blob = await shrink(file);
    type = 'image/jpeg';
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) {
    throw new Error('사진은 jpg, png, webp 파일만 업로드 가능');
  }
  return { content_type: type, data_base64: await toBase64(blob) };
}
