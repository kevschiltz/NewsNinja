# NewsNinja

An evidence-first news comparison Chrome extension. React + TypeScript + Tailwind + Vite frontend, Manifest V3 extension, and Python/FastAPI backend with OpenAI structured outputs and NewsAPI discovery.

## Start locally

Requires Node.js 20.19+ (or 22.12+), Python 3.11+, Google Chrome, and API keys for live analysis.

### 1. Backend

From the project root:

```sh
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```dotenv
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4.1-mini
NEWS_API_KEY=your_newsapi_key
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Obtain keys from [OpenAI](https://platform.openai.com/api-keys) and [NewsAPI](https://newsapi.org/register). The selected OpenAI model must support structured outputs. API usage can incur charges. NewsAPI plan restrictions affect which articles and dates are searchable.

Start the backend **from the backend directory** so `.env` is loaded:

```sh
cd backend
.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Health: <http://localhost:8000/health>. Interactive API docs: <http://localhost:8000/docs>. `configured: true` indicates that both keys are present, not that they are valid.

### 2. Build and load the extension

In a second terminal, from the project root:

```sh
cd extension
npm ci
npm run build
```

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this project's `extension/dist` folder.
4. Copy the extension ID displayed on its card.
5. Append `chrome-extension://YOUR_EXTENSION_ID` to `ALLOWED_ORIGINS` in `backend/.env` (comma separated, no spaces). Restart the backend after changing environment settings.
6. Pin NewsNinja from Chrome's Extensions menu.
7. Open a public news article and click the NewsNinja toolbar icon. It opens a dashboard tab and extracts available text from the article tab.
8. Click **Analyze Article**. Extraction is repeated at analysis time. The URL, metadata, and extracted text are sent to the local backend; OpenAI receives that text and retrieved reporting. NewsAPI receives generated event search terms.

Rebuild and click Reload on `chrome://extensions` after code changes. Open a fresh dashboard from the toolbar. Automatic detection runs locally on HTTP(S) pages through a top-frame content script. Chrome needs site access for those pages; no browsing-history permission is requested. Detection never sends article text to an API. You can restrict site access in Chrome, at the cost of disabling automatic detection on excluded sites.

### 3. Demo without API keys

Open the extension dashboard and click **Load sample analysis**. Demo mode is local and works without the backend or API keys. It is explicitly labeled **fictional**, uses invented sample newsrooms and a fictional bus pilot, and has no external links masquerading as real articles. These fixtures are illustrative, not reporting.

For frontend development without loading the extension:

```sh
cd extension
npm run dev
```

Open <http://127.0.0.1:5173> and load the demo. Article extraction requires the installed extension; browser preview shows an explanatory message.

## How the live flow works

1. The toolbar action opens a dashboard with the source tab ID in its URL.
2. Chrome scripting reads headline, publisher, author, date, and available article/main paragraph text. It does not bypass paywalls.
3. FastAPI validates the request. Local headline/entity/event terms generate concise discovery queries without an OpenAI request.
4. NewsAPI returns candidate coverage. Discovery tries up to three concise keyword queries only as needed, canonicalizes URLs, scores likely same-event coverage locally, and prioritizes distinct publishers after scoring. Up to five same-event alternatives are compared. Broader-topic links appear separately and never support omission findings.
5. The backend retrieves accessible public HTML, checking redirect destinations and limiting response size. Unavailable/blocked pages retain their search snippets.
6. OpenAI returns a Pydantic-validated report and related-source summaries using the Responses structured-output API.
7. Every comparison finding must include verbatim evidence quotes from known sources. The backend drops a finding if any quote cannot be matched against supplied source text or its headline. Missing-information findings must cite an alternative source.
8. The dashboard shows the report in five sections, original and alternative headlines side by side, source links, expandable quotations, and extraction limitations.

## Evidence and limits

- No numerical bias score or political classification.
- All extraction is conservatively treated as potentially incomplete. The app distinguishes extracted article text from snippet-only coverage; it never asserts verified full-article omissions.
- Quotes are checked for presence, not for logical entailment of every model-written statement. AI can still misinterpret evidence; inspect the original links. Related-source summaries are AI-generated and are not independently fact-checked.
- Paywalls, script-rendered pages, changing markup, and missing article/main containers can prevent extraction. Try another accessible article. No automatic fallback to fictional results occurs.
- Fewer than three relevant sources is a supported outcome and is explicitly disclosed.
- Live discovery currently searches English-language articles. Source date metadata may be unavailable.
- The backend is intended for local use on loopback, not public deployment. It has no user authentication or durable rate limiting. Keep credentials server-side and never expose the development backend publicly.

## Verification

```sh
cd extension
npm run build
npm test
cd ../backend
.venv/bin/python -m pytest tests -q
```

Tests cover key configuration, request validation, quotation filtering, unknown citations, private network URLs, blocked retrieval, the complete API response route with mocked providers, and the discovery/comparison pipeline with mocked external services. Production build validates TypeScript and packages the MV3 manifest/service worker alongside bundled assets.

This workspace was verified with a production build and automated backend tests. Real provider calls and a Chrome-installed live news analysis require your API keys and a working browser connection. The browser automation connection was unavailable during implementation, so visual inspection and an installed-extension smoke test remain unverified.

## Project layout

```text
extension/
  public/        MV3 manifest
  src/background.ts  Bundled MV3 service worker
  src/           Dashboard, extraction, typed models, fictional demo
  dist/          Built unpacked Chrome extension (generated)
backend/
  app/           FastAPI routes, schemas, retrieval and AI service
  tests/         Evidence and API tests
  .env.example   Required server environment settings
```

Implementation references: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Chrome scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting), [NewsAPI Everything](https://newsapi.org/docs/endpoints/everything).

## In-page news detection and mini panel

After rebuilding, visit `chrome://extensions`, reload NewsNinja, and **refresh existing news tabs**. Existing content scripts cannot reconnect after an extension reload. If Chrome asks about updated site access, automatic detection needs access to the news site. The toolbar still opens the original full dashboard.

On a public article with enough readable text, NewsNinja scans after about three seconds (and retries once at eight seconds for late-rendered pages). Explicit NewsArticle structured data is the strongest signal. Generic article metadata requires news-related URL/section evidence. Headline, paragraph count, length and link density reject many homepages, search listings and unrelated pages. This is a conservative heuristic, not a guarantee that every article will be recognized. No network analysis happens at detection time.

A subtle top-right invitation says **Want another perspective?** with Analyze article, Not now and a close control. It is claimed once per article URL, excluding fragments, per browser session, including across tabs. Dismissed articles do not repeatedly prompt. URL query variants are treated as distinct articles. Prompt history is held only in extension session storage.

The bottom-right **NewsNinja** button appears on detected articles whether or not prompts are enabled. It opens a 360px mini panel without starting analysis. Clicking **Analyze article** in the invitation is an explicit live-analysis action and opens the panel with analysis started. The panel is a bundled extension-page iframe inside a closed Shadow DOM shell, isolating React and CSS from the publisher. It shares extraction, API access, finding cards, citations, related-source rendering and session results with the full dashboard. No new runtime dependencies were added.

The panel has minimize, toggle expanded width, close and reopen controls. Escape minimizes when focus is inside the panel; Tab reaches the labeled controls, with visible focus rings. The page is not scroll-locked. Minimize or close hides the iframe but preserves an active analysis so you can reopen it. **Open full analysis** opens the existing dashboard, sharing completed results and the running-request state. **Load fictional sample** is a local free demonstration; it remains explicitly labeled fictional.

A per-tab analysis lease prevents simultaneous paid requests from the mini and full views. An interrupted analysis can leave the loading indicator until the lease expires (about 195 seconds). Results are cached in session storage for the source tab and exact URL, shared across views, and removed when that source tab closes. This is browser-session storage, not long-term storage. New analyses reset the unread findings badge. A lightweight URL check handles SPA navigation; article content is not continuously rescanned. Navigation removes the old panel, invalidates stale results, and schedules fresh detection. Same-URL content replacement is not detected automatically.

### Disable invitations

Open NewsNinja's full dashboard and click **Settings**, or use Chrome's extension details → **Extension options**. Uncheck **Offer another perspective on news articles**. This persistent setting removes existing invitations and suppresses future ones; manual launchers remain available. The mini panel also links to settings.

### Manual Chrome test checklist

1. Run `npm run build` in `extension`, reload NewsNinja in `chrome://extensions`, and refresh your article tabs.
2. Ensure Chrome's NewsNinja **Site access** allows the test publisher. Open a new public news article with several paragraphs and news metadata; wait about three seconds. Confirm the prompt and launcher appear and no backend request is made.
3. Click **Not now** or the close control. Reload/revisit the same URL in the same browser session; it should not prompt again. Use a different article URL to test a fresh invitation.
4. Click the floating NewsNinja button. Confirm the article title/source and Idle state. Click **Load fictional sample** to test every results section free, including source quotes and the unread badge disappearing after opening What You’re Missing.
5. Check minimize, close, reopen, expand/collapse, Escape, Tab focus, and narrow-window behavior. Confirm the underlying page remains scrollable.
6. Click **Open full analysis**. Confirm the existing dashboard displays the same cached sample/report without an API call.
7. Disable invitations in Settings. Open another article; the manual launcher should remain and the invitation should not appear. Re-enable to restore invitations.
8. Visit the publisher's homepage, search results, and a documentation/product page; expect no invitation or launcher. Detection is heuristic, so report any false positives.
9. Navigate between article URLs on a client-rendered site. Confirm old UI is removed, the new title is extracted, and a late response never replaces the new article's state. Reload the extension and refresh the webpage to reconnect.
10. For a real test, run FastAPI with valid OpenAI credits and NewsAPI access, and ensure `ALLOWED_ORIGINS` includes the extension origin. Choose **Analyze article**. Confirm Loading, followed by real evidence-linked results or a clear provider error. An exhausted-credit account should show its specific error; there is no silent substitution of demo data.

### Permissions and limits

The only new named permission is `storage`. Static content-script matches cover HTTP(S) pages because automatic detection must run before a toolbar click and publishers span many domains; Chrome may describe this as access to all websites. File URLs, Chrome internal pages, Chrome Web Store pages and other restricted browser surfaces are unsupported. The extension does not request `history`, `webRequest`, `tabs` or `unlimitedStorage`. `activeTab` and `scripting` remain for shared extraction; backend host access stays limited to local port 8000. Privileged messages validate extension identity, top-frame content-script origin, and embedded frame/tab ownership. No external-message or page `postMessage` bridge is exposed.

The iframe and hashed frontend assets are web-accessible so the content script can embed the existing extension UI. All scripts are packaged locally. The page cannot read the cross-origin iframe's results, but a hostile site can obscure/remove injected UI. Some publisher CSPs or browser policies may prevent embedding; the toolbar's full dashboard remains the fallback.

Real alternative-news search still requires the existing backend, valid API keys, OpenAI API credits and a compatible NewsAPI plan. Missing/blocked article text, paywalls, language and search coverage can limit results. No source availability or factual correctness is guaranteed by detection. No backend behavior or credential storage was changed for this feature.

Extension unit tests use Node's built-in runner and the existing TypeScript compiler (no new dependencies). They cover detection decisions, extraction, message authorization, prompt/session state, single-use analysis intent, request leases, packaged entries, and a mocked DOM lifecycle for the prompt and floating panel. They are not a substitute for an installed-Chrome visual test. Chrome browser automation was unavailable during this implementation.

## Debugging alternative-article discovery

NewsNinja still uses NewsAPI `/v2/everything`; no second news service is configured. Each analysis runs at most three sequential queries, broadening only while fewer than three distinct other-publisher domains have been found. No source/domain/date request filters are imposed; the configured NewsAPI plan still controls accessible history and freshness. Canonical URLs remove tracking, fragments, common AMP variants, and protocol differences. Matching is a transparent heuristic using headline/query terms, capitalized entity terms, event synonyms and dates; results are labeled **Likely same-event reporting**. Distinct publishers are approximated from hostnames and source names, not verified media ownership. Other articles from the original publisher are retained only after independent results and labeled accordingly.

Unlike the earlier pipeline, candidate articles are not discarded simply because an earlier hit came from the same publisher. Selection no longer requires a separate OpenAI request. Search errors—including HTTP-200 JSON error payloads—raise actionable NewsAPI errors rather than empty source lists. Normal backend INFO logs record sanitized queries, HTTP status, raw result counts, accepted counts, and rejection reason counts. Keys are sent only in the backend request header and never logged.

For optional diagnostics returned in the analysis JSON, add these settings to `backend/.env` and restart the backend:

```dotenv
APP_ENV=development
DISCOVERY_DIAGNOSTICS=1
```

The diagnostic object includes attempts, generated queries, status codes, raw/accepted counts, candidate classifications/scores and rejection counts. It is omitted unless **both** settings match; keep it disabled outside local development. Source relevance scores are internal diagnostics, not publisher bias scores. Historical zero-source runs cannot be reconstructed if their query/result logs were not recorded.

To test only NewsAPI without spending OpenAI credits, run from `backend`:

```sh
.venv/bin/python -m app.diagnose_discovery --query 'Paris AND protests'
.venv/bin/python -m app.diagnose_discovery --query 'Democrats AND Congress AND midterm'
```

These two widely covered story searches were each checked against the configured NewsAPI account during this fix: both returned HTTP 200 and 50 raw articles. Raw results include background and unrelated articles; those numbers do not mean 50 accepted same-event alternatives.

To test relevance with the **actual original title, URL and publication date**, run:

```sh
.venv/bin/python -m app.diagnose_discovery --query 'France strikes protests' --title 'France gears up for strikes and protests as unions promise national mobilisation' --url 'https://www.bbc.co.uk/news/articles/ckx2qzv835pgo' --date '2026-11-05' --max-queries 1
.venv/bin/python -m app.diagnose_discovery --query 'Trump midterm elections' --title "Americans head to the polls for elections that could define Trump's closing chapter" --url 'https://www.bbc.co.uk/news/articles/cq2d6k4r5n9ro' --date '2026-11-03' --max-queries 1
```

These exact titles/URLs/dates came from the live NewsAPI responses, not generated fixtures. The CLI defaults to one query to protect quota; opt into up to three with `--max-queries 3`. It returns separate accepted/background counts and genuine provider links. It does not call OpenAI or fetch article bodies. The initial live scoring smoke test also exposed older protest coverage and an election-opinion poll being overmatched; regression tests now enforce background separation for those cases. A low accepted count is still valid; inspect diagnostics rather than loosening thresholds until unrelated coverage passes.

For the extension test, reload NewsNinja at `chrome://extensions`, refresh the article, open one of those two news URLs (or another current widely covered story within your plan), and choose Analyze article. Check Related Articles in both the full dashboard and floating panel. Confirm same-event results and broader-topic coverage are separate, citations still work, and provider errors appear as errors. This full test uses OpenAI credits. Opening cached results does not rerun live discovery; click Analyze article to test the updated backend.

Tests: `cd backend && .venv/bin/python -m pytest tests -q`; frontend: `cd extension && npm run build && npm test`. See `backend/tests/test_discovery.py` for mocked success, empty/broadened responses, authentication/plan/quota errors, duplicates, relevance, sanitization and diagnostic gating.

## Browser article-access fix

The floating panel previously used `scripting.executeScript` for every extraction. Clicking an injected webpage button does not grant Chrome's `activeTab` permission. With only localhost in explicit host permissions, that injection can fail even though the statically registered news-page content script is already present. Separately, `tabs.get().url` can be hidden without a suitable grant, causing URL guards to mistake an available page for a stale one. The generic catch handler hid these distinct failures. This is a browser-access problem before backend/NewsAPI requests.

Both views now request article extraction from the existing **top-frame content script** using `tabs.sendMessage`. URL guards also use content-script messaging when Chrome hides tab metadata. If the script is absent, a checked injection/retry is attempted using permissions already granted (including toolbar `activeTab`); missing access explains how to allow the site or click the toolbar. No broad new host permission was added. Extraction uses the same self-contained function in both contexts, with JSON-LD, metadata, headings, article-body selectors, article and main fallbacks. Paywalls and inaccessible nested frames are not bypassed.

Errors distinguish site permission, missing content script, communication failure, missing article body, restricted URLs and the existing backend/API errors. **Retry reading article (no API call)** retries only browser extraction. The Analyze button can also retry extraction rather than remaining permanently disabled after an initial failure. Extension reloads still require refreshing pre-existing article tabs to discard stale extension worlds; the UI explains this.

To test: rebuild and reload NewsNinja at `chrome://extensions`, then refresh the Fox article. Open the floating button **before clicking the toolbar**; the title/source should load. Retry reading should not make any backend requests. Then open the toolbar dashboard and compare the extracted article. Analysis itself requires the existing backend/API configuration. For denied access, change Chrome's site access and verify the specific permission message and recovery after granting access. `chrome://` and Web Store pages remain restricted.

Inspect NewsNinja's service-worker console for `[NewsNinja access]` logs: tab ID and public URL path (query strings/fragments removed), explicit host-permission check, content-script response, fallback injection success, and extracted title/body presence and character count. Article text and API keys are never logged. These are extension-console logs, not backend logs.

Verification for this fix: production TypeScript/Vite build; 24 extension tests; 35 backend tests. A snapshot smoke test fetched current Fox News, BBC and CNA public HTML and ran the shared extractor against their metadata/paragraph structure. It found titles and 3,277 / 5,783 / 4,768 body characters respectively. This was HTML-snapshot verification, not an installed-Chrome end-to-end test; browser automation remains unavailable. No analysis API calls or API credits were used for these access checks.

## Original-article analysis and comparison restoration

The earlier analysis contract only described comparisons and permitted every section to be empty. Logs for the Paris article confirmed successful NewsAPI responses followed by **zero same-event sources**, with 32 candidates classified as background across attempts. Only same-event sources reached OpenAI, and background never reached Bigger Picture. The HTTP-200 analysis responses establish that the previous request/schema path completed; the old logs cannot establish whether individual findings were empty initially or discarded later. There was no standalone summary field or rendering path. A source count of one therefore meant original-only comparison input, not that the displayed related links were imaginary.

The new structured response includes `report.original_analysis` with evidence-backed summary, takeaways, entities, claims, language examples and uncertainties. This analysis is requested even when NewsAPI returns nothing or fails. Discovery failure remains visible in limitations; it is never called an empty successful search. A missing OpenAI key or failed/malformed OpenAI response remains an API error. A response with insufficient supported text shows an insufficient-evidence state.

`report.additional_context` contains supported same-event details and appears in What You're Missing with a clear label that these are **not verified omissions**. Since DOM extraction may be incomplete, verified article-level omissions remain unavailable. Original-only fields accept only original-article citations. Overview/Compare Coverage/additional details accept original and same-event citations; background citations cannot support them. Bigger Picture can use up to three background snippets, and its background findings receive a server-enforced Background context label. Both views share the rendering components and citation lookup.

Publication date is now one relevance signal rather than an automatic 3/14-day rejection. Continuing-event matching considers overlapping original body/snippet terms, event vocabulary, named entities/locations, and explicit continuing-event wording. Background/history/opinion exclusions remain, and very distant dates are still treated conservatively. This heuristic does not guarantee correct event classification.

Cost controls: the existing configured `OPENAI_MODEL` is unchanged; search-query construction is local; one structured OpenAI analysis request per uncached article; SDK automatic retries disabled; original input capped at 18,000 characters, up to five same-event inputs at 6,000 characters each, up to three background inputs at 2,500 characters each, and output capped at 6,500 tokens. A process-local 32-entry cache reuses successful summaries for ten minutes, keyed by original extracted content/metadata, model and API account identity. Failed calls, failed discovery and unsupported/empty original summaries are not cached. Restarting FastAPI clears it. Existing browser session caching remains, with a new schema-version key so old empty reports are not restored. There is no durable historical cache or cross-process shared cache.

For development-only analysis traces, add `APP_ENV=development` and `ANALYSIS_DIAGNOSTICS=1` in `backend/.env` and restart FastAPI. Logs show extracted-character counts, selected source classes/counts, whether OpenAI ran, model/status/error type, generated findings, discarded counts/reasons and populated section counts. They do not include article bodies, credentials or full model responses. Leave diagnostics off in production.

Regression tests in `backend/tests/test_standalone_analysis.py` cover no alternatives, multiple same-event sources, background only, OpenAI failure, valid empty comparisons, malformed output, cache reuse/content invalidation, missing NewsAPI credentials, source-class isolation, and continuing-event dates. `extension/tests/results.test.mjs` verifies that original summaries and takeaways render without alternatives and that additional reporting preserves citations and omission caveats. Provider-dependent quality and installed-Chrome visual behavior still require a live smoke test; automated tests mock the provider and do not spend credits.

To see the restored analysis: restart FastAPI, rebuild/reload NewsNinja in `chrome://extensions`, refresh the news article, and choose Analyze article. Overview should show Article summary and Key takeaways even with zero same-event sources. Related Articles retains actual provider links, and Bigger Picture may show explicitly labeled background. Backend restart and the new session-cache schema prevent stale pre-fix reports. Use the local demo when you do not want paid analysis.

### Confirmed citation-filter regression and live verification

Live diagnostics established the final failure directly: OpenAI returned a completed, schema-valid response with generated findings, but it shortened/paraphrased quoted evidence (often adding ellipses). Exact quote validation then removed overview, additional-context and bigger-picture findings. The fix preserves strict validation: analysis inputs now contain server-numbered exact excerpts per source. The model returns a source ID and excerpt ID with an empty quote field. The server resolves these references to the exact supplied text, rejects unknown/wrong-class IDs, and never uses fuzzy quote matching or invents citation text. Legacy verbatim-quote evidence remains supported for demo/backward compatibility.

The final capped live Fox/NewsAPI/OpenAI check used the existing configured `gpt-4.1-mini` model and produced: 1 summary, 5 takeaways, 6 entity findings, 3 claims, 2 language findings, 3 uncertainties, 4 overview findings, 2 supported additional-context findings and 1 bigger-picture finding. One attempted additional-context finding was correctly rejected because its citations were background-only. No separate framing-difference findings were returned; that is a valid outcome, not a reason to fabricate differences. This verifies the live server pipeline; installed-Chrome visual verification remains separate. Three capped live analysis requests were used to isolate and verify this regression; automatic paid retries remain disabled.

## Material-inspired dashboard

The frontend uses the light maroon palette (`#874957`, `#F6E8E7`, `#FCF8F7`, `#422A32`), Material-inspired state surfaces, rounded cards, consistent spacing/motion tokens, and locally bundled Inter with its OFL license. Primary navigation covers Analyzer, Article Summary, Source Comparison, and Missing Context. The all-views switcher retains Related Articles and Bigger Picture, together with unread counts and their existing read/reset behavior. The floating panel and settings retain the same analysis flow and inherit the palette/font.

The URL field opens a different article in a new tab. Use NewsNinja on that article to analyze its extracted text; pasted-URL fetching is not a backend feature and was not added. An already attached article can be analyzed directly. No analysis or paid API call starts from merely typing/opening a URL. Demo results remain clearly fictional. Coverage counts come from returned sources, and unsupported omissions retain their existing evidence caveats.

Frontend regression tests cover URL validation, accessible entry/loading states, real-data coverage counts, limited-evidence labeling and the existing summary/citation behavior. No backend API contracts or credentials were changed. Rebuild and reload the unpacked extension, then refresh article tabs to see the update.
