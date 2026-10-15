# Gloss 0.2.0 visual and interaction QA

Date: 2026-10-15. Target: a faithful native Obsidian adaptation of the Gloss reading UI.

## Artifacts and normalization

- Source: https://www.usegloss.io/read/on-thinking-for-oneself (public-domain Schopenhauer article), upstream snapshot `54b13b8882d8a109132c5b2045acd6b45628563d`.
- Implementation: Obsidian 1.14.4 on macOS, Gloss Reader 0.2.0, same article imported as a Markdown verification fixture. No private article was used.
- Source captures: inline browser captures in this task, including the selection toolbar on the highlighted word “knows”. The capture API returned pixels, not a durable source screenshot path.
- Implementation capture: `gloss-reader-v020.png`, saved in this task's local visualizations directory; normalized capture: `gloss-reader-v020-css.png` in the same directory.
- Source viewport: 1470 × 817 CSS pixels, 1× density. Native capture: 2940 × 1694 pixels, 2× density, including 30 CSS pixels of native tab chrome. The native capture was cropped by 60 image pixels at the top and downsampled to 1470 × 817 before the final combined comparison.
- Source and normalized implementation were supplied together in a single image comparison input. This was a two-image comparison, not a stitched side-by-side image.
- The source shows a single-word stored highlight; the implementation shows an active paragraph question, saved personal note and real Codex answer. The differing annotated ranges, translated labels, signed-out source controls and native Obsidian controls are intentional state/product differences. They are not treated as pixel-equal regions. Article typography and geometry were additionally compared at equal scroll 410px.

## Findings, fixes and post-fix evidence

| Priority | Finding | Fix | Evidence after fix |
| --- | --- | --- | --- |
| P1 | 0.1.0 used a generic reading pane and separate chat layout instead of Gloss's composition. | Adapted the original page geometry, header, floating composer, selection lens, anchored margin and real fonts. | Live same-article captures show the source's reading composition and identical first-paragraph wrapping. |
| P2 | Early v0.2 rail bars used uniform paragraph spacing. | Ported document-height-scaled block geometry and paragraph-length widths, with highlight ticks and question dots. | Updated desktop capture shows the source's dense document silhouette and viewport travel window. |
| P2 | Personal note quotations could clip through a line; a composer context chip made the input heavier than the source. | Two-line text clamp; lightweight single-row composer with scope button. | Post-fix desktop and night drawer captures show clean truncation and one-row input. |
| P2 | A personal highlight could remain visually active when opening a question. | Single active margin item; source-style ruby wash and active-note-priority bidirectional placement. | Expanded answer and personal note are distinct; measured card bounds 117–298.89px and 315–633.63px do not overlap. |
| P1 | Plugin reload could leave an Obsidian placeholder page or overwrite reading progress with teardown geometry. | Resolve deferred leaves, recreate stale view instances, guard unloading/invalid viewport capture and preserve the last real scroll on close. | Full disable/enable: saved/read/restored progress all 0.4500146757; loaded view true, old and new annotations retained. |

## Required fidelity surfaces

- **Fonts and typography:** embedded actual Newsreader normal/italic and Schibsted Grotesk files from the source. Native header at scroll 0: x265, root-relative y167.5, width640, height140.34375px, matching source geometry. Body20px, line-height32.8px; the first paragraph wraps identically, including italic text in the following paragraph. Chinese labels and Chinese system-font fallback are expected adaptations.
- **Spacing and layout rhythm:** original 640px prose, 64px gutter and 340px margin; source article starts y638.546875, native root-relative y639.546875 (1px difference). Toolbar60px, grid64px top padding, source radii and shadows. The normalized final combined capture makes the toolbar and small type readable; an extra tiny crop was unnecessary at this resolution. Compared equal-scroll text geometry as well as whole-view composition.
- **Colors and tokens:** source paper `#f6f3ec`, raised paper `#fcfaf6`, ink `#1d1b18`, rule `#e5dfd2`, rubric `#c1401b`. Four original marker colors with 46% resting/70% active opacity, cloned inline box decoration, sweep animation, 1.5px question underline and active ruby wash. Night theme inspected in the actual app.
- **Image and asset fidelity:** actual source font assets embedded locally; original grain SVG copied and scoped. Lucide icons use Obsidian's Lucide icon API. No generated or hand-drawn substitute assets. Together account branding is replaced by the Obsidian integration label; no decorative photography or illustrations occur on the target screen. Attribution and full font licenses are bundled.
- **Copy and content:** public article text preserved. Controls localized into Chinese. Native account/cloud actions are replaced by document selection and agent settings. Reading estimate26 minutes versus source27 is an acceptable P3 calculation difference; 67 non-heading paragraphs match. Native source note title can differ from its frontmatter display title.

## Interaction and responsive verification

