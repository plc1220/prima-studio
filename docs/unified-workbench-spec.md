# Prima Studio Unified Workbench Spec

Date: 2026-07-06  
Status: Draft for product and implementation review  
Scope: A single production workbench for Newsroom, Video Clipping, Shorts Generator, and mixed text/image/video assembly.

## Executive Summary

Prima Studio should move toward one unified workbench instead of three fully separate editor surfaces. The workbench should keep the existing product lanes - Newsroom, Video Clipping, and Shorts Generator - but present them through one consistent production shell:

1. Bring source material and generated outputs into a visible asset library.
2. Compose text, image, audio, and video elements on a central canvas.
3. Select any element and edit its properties in a contextual inspector.
4. Arrange elements in a bottom **Flow** area that can behave as an outline, storyboard, or timeline depending on the current output.
5. Export the selected result as a package, image, document-like brief, social short, or final video.

The reference OpenCut-style layout is useful because it is immediately understandable to editors: assets on the left, preview in the center, properties on the right, sequence at the bottom. Prima Studio should borrow that spatial model, but simplify the tool density and broaden the timeline concept so it is not video-only.

## Core Product Decision

Use **one workbench shell** with mode-aware panels, not three unrelated editors.

The workbench is not a single overloaded video editor. It is a shared assembly surface where each lane contributes different element types:

| Lane | Primary output | Workbench behavior |
| --- | --- | --- |
| Newsroom | Editorial package, script, captions, scene plan | Text-first canvas with markdown blocks, evidence cards, scene rows, and handoff actions. |
| Video Clipping | Metadata, clip plan, final joined video | Video-first canvas with player, clip candidates, time-based Flow mode, and provenance. |
| Shorts Generator | Rendered social short | Mixed-media canvas with script, media plan, captions, voice, stock clips, and render output. |

The top-level user experience should feel like one production desk with different materials, rather than separate forms that happen to share a backend.

## Design Principles

- Lead with production objects, not backend jobs.
- Keep AI output reviewable as elements, plans, and suggestions.
- Use compact editorial UI: dense, calm, precise, and traceable.
- Make provenance visible without turning the main screen into storage management.
- Keep simple modes simple; reveal video-editor controls only when time-based media is selected.
- Treat text, image, audio, video, metadata, and clip plans as first-class elements in the same composition model.

## OpenCut Package Reference

The referenced OpenCut web package suggests a practical implementation pattern for the workbench, but not a full stack migration requirement.

Observed stack choices:

- Vite and TanStack Router/Start for app routing and build/runtime.
- React 19.
- Tailwind CSS 4 with shadcn/Radix/Base UI-style primitives.
- `react-resizable-panels` for adjustable editor regions.
- `lucide-react` and Hugeicons for dense icon-first editing controls.
- `cmdk`, `sonner`, `vaul`, `react-hook-form`, and `zod` for command palette, toasts/drawers, forms, and validation.
- Recharts for dashboard-style visualizations.

Prima Studio currently uses Next.js, React 19, Astryx, and `lucide-react`. The workbench should borrow the interaction architecture from OpenCut while staying compatible with the current Prima stack:

- Use Astryx layout primitives first for app shell, side navigation, panels, controls, and typography.
- Keep `lucide-react` for compact tool icons unless Astryx provides an equivalent.
- Consider adding a resizable-panel dependency only if Astryx does not already cover adjustable workbench regions.
- Do not introduce Tailwind/shadcn/Base UI/Radix as a parallel design system during the first workbench pass.
- Do not migrate from Next.js to Vite/TanStack unless there is a separate platform decision.

The most relevant OpenCut dependency idea for Prima is not the router or styling stack; it is the resizable, icon-dense, multi-panel editor shell.

## Workbench Layout

The workbench has six persistent regions.

```text
+--------------------------------------------------------------+
| Top Bar                                                      |
+-------+----------------------+-------------------------------+
| Left  | Asset / Element      | Main Canvas / Preview         |
| Rail  | Library              |                               |
|       |                      +-------------------------------+
|       |                      | Inspector                     |
+-------+----------------------+-------------------------------+
| Flow Toolbar                                                 |
+--------------------------------------------------------------+
| Flow: outline, storyboard, or timeline                       |
+--------------------------------------------------------------+
```

On desktop, the main region should resemble an editing bay. On smaller screens, the side panels become drawers and the Flow remains reachable through a bottom tab.

