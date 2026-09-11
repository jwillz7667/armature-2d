import { describe, expect, it } from 'vitest';
import { sameApplicationLocation, isTrustedSender, trustWindow } from './trusted-sender';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';

describe('privileged application frame identity', () => {
  it.each([
    ['file:///app/index.html#editor', 'file:///app/index.html', true],
    ['file://remote/app/index.html', 'file:///app/index.html', false],
    ['file:///other/index.html', 'file:///app/index.html', false],
    ['https://evil.test/', 'http://localhost:5173/', false],
    ['http://localhost:5174/', 'http://localhost:5173/', false],
  ])('checks %s against %s', (actual, expected, allowed) => {
    expect(sameApplicationLocation(actual, expected)).toBe(allowed);
  });
  it('rejects subframes and unknown windows even at the application URL', () => {
    const frame = { url: 'file:///app/index.html' };
    const sender = { id: 81, mainFrame: frame };
    const event = { sender, senderFrame: frame } as IpcMainInvokeEvent;
    expect(isTrustedSender(event)).toBe(false);
    trustWindow(
      { webContents: sender, once: () => undefined } as unknown as BrowserWindow,
      frame.url,
    );
    expect(isTrustedSender(event)).toBe(true);
    expect(isTrustedSender({ ...event, senderFrame: { ...frame } } as IpcMainInvokeEvent)).toBe(
      false,
    );
  });
});
