# Armature 2D public plugin submission

Status: preparation only, not submitted or published.

## Listing draft

Name: Armature 2D
Publisher: Viral Ventures LLC (identity must be verified in the publishing organization)
Category: Productivity
Short description: Rig, animate and render 2D skeletons with Armature.
Long description: Create and edit skeletal rigs through Armature's command and undo system. Author bones, slots, attachments, animation and constraints; inspect the document, render PNG previews, and validate and save skeleton JSON. The current engine operates in independent headless sessions. It does not control a running editor window or persist a complete effects/slot editor project.
Logo: plugins/armature/assets/icon.png
Source: https://github.com/jwillz7667/armature-2d

Starter prompts:
- Create a two-bone puppet, render a preview, and save the skeleton.
- Open my skeleton, adjust its root position, and verify undo and redo.
- Validate this skeleton and explain any errors before saving.

## Review scenarios

Use an isolated project folder. Positive scenarios use the same small texture and
rig created by tools/smoke-mcp-cli.mjs. Reviewers need that fixture or equivalent
review-account data once a hosted service exists. These are review specifications;
they are not a claim that the hosted plugin has been tested.

| Case | Prompt/scenario | Expected behavior and result |
|---|---|---|
| P1 | Create a skeleton with a root and child bone | document.new and bone.create return valid IDs; export contains the hierarchy |
| P2 | Move the root, undo it, then redo it | Original export restored by undo; edited export restored by redo |
| P3 | Render the textured skeleton twice with identical settings | Two identical PNG payloads, requested dimensions, placeholders false |
| P4 | Save my skeleton and reopen it | document.save succeeds within the project root; reopened export matches saved data |
| P5 | Validate the completed skeleton | document.validate returns ok true with no errors |
| N1 | Save the skeleton at ../outside.json | PATH_FORBIDDEN; no write outside the configured project root |
| N2 | Launch without selecting a project directory | Launcher fails with an actionable diagnostic and no protocol output |
| N3 | Control the editor window or claim effects are saved by document.save | Skill explains the limitation; no fabricated action or persistence claim |

## Blocking requirements

1. Public remote MCP: the existing distribution uses local stdio. Standard With MCP
   submissions require a stable public HTTPS endpoint. Build and verify authenticated,
   tenant-isolated sessions, persistent project storage, resource limits, and accurate
   annotations on all 208 tools before exposing that endpoint. Never serve all users
   from a shared unrestricted project directory. Alternatively obtain OpenAI approval
   for local MCP support; no such approval has been obtained.
2. Publisher access: sign into the publishing OpenAI organization, confirm Apps
   Management write access and a verified developer/business identity. The browser
   reached sign-in; organization identity and permissions have not been checked.
3. Public product website, support, privacy and terms URLs must match the publisher.
   Do not invent these URLs or claim a draft policy is approved. Domain verification
   requires the exact challenge issued by the portal.
4. Supply working reviewer credentials if authentication is used and test the actual
   remote workflows. The local cross-platform tests do not substitute for these checks.
5. Select supported availability and confirm the portal's attestations based on facts.
   OpenAI review and subsequent publisher release are required for public listing.

A local marketplace entry is not publication in the public store. Do not submit an
empty MCP configuration or reclassify this dependency as a working skills-only service.

Sources checked: [submission requirements](https://developers.openai.com/plugins/deploy/submission)
and [portable packaging](https://developers.openai.com/plugins/build/plugins).
