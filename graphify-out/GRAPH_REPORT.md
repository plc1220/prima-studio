# Graph Report - .  (2026-07-15)

## Corpus Check
- Large corpus: 139 files · ~829,219 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 623 nodes · 1232 edges · 38 communities detected
- Extraction: 69% EXTRACTED · 30% INFERRED · 0% AMBIGUOUS · INFERRED: 373 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_API Workflow Events|API Workflow Events]]
- [[_COMMUNITY_Project Guidance Docs|Project Guidance Docs]]
- [[_COMMUNITY_Task Data Models|Task Data Models]]
- [[_COMMUNITY_Video Clipping References|Video Clipping References]]
- [[_COMMUNITY_Media Task Contracts|Media Task Contracts]]
- [[_COMMUNITY_Asset API Storage|Asset API Storage]]
- [[_COMMUNITY_Newsroom Frontend Workflow|Newsroom Frontend Workflow]]
- [[_COMMUNITY_Frontend API Boundary|Frontend API Boundary]]
- [[_COMMUNITY_Runtime Audio Services|Runtime Audio Services]]
- [[_COMMUNITY_Newsroom Research Adapter|Newsroom Research Adapter]]
- [[_COMMUNITY_Design System Foundations|Design System Foundations]]
- [[_COMMUNITY_Local Video Rendering|Local Video Rendering]]
- [[_COMMUNITY_Newsroom API Contracts|Newsroom API Contracts]]
- [[_COMMUNITY_Shorts Generator Workflow|Shorts Generator Workflow]]
- [[_COMMUNITY_Database Initialization|Database Initialization]]
- [[_COMMUNITY_Service Package Modules|Service Package Modules]]
- [[_COMMUNITY_API Workflow Tests|API Workflow Tests]]
- [[_COMMUNITY_Workspace Management|Workspace Management]]
- [[_COMMUNITY_Voiceover Synthesis|Voiceover Synthesis]]
- [[_COMMUNITY_Root Layout|Root Layout]]
- [[_COMMUNITY_Home Page|Home Page]]
- [[_COMMUNITY_Video Clipping Page|Video Clipping Page]]
- [[_COMMUNITY_Newsroom Page|Newsroom Page]]
- [[_COMMUNITY_Shorts Page|Shorts Page]]
- [[_COMMUNITY_Workbench Page|Workbench Page]]
- [[_COMMUNITY_Status Pill|Status Pill]]
- [[_COMMUNITY_Product Context|Product Context]]
- [[_COMMUNITY_Next Type Environment|Next Type Environment]]
- [[_COMMUNITY_Next Configuration|Next Configuration]]
- [[_COMMUNITY_Job Detail Page|Job Detail Page]]
- [[_COMMUNITY_Python Package Init A|Python Package Init A]]
- [[_COMMUNITY_Python Package Init B|Python Package Init B]]
- [[_COMMUNITY_Next Type References|Next Type References]]
- [[_COMMUNITY_Prima App Shell|Prima App Shell]]
- [[_COMMUNITY_Prima Theme Types|Prima Theme Types]]
- [[_COMMUNITY_Prima Theme Runtime|Prima Theme Runtime]]
- [[_COMMUNITY_Prima Theme Source|Prima Theme Source]]
- [[_COMMUNITY_Prima Theme Declarations|Prima Theme Declarations]]

## God Nodes (most connected - your core abstractions)
1. `StorageClient` - 50 edges
2. `session_scope()` - 30 edges
3. `handle_shortgen()` - 24 edges
4. `get_settings()` - 22 edges
5. `Run the demo workflow in-process for a tiny Cloud Run deployment.      This is i` - 22 edges
6. `parse_gcs_uri()` - 20 edges
7. `handle_render()` - 20 edges
8. `handle_orchestration()` - 20 edges
9. `Orchestrator app package.` - 14 edges
10. `_fresh_app()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Scene Intelligence Mockup` --semantically_similar_to--> `Highlight Candidate Review`  [INFERRED] [semantically similar]
  design-preview/prima-studio-design-preview.html → apps/web/components/VideoClippingForm.tsx
