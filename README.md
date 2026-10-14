# LEX

LEX uses the existing static website frontend for a legal-services platform. The first
shared backend integrations (Supabase authentication, Stream Chat, and the legal-assistant
API) live under `backend/`; other product areas remain prototypes.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the current prototype architecture and a proposed backend design, including third-party chat, voice, and video integration.

## Project layout

```text
LEX-APP-/
├── index.html                 # Landing page and sign-in/sign-up flow
├── dashboard.html             # Client dashboard
├── lawyer-registration.html   # Lawyer professional application
├── lawyer-dashboard.html      # Lawyer workspace preview
├── admin.html                 # Restricted lawyer-application review workspace
├── mobile/                    # Expo / React Native mobile app
└── assets/
    ├── css/                   # Page stylesheets and font stylesheets
    ├── js/                    # Page behavior
    ├── images/                # Logos and page imagery
    └── fonts/                 # Local font files
```

## Run locally

Serve the repository root over HTTP so page navigation and browser storage work consistently.

From the repository root, run:

```powershell
py -m http.server 8000
```

Open the landing page at:

- <http://localhost:8000/>

The client dashboard is at <http://localhost:8000/dashboard.html>. Sign-up and sign-in use
the LEX API and Supabase Auth. The client workspace retains the existing lawyer directory
and other prototype tools. The verified-lawyer directory is read from Supabase; direct
conversations use Stream. Its legal assistant proxies questions to the separate RAG API.
The lawyer workspace includes working Stream messaging for provisioned conversations and
the verified-lawyer lounge. Lawyer applications and private verification-document uploads
are stored in Supabase; the rest of the directory, case assignment, payments, and general
document workflows remain prototypes.
Stop the local server with `Ctrl+C`.

## Backend setup

The backend is a Python/FastAPI service. It requires Supabase project credentials, Stream
Chat credentials, a private internal key for the legal-assistant service, and the legal
corpus/model configuration. No provider secret belongs in browser code.

1. Apply [`backend/supabase/migrations/001_initial_chat_backend.sql`](backend/supabase/migrations/001_initial_chat_backend.sql)
   to the Supabase project `tmtbnikhkawcpunupxix` in the Supabase SQL editor.
2. Create a private virtual environment and install the API dependencies:

   ```powershell
   py -m venv backend\.venv
   backend\.venv\Scripts\Activate.ps1
   py -m pip install -r backend\requirements.txt
   Copy-Item backend\.env.example backend\.env
   ```

3. Fill `backend\.env` with the Supabase anon and service-role keys, Stream API key and
   secret, and an independently generated `LEGAL_AI_API_KEY`. Configure `CORS_ORIGINS`
   for the exact website origin. Do not commit the environment file.
4. Follow [the legal-assistant setup](LLM-for-legal-advices/README.md) to sync the shared
   Drive text corpus, build the local vector database, configure its Groq credential and
   the same internal API key, then start the model API on port 8100.
5. Start the LEX API from the repository root:

   ```powershell
   uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8001 --reload
   ```

6. `assets/js/config.js` points the existing frontend to the local API. Change its
   `apiBaseUrl` for deployment and update the backend's allowed CORS origins. Serve the
   website over HTTP as described above; the frontend session uses short-lived tokens in
   `sessionStorage` and asks Supabase to refresh them.

Run the backend's credential-free API checks from the repository root with
`py -m unittest discover -s backend/tests`.

Lawyer accounts start unverified. Configure a trusted administrator by setting the protected
Supabase Auth `app_metadata.lex_role` claim through a server-side administrative process;
never accept that claim from the public frontend. Admins must scan a verification document
and mark it clean before approving its application. Chat access is enforced by the backend
using the resulting `profiles.is_verified` value. AI prompts are not stored by this API, but
external model-provider processing is still subject to that provider's terms and the
applicable confidentiality requirements.

The administrator API exposes the pending queue at
`GET /api/v1/admin/lawyer-applications`, short-lived review links at
`GET /api/v1/admin/lawyer-applications/{id}/document`, and the explicit scan/review actions
under `/api/v1/admin/`. Signed-in administrators can use `admin.html` to review the queue.
The page checks the protected `is_admin` value from `/api/v1/auth/me`, and all privileged
actions remain enforced server-side. A trusted reviewer must use an appropriate
malware-scanning process before marking an upload clean; no scanner is included in this
initial backend.

Use TLS, a private network between the LEX API and model API, production rate limits,
monitoring, backup/recovery, and privacy/legal review before launch.

## Mobile app preview

The native client-app starter is in `mobile/`. From that folder, run:

```powershell
npm install
npx expo start
```

Install Expo Go on an Android or iOS phone and scan the QR code shown in the terminal. The phone and computer should be on the same network; if local discovery is blocked, try `npx expo start --tunnel`. Android emulators can use `npm run android`. Building an iOS binary locally requires macOS; Expo Go or an Expo cloud build can be used from Windows.

## Notes

- Case assignments, advanced directory search, general client document storage, payments, notifications, and cross-device sync are not implemented yet. Lawyer cases, leaderboard entries, and Truth Hub claims remain samples. Reminder text is stored in this browser; selected files outside lawyer verification are not uploaded.
- Keep HTML pages at the project root and place stylesheets, scripts, images, and fonts in their corresponding `assets/` folders.