- Actual mouse selection opens the black lens. Four marker choices, inline note editing and saved blue highlight verified in the app.
- Real Codex request completed against this public article; answer contains paragraph citations. Clicking a rendered answer citation moved the scroller from315px to347px and revealed the cited first paragraph.
- Export button actually created Markdown containing complete excerpt, saved personal note, real answer and return links; inspected the output file.
- 700px-wide desktop container in night theme: notes switch from margin to accessible drawer. 390px container: toolbar, export and close controls remain accessible; drawer fits container. These are desktop container checks, not a mobile-app claim.
- Full reload preserved the current fixture's one highlight and two-message thread, plus the older fixture's highlight and four messages. No API key persisted. Source Markdown is not modified by annotations.
- TypeScript/build and 18 automated anchor, layout and mark-segmentation tests pass. API transport's local mocked streaming/cancel/error tests are retained from0.1; external provider compatibility is not claimed from mock tests.

## Implementation checklist

- [x] Real fonts/assets, source layout and inline marks adapted.
- [x] Combined source/implementation visual comparison after fixes.
- [x] Native selection, real answer, citation jump, export and reload verified.
- [x] Narrow containers/night theme inspected and original appearance restored.
- [x] Attribution and font licenses included with distribution.
- [x] No unresolved P0/P1/P2 findings in the adapted Markdown reading scope.

## 0.3.0 follow-up: settings and opt-in entry

- New visual reference: installed Banana Design0.10.0 settings, inspected in the native Obsidian settings window. Header18px, 13px icon tabs with bottom rule, restrained field rows, service cards and black primary action are adapted to the reader's own settings classes and Obsidian theme tokens.
- Native visual checks: models/Codex, models/compatible API, reading preferences and data/about. Provider cards update selection and fields correctly; controls use labels/selected state and settings persist. No Gloss logo or replacement brand mark in the reader/header/settings. Attribution remains in third-party notices.
- Actual UI flow: native Markdown open (no focus overlay), ribbon click (one focus overlay, no brand element), return button (native Markdown and zero reader tabs/overlays). Existing saved highlight retained.
- On plugin reload after an open reader session, workspace restoration converts former reader tabs to native files. No default-view/file-open interception is registered.
- Reading settings affect only the immersive view. Runtime plugin name is 沉浸阅读, version0.3.0; plugin ID/data path retained for compatibility.
- Build and retained18 tests pass; lifecycle/UI checks above cover the changed entry and settings behavior. The settings connection test was started with the public test sentence; clicking Stop immediately displayed 已停止测试 and re-enabled the button. Provider connectivity success is not inferred from this cancellation test.

## 0.4.0 follow-up: providers and editable commands

- Compact native settings now have three tabs: models, selection commands, reading preferences. Removed opening-mode explanation, data/about tab and descriptive paragraphs. Models offer Codex CLI, Claude CLI and API; the API protocol dropdown lists Chat Completions, Responses, Anthropic and Gemini. Visually checked service cards, protocol menu and command editor at the same native settings window size as prior Banana reference.
- Actual native UI: edited an existing built-in prompt, saved it, restored its default, added a custom command with placeholders, moved it up and observed the updated order. The toolbar's More menu then displayed the custom command. Clicking it sent a real HTTP request to a local Responses mock, displayed its streamed reply in the margin, and verified both selection and title placeholders had expanded correctly.
- Temporary test command, mock answer and provider settings removed/restored after verification. Original highlights and conversations retained. No private document was used for the request.
- Commands include a visible count and Add control disabled at eight. Tests cover eight-entry cap, editing at capacity, empty lists, edited built-ins, duplicate IDs, order and literal placeholder replacement. Fixed hardcoded starter prompts so all model-action shortcuts in the selection toolbar use editable commands.
- Four protocol request/auth/response/cancellation/error paths verified with local mock HTTP servers. JSON and chunked SSE tested separately. Claude process test verifies stdin context, disabled tools/customizations/MCP, no persistent session and no duplicated final reply.
- CLI/API integration coverage and external account availability are distinct. External API providers have not been live-tested with private keys. Claude live test with the sonnet alias returned a real Chinese explanation and [¶1] citation. Filtering all setting sources initially prevented authentication; retaining normal auth sources while using safe mode, disabled tools and strict empty MCP fixed that integration issue. Obsidian settings UI also completed its real Claude connection test successfully. No credentials were printed or persisted.
- 29 automated tests pass; TypeScript/build pass. No unresolved visual or entry-flow P0/P1/P2 issue in this scope.

final result: passed

## 0.4.1 follow-up: input focus and quiet composer

- Default entry has no bottom composer; toolbar message button and / reveal it with focus, Esc or close hides it without losing draft or selected anchor. A configurable Obsidian command is registered too.
- Inline editor releases the DOM selection after saving the anchor, positions before focus and reasserts focus after pointer activation. Editable mouse/keyboard events stay local; composing Enter and legacy 229 do not send in any reader input.
- Do not activate an existing highlight/thread when a noncollapsed article selection is present.
- Native UI verified actual keyboard input (not AX setValue), click-to-edit, toolbar and / opening, Esc closing and draft restoration. Runtime event check: composing Enter ignored, legacy 229 ignored, ordinary Enter handled exactly once. Build + 29 regression tests passed.
- The reported intermittent failure did not reproduce consistently on the public fixture before the fix. Focus/selection handling was hardened; direct Chinese typing through the automation did not reliably inject Unicode, so the input-method guard was additionally verified through runtime composition events.
