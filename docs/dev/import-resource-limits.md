# Import and playback resource limits

Layered PSD/ORA import and sprite-atlas packing run in worker threads. Each
operation has a 60-second deadline and a 768 MiB V8 old-generation limit. These
are not process RSS limits: decoded pixel buffers are bounded separately.
Only one operation per import workflow can run at a time. The renderer still
receives an atomic validated result and applies it through document commands.

| Boundary | Limit |
| --- | --- |
| Individual source image or layered file | 256 MiB, regular file |
| Atlas image request / source directory | 4096 images, 512 MiB aggregate encoded data |
| Atlas or ORA decoded artwork | 64 million pixels across all layers/images |
| ORA ZIP | 4096 entries, 64 MiB per expanded entry, 256 MiB aggregate expanded data |
| ORA stack XML | 4 MiB, 128 nesting levels, 16384 parsing iterations |
| PSD bitmap decoding | 256 MiB decoder budget, plus image dimension/pixel checks |
| Animation state | 64 tracks, 4096 loop crossings per entry per update, 65536 potential event records per update |

ORA counts repeated layer references against the decoded-pixel budget. Oversized
archives fail before advertised entry allocation. Invalid PNGs retain actionable
per-layer diagnostics. PSD linked-file payloads and thumbnails are not decoded.
CMYK PSD files are explicitly rejected because that decoder path bypasses the
bitmap budget; convert a copy to RGB before importing.

Atlas file reads use a held file handle, reject non-regular/oversized sources,
and detect growth or truncation without unbounded `readFile` allocation. Directory
listings exclude symbolic links; direct final-component links are also rejected
where the platform supports `O_NOFOLLOW`. This is not a promise of protection
against every ancestor-directory replacement on every operating system.

When a concurrent read fails, the pool stops scheduling new work and drains
in-flight reads before rejecting. Temporary output is removed only after the
atlas worker terminates. Error codes distinguish resource limits, changed source
files, and invalid PNGs. Successful output bytes live in the project asset model;
unused copies are not retained in the app's atlas directory.

Layered atlas pages use deterministic power-of-two sizes from 64 through 4096,
based on trimmed dimensions and area. A tiny two-sprite import now uses a 64-square
RGBA page (16 KiB) instead of a 4096-square page (64 MiB), a 4096-fold reduction
in page-buffer allocation. Packing order and repeated-import bytes remain deterministic.

Animation updates reject non-finite arguments and excessive work before clearing
events or changing any track clock. Large time jumps should be split into smaller
steps. A queued animation starts at the next loop boundary plus its delay, even
when queued after several completed loops. Only events in each active time segment
fire across a queue transition. These are runtime API corrections, not persisted
format changes.

Built-worker smoke tests cover original image import, oversized files, corrupt
PNGs, and clean termination. Interactive progress/cancellation UX, native GPU
pixels, and recovery retention are separate acceptance items.
