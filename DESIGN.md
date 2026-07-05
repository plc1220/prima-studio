# Design System - Prima Studio

## Product Context
- **What this is:** Prima Studio is a local-first AI video workflow product for Media Prima teams. It coordinates newsroom ideation, owned-footage clipping, short generation, metadata analysis, rendering, and traceable review packages.
- **Who it's for:** Editorial producers, video editors, social video teams, newsroom leads, and technical operators who need to move from raw media or broad briefs to reviewed, publishable outputs.
- **Space/industry:** Media production, broadcast newsroom operations, AI-assisted video editing, and social publishing.
- **Project type:** Production web app and operational dashboard with editorial review surfaces.

## Aesthetic Direction
- **Direction:** Industrial Editorial.
- **Decoration level:** Intentional.
- **Mood:** The product should feel like a newsroom control room crossed with an editing bay: calm, dense, precise, and editorially confident. It should not feel like a generic SaaS dashboard or a file-storage console.
- **Reference sites:** No external competitive research was performed for this initial pass. The system is based on local product context, the current Prima Studio UI, and the reviewed Streamlit video-clipping workflow.

## Workflow Principles
- Lead with editorial decisions, not storage mechanics.
- Treat AI output as a reviewable plan, never as a black box.
- Keep provenance visible but secondary: source, metadata, clip plan, render, and export should be traceable without dominating the creative surface.
- Replace folder/file management language with production language: ingest, analyze, select, assemble, export.
- Make every generated clip explain itself with timestamp, rationale, source, confidence, and status.

## Typography
- **Display/Hero:** Instrument Serif - adds an editorial voice and gives Prima Studio a stronger media identity than a purely utilitarian sans.
- **Body:** Source Sans 3 - clear, compact, mature, and well suited to long operational text.
- **UI/Labels:** Source Sans 3 - use uppercase sparingly for lane labels, status labels, and small metadata.
- **Data/Tables:** JetBrains Mono - use for timecodes, job IDs, asset IDs, filenames, metrics, and code-like provenance.
- **Code:** JetBrains Mono.
- **Loading:** Google Fonts links:
  - `https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Source+Sans+3:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap`
- **Scale:**
  - Display: 56px / 1.02
  - H1: 36px / 1.1
  - H2: 24px / 1.18
  - H3: 18px / 1.25
  - Body: 15px / 1.5
  - Small: 13px / 1.45
  - Micro: 11px / 1.35
  - Timecode/Data: 12px / 1.4, JetBrains Mono, tabular numbers

## Color
- **Approach:** Balanced. Neutrals carry the workstation; red marks Media Prima identity and primary production actions; teal marks AI/signal intelligence.
- **Primary:** `#E3262E` - Media Prima red. Use for primary actions, active step accents, progress, and decisive editorial moments.
- **Primary strong:** `#B91C24` - hover, active, and high-emphasis states.
- **Secondary:** `#0E7C86` - signal teal. Use for AI insight, analysis, recommendation, and freshness indicators.
- **Ink:** `#151515`
- **Surface warm:** `#F5F3EF`
- **Panel:** `#FFFFFF`
- **Panel soft:** `#ECE8DF`
- **Line:** `#D8D2C7`
- **Muted text:** `#6E6A63`
- **Semantic:** success `#2F855A`, warning `#B7791F`, error `#C53030`, info `#2563A6`
- **Dark mode:** Redesign surfaces rather than simply inverting them. Use ink `#0E0E0D`, panel `#181715`, panel soft `#24221E`, line `#3A352E`, text `#F6F1E8`, muted `#AAA195`, red `#F0444B`, teal `#23A6AE`.

## Spacing
- **Base unit:** 8px.
- **Density:** Compact-comfortable. Screens should support repeated production use without feeling cramped.
- **Scale:** 2xs 2px, xs 4px, sm 8px, md 16px, lg 24px, xl 32px, 2xl 48px, 3xl 64px.
- **Guidance:** Workstation surfaces should keep controls within reach. Use generous spacing only for overview/landing states, not inside review tools.

## Layout
- **Approach:** Hybrid.
- **Grid:** Use a three-zone app shell for the clipping lane: left project/stage rail, center review canvas, right assembly/provenance rail.
- **Breakpoints:**
  - Mobile: single column with sticky stage controls.
  - Tablet: two columns, review canvas above assembly panel.
  - Desktop: 12-column grid, center canvas spans 6-7 columns, side panels span 2-3 columns each.
- **Max content width:** 1520px for production surfaces, 1180px for overview pages.
- **Border radius:** sm 4px, md 6px, lg 8px, full 9999px. Cards and panels should not exceed 8px radius.
- **Panel hierarchy:** Use panels for tools, lists, cards, modals, and repeated items. Avoid card-inside-card nesting. Page sections should be unframed or full-width bands.

## Motion
- **Approach:** Minimal-functional.
- **Easing:** enter cubic-bezier(0.16, 1, 0.3, 1), exit cubic-bezier(0.7, 0, 0.84, 0), move cubic-bezier(0.65, 0, 0.35, 1).
- **Duration:** micro 70ms, short 160ms, medium 260ms, long 420ms.
- **Use motion for:** stage transitions, clip insertion into storyboard, active timecode changes, job status changes, upload progress, and AI plan updates.
- **Avoid motion for:** decorative page entrances, looping backgrounds, and attention-grabbing effects unrelated to production state.

## Video Clipping UX Direction
- Rename user-facing stages to **Ingest**, **Analyze**, **Select**, **Assemble**, and **Export**.
- Make the central surface a video review canvas with player, transcript, timeline, and scene intelligence.
- Convert metadata JSON into scene intelligence rows: timestamp, speaker, summary, emotion, hook score, and actions.
- Convert clip output into clip candidate cards: thumbnail, timestamp, duration, rationale, confidence, platform fit, preview, trim, add, reject.
- Convert joining into a storyboard timeline with ordered beats: hook, context, evidence, payoff, call to action.
- Move GCS bucket sync, output prefix, raw asset IDs, and artifact inventory into an advanced provenance drawer.
- Final result should include video preview, duration, export preset, version history, download/share actions, caption/subtitle status, and source provenance.

## Component Guidance
- **Primary buttons:** Filled red, icon plus text, used only for decisive production actions.
- **Secondary buttons:** Ink or neutral outline, used for inspect, sync, refresh, and alternate actions.
- **Danger buttons:** Error red, never reuse brand red without danger context copy.
- **Status pills:** Small, compact, and semantically colored. Use mono for queued/running timestamps.
- **Timecodes:** Always monospaced with tabular numbers.
- **Tables:** Use compact row height, clear sticky headers where useful, and explicit default sorting.
- **Clip cards:** Show video thumbnail first, then timestamp and editorial reason. Use confidence as supporting context, not the main label.
- **AI explanation:** Pair every AI suggestion with a short "Why this clip" line and source evidence.

## Safe Choices
- Keep the production-dashboard structure because editors and operators need scanability, traceability, and predictable controls.
- Keep job status and artifact provenance because AI media workflows need trust and auditability.
- Keep Media Prima red as the identity anchor.

## Creative Risks
- Use Instrument Serif for display moments to make Prima Studio feel editorial rather than generic SaaS. This adds personality, but should be limited to headings and high-level moments.
- Use a warm production-paper background instead of flat gray. This makes the tool feel more premium and media-native, but requires disciplined contrast checks.
- Put AI reasoning directly on candidate clip cards. This increases density, but makes the AI reviewable and improves editor trust.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-02 | Initial design system created | Created by /design-consultation based on Prima Studio repo context and the reviewed Streamlit clipping UI. |