## Region Requirements

### 1. Top Bar

Purpose: Global project, run, and export controls.

Required controls:

- Prima Studio mark.
- Workspace or project name.
- Current output type: `Package`, `Image`, `Short`, `Video`, or `Draft`.
- Save state.
- Share or review action.
- Export action.
- Feedback action.
- Theme toggle.

Recommended behavior:

- `Export` should adapt to the selected output.
- The project name should be editable inline.
- Long-running jobs should surface compact status in the top bar, with details available in the inspector or job drawer.

### 2. Left Rail

Purpose: Stable tool navigation across all lanes.

Recommended top-level buttons:

- Assets.
- Text.
- Images.
- Video.
- Audio.
- AI.
- Templates.
- Settings.

The left rail should stay simpler than a full NLE toolbar. Tool-specific actions belong in the asset panel or inspector, not as always-visible icons.

### 3. Asset And Element Library

Purpose: Source material, generated outputs, and reusable elements.

The panel content changes by selected rail button:

| Rail item | Panel content |
| --- | --- |
| Assets | Uploaded files, generated outputs, folders, recent jobs, import/drop zone. |
| Text | Markdown blocks, scripts, captions, hooks, scene descriptions, saved snippets. |
| Images | Uploaded images, generated images, thumbnails, masks, references. |
| Video | Source videos, segments, clips, generated shorts, final videos. |
| Audio | Voiceover, background music, extracted audio, SFX, waveform previews. |
| AI | Prompt box, suggested next actions, clip-plan generation, rewrite tools. |
| Templates | Story formats, platform presets, newsroom package structures. |
| Settings | Workspace settings, output presets, provenance, advanced storage details. |

Asset cards should show:

- Type icon.
- Preview thumbnail when available.
- Name.
- Source or generation status.
- Duration, dimensions, or word count where relevant.
- Quick actions: add to Flow, preview, rename, remove.

### 4. Main Canvas

Purpose: The current composition preview.

Canvas modes:

| Mode | Primary rendering |
| --- | --- |
| Text package | Markdown-rendered editorial package, script, captions, and scene plan. |
| Image composition | Image preview with crop, fit, prompt provenance, and overlays. |
| Video preview | Player with timecode, captions, selected clip boundaries, and safe-area guides. |
| Mixed media | Output preview for social short, carousel, or storyboard package. |

Required behavior:

- Render markdown natively for text elements.
- Render images inline with predictable aspect ratio controls.
- Render video in a stable player surface.
- Show empty state guidance only when no element or output exists.
- Preserve a clear selected element state between the canvas, Flow, and inspector.

Markdown rendering should support at least:

- Headings.
- Paragraphs.
- Ordered and unordered lists.
- Blockquotes.
- Tables.
- Inline code.
- Links.
- Embedded image references.

### 5. Inspector

Purpose: Contextual properties and provenance for selected objects.

Inspector states:

| Selection | Inspector contents |
| --- | --- |
| Nothing selected | Workbench summary, next recommended action, recent jobs. |
| Markdown/text block | Raw markdown editor, rendered preview toggle, tone, language, word count, source package. |
| Image | Crop, fit, alt text, prompt, model, dimensions, source asset, regenerate action. |
| Video clip | In/out points, duration, volume, captions, transcript, source segment, metadata row. |
| Audio | Volume, trim, fade, voice, transcript, source. |
| Scene/group | Scene title, target duration, output role, included elements, notes. |
| AI suggestion | Rationale, source evidence, accept/edit/reject actions. |
| Job/output | Status, events, artifacts, errors, download links, next action. |

The inspector should be the main place for advanced controls. The central canvas and Flow should stay focused on review and assembly.

### 6. Flow

Purpose: Arrange elements into an output.

Use **Flow** as the product name for the bottom sequencing area. Avoid calling it `Timeline` unless the current mode is actually time-based video/audio editing.

Flow modes:

| Flow mode | Best for | Behavior |
| --- | --- | --- |
| Outline | Newsroom packages, scripts, article-like drafts | Ordered text blocks and evidence cards. |
| Storyboard | Shorts, image sequences, social packages | Scene cards with text, image, video, audio, and caption slots. |
| Timeline | Video/audio editing | Time ruler, clips, playhead, snapping, trim, split, tracks. |

Flow element cards should support:

