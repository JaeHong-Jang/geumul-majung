import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import postcss from 'postcss';

const sources = import.meta.glob<string>('../**/*.{ts,tsx,js,jsx,css,json}', {
  query: '?raw', import: 'default', eager: true,
});
const middleDot = /[·･・‧]/u;
const conversational = /(?:십시오|세요|해요|예요|에요|어요|아요|네요|줘요|나요|할게요|봐요|입니다|합니다|습니다|됩니다|니다|까요|주세요|습니까)(?=$|[^가-힣])/u;

// 예외 없음. 서버 응답 비교가 추가되면 문구와 위치, 보존 사유를 명시할 것.
function violations(file: string, source: string): string[] {
  const found: string[] = [];
  const check = (text: string, line: number) => {
    if (middleDot.test(text) || conversational.test(text)) found.push(`${file}:${line}: ${text.trim()}`);
  };
  if (file.endsWith('.css')) {
    postcss.parse(source).walkDecls(declaration => {
      check(declaration.value, declaration.source?.start?.line ?? 1);
    });
  } else {
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) {
        check(node.text, tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1);
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  return found;
}

describe('화면 문구 규칙', () => {
  it('소스 문자열과 CSS에 중간점이나 구어체 끝맺음이 없음', () => {
    const files = Object.entries(sources).filter(([file]) => !/(?:\.(?:test|spec)\.|\/(?:test|__tests__)\/)/.test(file));
    expect(files.length).toBeGreaterThan(100);
    expect(files.flatMap(([file, source]) => violations(file, source))).toEqual([]);
  });

  it('JSX, 속성, 템플릿, 구분자, CSS 문구를 검사하고 주석과 정규식은 제외', () => {
    expect(violations('sample.tsx', '// 설명입니다.\nconst pattern = /[·]/; const view = <p title="선택하세요">결과입니다.</p>;')).toHaveLength(2);
    expect(violations('sample.ts', 'const text = `결과 · ${value}입니다.`; const joined = values.join("・");')).toHaveLength(3);
    expect(violations('sample.css', '/* 설명입니다. */ .x::after {content: "･";}')).toHaveLength(1);
    expect(violations('sample.css', '.x {color: red /* 설명입니다. */;} .x::after {content: "/* 안내입니다. */";}')).toHaveLength(1);
    expect(violations('sample.ts', 'const text = "입력 필요";')).toEqual([]);
  });
});
