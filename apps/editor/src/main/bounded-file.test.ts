import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readBoundedFile } from './bounded-file';

const file = vi.hoisted(() => ({ stat: vi.fn(), read: vi.fn(), close: vi.fn() }));
const open = vi.hoisted(() => vi.fn());
vi.mock('node:fs/promises', () => ({ open }));
beforeEach(() => {
  vi.resetAllMocks();
  open.mockResolvedValue(file);
  file.stat.mockResolvedValue({ isFile: () => true, size: 3 });
  file.close.mockResolvedValue(undefined);
});

describe('bounded project reads', () => {
  it('handles short reads without requesting more than the checked file size', async () => {
    file.read.mockImplementation(
      async (bytes: Uint8Array, offset: number, length: number, position: number) => {
        if (position === 3) return { bytesRead: 0 };
        expect(length).toBe(3 - position);
        bytes[offset] = position + 1;
        return { bytesRead: 1 };
      },
    );
    expect(await readBoundedFile('/project', 3)).toEqual(new Uint8Array([1, 2, 3]));
    expect(file.close).toHaveBeenCalledOnce();
  });
  it('rejects growth rather than allocating beyond the initial checked size', async () => {
    file.read.mockResolvedValueOnce({ bytesRead: 3 }).mockResolvedValueOnce({ bytesRead: 1 });
    await expect(readBoundedFile('/project', 3)).rejects.toThrow('changed');
    expect(file.read.mock.calls.map((call) => (call[0] as Uint8Array).length)).toEqual([3, 1]);
    expect(file.close).toHaveBeenCalledOnce();
  });
  it('rejects truncation and closes the held descriptor', async () => {
    file.read.mockResolvedValue({ bytesRead: 0 });
    await expect(readBoundedFile('/project', 3)).rejects.toThrow('changed');
    expect(file.close).toHaveBeenCalledOnce();
  });
  it.each([
    { isFile: () => true, size: 4 },
    { isFile: () => false, size: 0 },
  ])('rejects oversize or nonregular files before reading', async (stat) => {
    file.stat.mockResolvedValue(stat);
    await expect(readBoundedFile('/project', 3)).rejects.toThrow('regular file or exceeds');
    expect(file.read).not.toHaveBeenCalled();
    expect(file.close).toHaveBeenCalledOnce();
  });
  it('does not open a file for an invalid budget', async () => {
    await expect(readBoundedFile('/project', NaN)).rejects.toThrow('limit');
    expect(open).not.toHaveBeenCalled();
  });
});