- Markdown preview for text blocks.
- Image thumbnails.
- Video thumbnails.
- Audio waveform or compact audio card.
- Metadata JSON/table preview.
- Clip plan rows.
- AI rationale and confidence.
- Error and processing states.

The same element can appear in multiple ways:

- A Newsroom scene plan row appears as a storyboard card.
- A metadata row appears as a clip candidate card.
- A rendered clip appears as a video timeline item.
- A script paragraph appears as a markdown block in an outline.

## Simplified Tool Model

Only show precision editing tools when they are useful.

Always-visible Flow controls:

- Add element.
- Reorder.
- Duplicate.
- Delete.
- Group or scene.
- Preview selected.
- Export selected output.

Show only for video/audio Timeline mode:

- Split.
- Trim.
- Ripple edit.
- Snapping.
- Track visibility.
- Track mute.
- Timeline zoom.
- Time ruler.
- Playhead.

Show only for text or markdown:

- Edit markdown.
- Rewrite.
- Summarize.
- Translate.
- Convert to captions.
- Convert to scene plan.

Show only for image:

- Crop.
- Fit.
- Replace.
- Regenerate.
- Use as reference.
- Extract palette.

## Element Model

The workbench needs a unified element abstraction above raw assets and jobs.

Recommended fields:

```json
{
  "id": "element_123",
  "workspace_id": "media-prima-newsroom",
  "kind": "markdown | image | video | audio | metadata | clip_plan | scene | group | output",
  "title": "Opening hook",
  "status": "draft | ready | processing | failed | exported",
  "content": {},
  "asset_ids": [],
  "source_job_id": "job_123",
  "source_element_ids": [],
  "flow_position": {
    "scene_id": "scene_1",
    "index": 0,
    "track": "main",
    "start_seconds": 0,
    "duration_seconds": 6
  },
  "rendering": {
    "preview_type": "markdown | thumbnail | player | waveform | table",
    "aspect_ratio": "16:9",
    "safe_area": "reels"
  },
  "provenance": {
    "source_uri": "gs://...",
    "metadata_row_id": "row_12",
    "model": "gemini",
    "prompt_id": "prompt_456"
  }
}
```

The backend can continue storing assets and jobs separately, but the frontend should interact with elements as the workbench-native object.

## Lane Integration

### Newsroom In The Workbench

Newsroom starts in Outline mode.

Primary flow:

`Brief -> Topic slate -> Selected angle -> Markdown package -> Scene plan -> Shorts handoff`

Workbench behavior:

- The brief appears as a markdown element.
- Topic cards appear in the asset/element library and can be added to Flow.
- The selected angle becomes a scene group.
- The script and captions render as markdown blocks.
- `Send to Shorts Generator` converts the scene plan into storyboard elements.

### Video Clipping In The Workbench

Video Clipping starts in Timeline mode when a video asset is selected.

Primary flow:

`Source video -> Segments -> Metadata -> Clip candidates -> Clip plan -> Final video`

Workbench behavior:

- Source videos and segments appear in the Video panel.
- Metadata appears as table-backed elements.
- Metadata rows become clip candidate cards.
- Selected clip candidates become timeline clips.
- AI clip plans render as editable Flow sequences before final render.

### Shorts Generator In The Workbench

Shorts Generator starts in Storyboard mode.

Primary flow:

`Prompt or Newsroom package -> Script -> Search terms -> Media plan -> Voice/captions/BGM -> Rendered short`

Workbench behavior:

- Script blocks render as markdown.
- Search terms and media plan appear as structured elements.
- Stock clips, generated images, and uploaded media appear in storyboard slots.
- Captions and voiceover remain visible as editable elements.
- Rendered MP4 appears as an output element with provenance.

## Workbench States

### Empty Project

Show a compact start surface in the asset panel and canvas:

- Import files.
- Start from brief.
- Generate short.
- Open recent output.

Avoid a marketing-style landing page. The first screen should be a usable workbench.

### Imported Assets, No Flow

The asset panel shows source material. The canvas previews selected assets. The Flow area invites the user to add selected assets or generate a plan.

### Generated Plan

AI-generated plans appear as editable Flow elements, not as final outputs. Each suggested element should show rationale, source evidence, and status.

### Processing

Processing should be visible on the affected element cards and in the top bar. The user should still be able to inspect completed elements while another job runs.

### Completed Output

The output appears as a first-class element:

