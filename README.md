# LEX

LEX is a static front-end demo for a legal-services platform. Its pages are kept together at the project root, and shared files are grouped under `assets/`.

## Project layout

```text
LEX-APP-/
├── index.html                 # Landing page and sign-in/sign-up flow
├── dashboard.html             # Client dashboard
├── lawyer-registration.html   # Lawyer professional application
├── lawyer-dashboard.html      # Lawyer workspace preview
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

The client dashboard is at <http://localhost:8000/dashboard.html>. Client sign-up and sign-in navigate there after saving the demo account in browser storage. The dashboard provides quick access to legal documents, lawyer search, and a LEX AI assistant preview. Selecting the lawyer role opens `lawyer-registration.html`; after saving an application, the lawyer can open the workspace preview at <http://localhost:8000/lawyer-dashboard.html>. The lawyer workspace includes a sample case overview, pro-bono leaderboard, Truth Hub demo decisions, profile, services management, calendar and browser-saved reminders, temporary in-tab document handling, and a sample personal chat.
Stop the local server with `Ctrl+C`.

## Mobile app preview

The native client-app starter is in `mobile/`. From that folder, run:

```powershell
npm install
npx expo start
```

Install Expo Go on an Android or iOS phone and scan the QR code shown in the terminal. The phone and computer should be on the same network; if local discovery is blocked, try `npx expo start --tunnel`. Android emulators can use `npm run android`. Building an iOS binary locally requires macOS; Expo Go or an Expo cloud build can be used from Windows.

## Notes

- The website and mobile app are front-end previews; accounts, lawyer verification, case assignments, messaging, AI answers, lawyer listings, secure document storage, payments, and cross-device sync need a shared backend before production. Lawyer cases, leaderboard entries, Truth Hub claims, and chats are sample data. Reminder text is stored in this browser; selected files and chat messages are only held in the current page session.
- Keep HTML pages at the project root and place stylesheets, scripts, images, and fonts in their corresponding `assets/` folders.