- `StorageClient GCS Local Fallback` --semantically_similar_to--> `Real GCS Bucket Requirement`  [INFERRED] [semantically similar]
  packages/python/mpstudio/storage.py → docs/cloudrun-light.md
- `Video Clipping Screenshot Left Rail Layout` --semantically_similar_to--> `Ingest Analyze Select Assemble Export Stage Rail`  [INFERRED] [semantically similar]
  screenshots/video-clipping.png → design-preview/prima-studio-design-preview.html
- `Workspace Lane Cards UI` --semantically_similar_to--> `Unified Workbench Shell`  [INFERRED] [semantically similar]
  screenshots/home-redirect.png → docs/unified-workbench-spec.md
- `Frontend API Agent Architecture` --rationale_for--> `Shared Frontend API Contracts`  [INFERRED]
  README.md → apps/web/lib/api.ts

## Hyperedges (group relationships)
- **Production Lanes Shared Navigation** — layout_primary_navigation, workspaces_page_lane_meta, newsroom_generator_brief_workflow, video_clipping_form_source_asset_workflow, shorts_form_wizard_pipeline [EXTRACTED 1.00]
- **Newsroom-to-Shorts Handoff Pipeline** — newsroom_generator_ui, newsroom_generator_handoff, contracts_newsroom_handoff, contracts_shorts_workflow_request, shorts_form_ui [EXTRACTED 1.00]
- **Newsroom Package Contract Surface** — newsroom_package_builder, contracts_newsroom_package, api_newsroom_types, newsroom_generator_ui [EXTRACTED 1.00]
- **Bounded Research Signal Architecture** — settings_newsroom_research_config, research_evidence_adapter, research_social_cli_fallback, tests_newsroom_research, readme_newsroom_pipeline [EXTRACTED 1.00]

## Communities

### Community 0 - "API Workflow Events"
Cohesion: 0.08
Nodes (59): EventPayload, session_scope(), _content_type_for(), create_upload_url(), get_download_url(), get_job(), get_job_events(), get_workspace_assets() (+51 more)

### Community 1 - "Project Guidance Docs"
Cohesion: 0.04
Nodes (62): Local App Startup, Repository Agent Guidance, No-store JSON API Fetch Helper, Newsroom Package Contract, Shared Frontend API Contracts, Service Boundaries, Design System Rule, VideoClippingWorkflowRequest (+54 more)

### Community 2 - "Task Data Models"
Cohesion: 0.1
Nodes (50): BaseModel, AgentTaskKind, AgentTaskPayload, AgentTaskRecord, AspectRatio, AssetKind, AssetRecord, DownloadUrlResponse (+42 more)

### Community 3 - "Video Clipping References"
Cohesion: 0.06
Nodes (42): Current Video Clipping Flow Baseline, GPT UI AI Clip Generation Reference, GPT UI Clip Generation Reference, GPT UI Metadata Generation Reference, GPT UI Newsroom Reference, GPT UI Shorts Generator Reference, GPT UI Video Joining Reference, GPT UI Video Split Reference (+34 more)

### Community 4 - "Media Task Contracts"
Cohesion: 0.08
Nodes (40): Agent Task Payload Contract, Asset Content Streaming, Burned In Subtitles, Byte Range Parser, Clip Metadata Generation, Demo Video Fallback, Event Payload Contract, GCP Transcoder Render Path (+32 more)

### Community 5 - "Asset API Storage"
Cohesion: 0.16
Nodes (14): get_asset_content(), get_newsroom_package(), list_video_clipping_bucket_workspaces(), local_download(), local_upload(), _parse_range_header(), remove_asset(), remove_job() (+6 more)

### Community 6 - "Newsroom Frontend Workflow"
Cohesion: 0.11
Nodes (27): generate_script_with_adc(), activatePackage(), ensureSelectedWorkspace(), refreshHistory(), sleep(), startWorkflow(), waitForPackage(), get_settings() (+19 more)

### Community 7 - "Frontend API Boundary"
Cohesion: 0.09
Nodes (17): apiBase(), apiFetch(), applyWorkspace(), refreshWorkspace(), refreshWorkspaces(), updateSelectedContent(), updateSelectedElement(), deleteGeneratedAsset() (+9 more)

