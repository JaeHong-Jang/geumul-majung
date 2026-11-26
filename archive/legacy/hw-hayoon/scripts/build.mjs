import { cp, mkdir, rm, stat } from 'node:fs/promises';
const files = ['index.html', 'app.js', 'styles.css', 'reference.css', 'readability.css', 'src', 'assets', 'vendor', 'THIRD_PARTY_NOTICES.md'];
for (const file of files) await stat(file);
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const file of files) await cp(file, `dist/${file}`, { recursive: true });
console.log('정적 배포 파일을 dist/에 만들었습니다.');
