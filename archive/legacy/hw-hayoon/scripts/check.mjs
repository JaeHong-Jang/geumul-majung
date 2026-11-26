import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

async function scan(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['vendor', 'assets', 'dist', 'node_modules', 'docs'].includes(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await scan(file));
    else if (/\.(m?js)$/.test(entry.name)) files.push(file);
    else if (/\.tsx?$/.test(entry.name)) throw new Error(`JavaScript 전용 프로젝트에 TypeScript 파일이 있습니다: ${file}`);
  }
  return files;
}
const files = await scan('.');
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(1); }
}
console.log(`JavaScript 구문 검사 통과: ${files.length}개 파일. TypeScript·추가 패키지 없음.`);