### Community 8 - "Runtime Audio Services"
Cohesion: 0.08
Nodes (33): GKE Runtime, Local Runtime Queue, Source Project Mapping, Voiceover Audio Synthesis, Cloud Run Light Deploy Script, Cloud Run Light Inline Workflows, Real GCS Bucket Requirement, AgentTaskKind (+25 more)

### Community 9 - "Newsroom Research Adapter"
Cohesion: 0.13
Nodes (31): BaseSettings, NewsroomEvidence, _collect_exa(), _collect_gdelt(), collect_newsroom_evidence(), _collect_rss(), _collect_social(), _configured_channels() (+23 more)

### Community 10 - "Design System Foundations"
Cohesion: 0.08
Nodes (31): Clip Candidate Card, Operational Color System, Compact Operational Component Language, Prima Studio Design System, Industrial Editorial Positioning, Operational Dashboard Mockup, Scene Intelligence Panel, Storyboard Assembly Panel (+23 more)

### Community 11 - "Local Video Rendering"
Cohesion: 0.13
Nodes (21): create_demo_mp4(), _drawtext_filter(), _escape_drawtext(), _ffmpeg_binary(), _ffmpeg_color(), Create a tiny playable MP4 placeholder for local/demo renders.      In productio, Render local timeline clips into a playable MP4 with ffmpeg., render_timeline_mp4() (+13 more)

### Community 12 - "Newsroom API Contracts"
Cohesion: 0.09
Nodes (26): Frontend Newsroom API Types, Shared API Fetch Boundary, Prima Studio Application Frame, Newsroom Evidence Contract, Newsroom-to-Shorts Handoff Contract, Newsroom Narrative Package Contract, Newsroom Workflow Request Contract, ShortsWorkflowRequest (+18 more)

### Community 13 - "Shorts Generator Workflow"
Cohesion: 0.16
Nodes (15): canAdvanceCurrentStep(), deleteGeneratedShort(), draftTerms(), ensureSelectedWorkspace(), extractKeywordTerms(), generateDraftKeywords(), generateDraftScriptAndKeywords(), isStepComplete() (+7 more)

### Community 14 - "Database Initialization"
Cohesion: 0.18
Nodes (12): _connect_args(), create_database_engine(), _ensure_workspace_lane_column(), init_db(), DeclarativeBase, on_startup(), AgentTask, Asset (+4 more)

### Community 15 - "Service Package Modules"
Cohesion: 0.14
Nodes (1): Orchestrator app package.

### Community 16 - "API Workflow Tests"
Cohesion: 0.38
Nodes (9): _fresh_app(), test_asset_content_supports_head_and_range(), test_create_upload_url_and_start_shorts_workflow(), test_delete_job_removes_output_assets_and_files(), test_delete_workspace_removes_workspace_rows(), test_inline_video_clipping_uses_metadata_render_task(), test_start_video_clipping_workflow(), test_sync_video_clipping_bucket_imports_workspace_assets() (+1 more)

### Community 17 - "Workspace Management"
Cohesion: 0.32
Nodes (3): deleteWorkspace(), refresh(), tagWorkspace()

### Community 18 - "Voiceover Synthesis"
Cohesion: 0.53
Nodes (5): _language_code(), Create narration audio with Google Cloud Text-to-Speech when ADC is available., synthesize_voiceover_audio(), _synthesize_with_local_say(), _volume_gain_db()

### Community 19 - "Root Layout"
Cohesion: 1.0
Nodes (0):

### Community 20 - "Home Page"
Cohesion: 1.0
Nodes (0):

### Community 21 - "Video Clipping Page"
Cohesion: 1.0
Nodes (0):

### Community 22 - "Newsroom Page"
Cohesion: 1.0
Nodes (0):

### Community 23 - "Shorts Page"
Cohesion: 1.0
Nodes (0):

### Community 24 - "Workbench Page"
Cohesion: 1.0
Nodes (0):

### Community 25 - "Status Pill"
Cohesion: 1.0
Nodes (0):

### Community 26 - "Product Context"
Cohesion: 1.0
Nodes (2): Prima Studio Product Context, Local-first AI Video Workflow Scaffold