- Preview.
- Export preset.
- Duration or dimensions.
- Version.
- Source elements.
- Download/share actions.
- Regenerate or duplicate actions.

## Responsive Behavior

Desktop:

- Persistent left rail.
- Library left.
- Canvas center.
- Inspector right.
- Flow bottom.

Tablet:

- Persistent top bar and Flow.
- Library and inspector become side drawers.
- Canvas takes priority.

Mobile:

- Use tabs: Library, Canvas, Inspector, Flow.
- Keep primary actions sticky.
- Flow uses vertical cards rather than a horizontal timeline except for video preview mode.

## Backend And API Implications

The existing asset/job model can remain, but the API should expose enough structure for workbench elements.

Recommended additions:

- `GET /workspaces/{workspace_id}/elements`
- `POST /workspaces/{workspace_id}/elements`
- `PATCH /elements/{element_id}`
- `DELETE /elements/{element_id}`
- `POST /elements/{element_id}/duplicate`
- `POST /flows/{flow_id}/reorder`
- `POST /flows/{flow_id}/render`

Recommended element-backed actions:

- `POST /newsroom/packages/{package_id}/to-elements`
- `POST /video-clipping/metadata/{asset_id}/to-clip-candidates`
- `POST /video-clipping/ai-plan/{asset_id}/to-flow`
- `POST /shorts/media-plan/{asset_id}/to-storyboard`

The API should not require the frontend to infer workbench state only from raw files. Jobs produce assets, assets can become elements, and elements compose outputs.

## Implementation Sequence

1. Define frontend workbench shell and route, likely `/workbench`.
2. Add a lightweight element type in frontend state using existing job and asset data.
3. Render the six-region layout with empty, selected, and processing states.
4. Implement markdown, image, video, audio, and metadata preview cards.
5. Convert current Newsroom outputs into outline elements.
6. Convert current Shorts outputs into storyboard elements.
7. Convert Video Clipping metadata and clips into timeline elements.
8. Add persistence for elements and Flow ordering.
9. Add mode-aware inspector controls.
10. Replace or redirect lane pages into preconfigured workbench modes after parity is reached.

## MVP Scope

The first useful version can be much smaller than a full editor:

- One `/workbench` route.
- Left rail with Assets, Text, Images, Video, AI, Settings.
- Asset panel backed by existing assets and jobs.
- Main canvas that renders markdown, image previews, and video previews.
- Inspector with selected element details.
- Flow in Outline and Storyboard modes.
- Basic Timeline mode for video clip ordering, not frame-accurate editing.
- Export and handoff actions that call existing workflow endpoints.

## Non-Goals For The First Pass

- No frame-accurate video editor replacement.
- No multi-user live collaboration.
- No advanced compositing layers.
- No full NLE shortcut system.
- No destructive editing of source assets.
- No hiding the existing lane workflows until workbench parity is proven.

## Acceptance Criteria

- A user can start from a Newsroom brief, see markdown-rendered package elements, and send selected scenes to Shorts Generator.
- A user can start from uploaded images, arrange them as storyboard elements, and preview them on the canvas.
- A user can start from uploaded or generated videos, arrange clips in Flow, and render or export a final output.
- Selecting any Flow element updates the inspector with relevant controls and provenance.
- The same workbench can render markdown, images, video thumbnails, video playback, and metadata tables.
- Video-specific controls appear only when the selected output or Flow mode needs them.
- Empty states guide users toward production actions, not generic onboarding copy.

## Open Decisions

| Decision | Recommended default |
| --- | --- |
| Workbench route | Add `/workbench`; keep existing lane routes during transition. |
| Bottom area name | Use **Flow** globally; use **Timeline** only as a Flow mode. |
| First default mode | Open the most recent project mode, otherwise show Assets with an empty canvas. |
| Markdown editor | Start with split raw/rendered inspector; consider richer editing later. |
| Persistence timing | Persist element order on every reorder after MVP local state proves useful. |
| Lane pages | Keep as direct routes until the workbench covers their core flows. |

## References

- Current product framing: `README.md`
- Design direction: `DESIGN.md`
- Existing video flow spec: `docs/video-clipping-flow-spec.md`
- Current local UI lanes: `apps/web/components/NewsroomGenerator.tsx`, `apps/web/components/VideoClippingForm.tsx`, `apps/web/components/ShortsForm.tsx`
- Reference layout discussed in chat: OpenCut-style NLE workbench screenshot
