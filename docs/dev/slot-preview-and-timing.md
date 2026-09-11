# Slot preview and timing

The composer consumes validated recorded results or deterministic mock results. Neither the
sequencer nor the editor computes wins, awards, or balances. Recorded results remain transient
preview inputs and are revalidated when the authored grid changes.

## Playback contract

- Reel stops precede cascades. Cascades begin after the last column's scheduled stop.
- A cascade highlights wins, waits `explodeMs`, removes winners, moves survivors over `dropMs`,
  and schedules refills in their authored order using `refillStaggerMs`.
- A step counter covers the full cascade interval, including settle and gap. Adjacent step
  intervals share a boundary; they do not overlap.
- Escalation follows the authoritative total and authored thresholds. A matching banner action
  supplies its presentation time. Timeline duration includes counter completion.
- Symbol animation phase time starts at the directive's scheduled time. Rendering a late frame
  must not restart that phase at the frame time.
- The editor effects simulation advances at 60 Hz with a 250 ms foreground-frame catch-up cap.
  Restart and loop construct a fresh seeded simulation. Future sprite triggers stay hidden until due.

These corrections intentionally change three slot conformance fixtures. The fixture lock was
regenerated with the repository's documented integer-only unpinned-runtime override. No native
engine acceptance is implied by TypeScript conformance.

## Asset and authoring contract

The current editor resolves symbols against its project skeleton and effects against project
effects/bundles. Unresolved external references are visible diagnostics. Serializing a project
refreshes internal content hashes without modifying history; external reference hashes are preserved.
Configuration edits, reference edits, and graph edits validate before mutation and are undoable.

The preview fits project symbols to authored cells, animates survivors between cell centers,
and renders feature cinematics and seeded effects. Tests exercise blank-project authoring,
save/reopen with pixels, recorded-input rejection, and frame-partition-independent effects.
Installed Electron rendering and native engines remain separate acceptance gates.