### Community 27 - "Next Type Environment"
Cohesion: 1.0
Nodes (0):

### Community 28 - "Next Configuration"
Cohesion: 1.0
Nodes (0):

### Community 29 - "Job Detail Page"
Cohesion: 1.0
Nodes (0):

### Community 30 - "Python Package Init A"
Cohesion: 1.0
Nodes (0):

### Community 31 - "Python Package Init B"
Cohesion: 1.0
Nodes (0):

### Community 32 - "Next Type References"
Cohesion: 1.0
Nodes (1): Next Type References

### Community 33 - "Prima App Shell"
Cohesion: 1.0
Nodes (0):

### Community 34 - "Prima Theme Types"
Cohesion: 1.0
Nodes (0):

### Community 35 - "Prima Theme Runtime"
Cohesion: 1.0
Nodes (0):

### Community 36 - "Prima Theme Source"
Cohesion: 1.0
Nodes (0):

### Community 37 - "Prima Theme Declarations"
Cohesion: 1.0
Nodes (0):

## Ambiguous Edges - Review These
- `Astryx UI Conventions` → `Root Layout Shell`  [AMBIGUOUS]
  apps/web/AGENTS.md · relation: rationale_for
- `EventPayload` → `Missing Job Detail Error State`  [AMBIGUOUS]
  screenshots/job-detail-missing.png · relation: conceptually_related_to
- `Repository Contract Mapping` → `Missing Job Detail Error State`  [AMBIGUOUS]
  screenshots/job-detail-missing.png · relation: conceptually_related_to
- `Shorts Plan Builder` → `Gemini ADC Script Generation`  [AMBIGUOUS]
  services/agents/shortgen/app/main.py · relation: conceptually_related_to

## Knowledge Gaps
- **78 isolated node(s):** `Create narration audio with Google Cloud Text-to-Speech when ADC is available.`, `Repository Agent Guidance`, `Local App Startup`, `Design System Rule`, `Prima Studio Product Context` (+73 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Root Layout`** (2 nodes): `layout.tsx`, `RootLayout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Home Page`** (2 nodes): `page.tsx`, `HomePage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Video Clipping Page`** (2 nodes): `page.tsx`, `VideoClippingPage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Newsroom Page`** (2 nodes): `page.tsx`, `NewsroomPage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Shorts Page`** (2 nodes): `page.tsx`, `ShortsPage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Workbench Page`** (2 nodes): `page.tsx`, `WorkbenchPage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Status Pill`** (2 nodes): `StatusPill.tsx`, `StatusPill()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Product Context`** (2 nodes): `Prima Studio Product Context`, `Local-first AI Video Workflow Scaffold`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Next Type Environment`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Next Configuration`** (1 nodes): `next.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Job Detail Page`** (1 nodes): `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Python Package Init A`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Python Package Init B`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Next Type References`** (1 nodes): `Next Type References`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Prima App Shell`** (1 nodes): `AppFrame.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Prima Theme Types`** (1 nodes): `prima.variants.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Prima Theme Runtime`** (1 nodes): `prima.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Prima Theme Source`** (1 nodes): `prima-theme.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Prima Theme Declarations`** (1 nodes): `prima.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Astryx UI Conventions` and `Root Layout Shell`?**
  _Edge tagged AMBIGUOUS (relation: rationale_for) - confidence is low._
- **What is the exact relationship between `EventPayload` and `Missing Job Detail Error State`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Repository Contract Mapping` and `Missing Job Detail Error State`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Shorts Plan Builder` and `Gemini ADC Script Generation`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `init_db()` connect `Database Initialization` to `API Workflow Events`, `Runtime Audio Services`?**
  _High betweenness centrality (0.154) - this node is a cross-community bridge._
- **Why does `SQLAlchemy Persistence Rows` connect `Runtime Audio Services` to `Database Initialization`?**
  _High betweenness centrality (0.133) - this node is a cross-community bridge._
- **Why does `session_scope()` connect `API Workflow Events` to `Task Data Models`, `Asset API Storage`, `Database Initialization`?**
  _High betweenness centrality (0.132) - this node is a cross-community bridge._