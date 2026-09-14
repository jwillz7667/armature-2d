# Armature 2D for AI agents

Run the Armature headless engine inside an environment that supports Node and local
stdio MCP. The bundle includes the server and its dependencies, 208 discoverable
tools, schemas, reference documentation, a portable Codex manifest, an authoring skill,
and Codex/Claude Code compatibility manifests.
No Electron installation, npm download at startup, API key, or hosted service is required.
The proprietary repository license also applies to this distribution.

## Get the bundle

Use Node 24.20.0 or newer. From a checkout of the desired commit:

```sh
pnpm install --frozen-lockfile
pnpm exec turbo run build --filter=@marionette/mcp-server...
node tools/package-ai-plugin.mjs
node tools/smoke-ai-plugin.mjs
```

The output is `dist/armature-mcp-<version>.tar.gz` with a SHA-256 sidecar.
CI uploads both under the `armature-mcp` build artifact. Download from the successful
run for the desired commit, not an unrelated run. Future releases also attach the bundle;
existing releases do not gain it retroactively. Do not assume an unpublished candidate is available.
For a published release containing it, GitHub CLI can fetch it:

```sh
gh release download <tag> --repo jwillz7667/armature-2d --pattern 'armature-mcp-*'
```

Verify the archive against its `.sha256` sidecar before extraction, using
`sha256sum -c <archive>.sha256` on Linux or `shasum -a 256 -c <archive>.sha256`
on macOS. On Windows compare `Get-FileHash <archive> -Algorithm SHA256` to the sidecar.
Extract with `tar -xzf <archive>`. Keep the extracted `armature` directory in its final location.

## Configure one project folder

Create the project directory first. Run:

```sh
node /absolute/path/armature/scripts/configure.mjs /absolute/path/my-project
```

On Windows use absolute Windows paths and quote paths containing spaces. Setup writes
`mcp.json`, `.mcp.json` and `codex-config.toml` inside the bundle only. It does not edit your client
configuration or grant permissions. Reconfigure after moving the bundle or changing projects.
Do not redistribute a configured bundle containing your machine paths.

- **Codex:** merge the generated `codex-config.toml` section into your Codex MCP
  configuration, preserving other servers and approval settings. Restart/reconnect the client.
  The `.codex-plugin` manifest is also included for local plugin loaders; configure before loading.
- **Claude Code:** run `claude --plugin-dir /absolute/path/armature` after setup, or merge
  the generated server entry into your existing MCP configuration. Do not register both ways.
- **Other stdio MCP clients:** use the generated `.mcp.json` server command and arguments.

The launcher accepts an absolute project root argument or `ARMATURE_PROJECT_ROOT`.
It rejects a missing, relative, nonexistent, or non-directory root. Runtime file operations
remain confined by the existing server file store. This is a tool filesystem boundary,
not an OS sandbox for the entire AI host. Client approval settings remain in effect.
No public marketplace listing or hosted/mobile connector is included.

## Agent workflow

1. Discover tool schemas with `tools/list`; consult `mcp-tools.json` or `tool-reference.md`.
2. Create a document or open a skeleton JSON inside the selected project folder.
3. Use bone, slot, mesh, animation, constraint, effects, and composition tools as needed.
   Every document mutation uses the shared command/history system. Use undo/redo for revisions.
4. Validate, then call `render_frame` for a PNG preview. Decode `pngBase64` to inspect it.
   Placeholder textures are explicitly reported; a successful render is not a visual quality review.
5. Save the skeleton, reopen it, and compare the exported data before declaring persistence complete.
   Save before ending the MCP process; open sessions live in memory.

Example prompt: "Create a skeleton with a root and two child bones, add a short idle
animation, render a preview, validate it, and save it as puppet.json."

## Coverage and current limits

| Capability | Current behavior |
|---|---|
| Rigging, animation, constraints, skins, meshes | Shared command tools and undo/redo |
| Skeleton persistence | Validated skeleton JSON, not the full editor project container |
| Effects and slot composition | Authoring tools exist; `document.save` does not persist these libraries |
| Preview | CPU PNG frames, including supported effect overlays; not GPU/editor pixel parity |
| Live editor | Separate sessions; no control of the currently open editor document/window |
| Media export | This bundle does not expose every editor video/sequence export workflow |
| Remote connector | Railway staging endpoint deployed and smoke-tested; user OAuth and public store review remain separate launch gates |

The isolated smoke checks catalog discovery, create/edit, undo/redo, validation, deterministic
PNG output, skeleton save/reopen, and traversal denial. Real Codex/Claude client installation,
GPU rendering, and complete effects/slot project round trips are separate acceptance checks.

Configuration references: [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins)
and [Claude Code plugins](https://code.claude.com/docs/en/plugins-reference).

Public store submission is tracked in `docs/dev/plugin-store/submission.md` in the repository.
The current local MCP package has not been submitted to or published in the public store.
