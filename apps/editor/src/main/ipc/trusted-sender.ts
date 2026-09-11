import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';

const trusted = new Map<number, string>();
export const approvedClosures = new WeakSet<BrowserWindow>();

export function sameApplicationLocation(actual: string, expected: string): boolean {
  try {
    const a = new URL(actual);
    const b = new URL(expected);
    a.hash = '';
    a.search = '';
    b.hash = '';
    b.search = '';
    return a.href === b.href;
  } catch {
    return false;
  }
}

export function trustWindow(window: BrowserWindow, location: string): void {
  const id = window.webContents.id;
  trusted.set(id, location);
  window.once('closed', () => trusted.delete(id));
}

export function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const location = trusted.get(event.sender.id);
  return (
    location !== undefined &&
    event.senderFrame === event.sender.mainFrame &&
    sameApplicationLocation(event.senderFrame.url, location)
  );
}
