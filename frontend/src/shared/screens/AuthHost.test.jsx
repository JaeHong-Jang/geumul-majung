import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
it('두 폰 호스트는 같은 출처의 올바른 역할 메시지로 대상 iframe만 다시 연다', () => {
  const html = readFileSync('index.html', 'utf8');
  const host = document.implementation.createHTMLDocument();
  host.documentElement.innerHTML = html;
  const listeners = {};
  const listen = (type, callback) => { listeners[type] = callback; };
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  new Function('document', 'location', 'addEventListener', 'innerHeight', 'innerWidth', script)(host, location, listen, 1000, 1500);
  const frames = [...host.querySelectorAll('iframe')];
  expect(frames.map(frame => frame.dataset.role)).toEqual(['seller', 'buyer']);
  const setters = frames.map(frame => vi.spyOn(frame, 'src', 'set'));
  for (const role of ['seller', 'buyer']) {
    setters.forEach(setter => setter.mockClear());
    listeners.message({ origin: location.origin, data: { type: 'janjaemi:open-app', role } });
    setters.forEach((setter, index) => {
      if (frames[index].dataset.role === role) expect(setter).toHaveBeenCalledWith(`${role}/`);
      else expect(setter).not.toHaveBeenCalled();
    });
  }
  setters.forEach(setter => setter.mockClear());
  for (const event of [
    { origin: 'https://other.example', data: { type: 'janjaemi:open-app', role: 'seller' } },
    { origin: location.origin, data: { type: 'other', role: 'seller' } },
    { origin: location.origin, data: { type: 'janjaemi:open-app', role: 'invalid' } },
    // 없어진 운송기사 역할 메시지는 무시한다
    { origin: location.origin, data: { type: 'janjaemi:open-app', role: 'carrier' } },
    { origin: location.origin, data: null },
  ]) listeners.message(event);
  setters.forEach(setter => expect(setter).not.toHaveBeenCalled());
});
