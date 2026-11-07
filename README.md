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

Rebuild and click Reload on `chrome://extensions` after code changes. Open a fresh dashboard from the toolbar. Only the clicked article tab is accessed through `activeTab`; this extension does not request access to all browsing history.

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
3. FastAPI validates the request. OpenAI generates a precise event search query.
4. NewsAPI returns candidate coverage. Results are deduplicated by hostname and filtered by the model for the same specific event, with a maximum of five alternatives.
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
cd ../backend
.venv/bin/python -m pytest tests -q
```

Tests cover key configuration, request validation, quotation filtering, unknown citations, private network URLs, blocked retrieval, the complete API response route with mocked providers, and the discovery/comparison pipeline with mocked external services. Production build validates TypeScript and packages the MV3 manifest/service worker alongside bundled assets.

This workspace was verified with a production build and automated backend tests. Real provider calls and a Chrome-installed live news analysis require your API keys and a working browser connection. The browser automation connection was unavailable during implementation, so visual inspection and an installed-extension smoke test remain unverified.

## Project layout

```text
extension/
  public/        MV3 manifest and toolbar service worker
  src/           Dashboard, extraction, typed models, fictional demo
  dist/          Built unpacked Chrome extension (generated)
backend/
  app/           FastAPI routes, schemas, retrieval and AI service
  tests/         Evidence and API tests
  .env.example   Required server environment settings
```

Implementation references: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Chrome scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting), [NewsAPI Everything](https://newsapi.org/docs/endpoints/everything).
