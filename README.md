# KaamWala (کام والا)

A hyper-local marketplace connecting households in Islamabad and Rawalpindi with nearby skilled trade workers: electricians, plumbers, AC technicians, carpenters, mechanics, mistri, labourers, home maids, and any other category the admin adds. It is our answer to the Roshan Rozgar problem statement, and it is built for workers who may have limited literacy: Urdu first, voice first, large tap targets, and audio cues.

> **Project status: in progress.** This README describes the intended product. The table below says what exists right now, and it is updated as work lands. Nothing is listed as done until it has been tested end to end.

| Area | Status |
|---|---|
| Monorepo and shared API contract | Done |
| Worker, customer and admin screens | In progress |
| API, database, seed data | In progress |
| Jev matching engine | In progress |
| Live end-to-end flows | In progress |
| Admin panel and category manager | In progress |
| PWA, offline, push notifications | In progress |
| Production deployment | Not deployed yet. Deployment scripts are in `infra/` |

**Live demo:** not available yet.

## Features

- **Sign-up by voice or by typing.** A worker can speak their details (name, trade, experience, area, rate, working hours) and have the profile filled in and read back, or choose to type every field instead, in Urdu, Roman Urdu or English.
- **Discovery.** Customers describe a problem by voice, Roman Urdu text or photo, and see available nearby workers on a map and in a list.
- **Two ways to hire.** Pick a worker directly, or publish an open job and receive offers.
- **Multi-day hiring.** Book a worker or crew for up to 30 days at a per-day price, track progress day by day, and finish early paying only for completed days.
- **Fair price negotiation.** Price buttons move in a fixed step set by the admin and never go below the category's floor price. Voice notes in both directions carry automatic transcripts.
- **Reliable booking.** Accepting a job runs in one database transaction with a row lock, so a worker can never hold two active jobs. Status updates reach every client live over WebSockets.
- **Availability control.** One big toggle with time presets. A busy worker disappears from search and the map.
- **Trust.** Voice or tap reviews are summarised into short trust tags, and workers rate hirers too.
- **Crews.** Several workers take one job at one price, and all become engaged together.
- **Admin.** Approve or suspend workers, manage jobs and disputes, and add, edit, disable or reorder categories with no code change or redeploy.
- **Field agents.** Authorised agents can create profiles for workers who cannot use a phone. Self-signup is free. An agent-assisted signup carries a fee set by the admin, split between the agent and the platform, with a per-agent ledger in the admin panel.
- **Installable PWA.** Offline access to a worker's profile, upcoming jobs and earnings, plus queued actions, Web Push, and a sunlight mode.

## Setup

Prerequisites: Node.js 24, pnpm 10, and Docker.

```bash
pnpm install
```

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` and set `JWT_SECRET` and `CNIC_SALT` to long random strings. Add a `GEMINI_API_KEY` from [Google AI Studio](https://aistudio.google.com/apikey) for the AI features. Web Push needs VAPID keys, which you can generate with `npx web-push generate-vapid-keys`.

Start the local database (Postgres in Docker, on port 5433), apply the schema, and load the demo data:

```bash
pnpm db:up
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

Start the web app and API:

```bash
pnpm dev
```

The web app runs at http://localhost:5173 and the API at http://localhost:3002.

Other useful commands:

| Command | What it does |
|---|---|
| `pnpm test` | Run the unit tests, including the Jev matching engine |
| `pnpm typecheck` | Type-check every package |
| `pnpm build` | Build everything |
| `pnpm db:down` | Stop the local database |

## Deployment

KaamWala runs on a DigitalOcean droplet next to other apps, at `kaamwala.avezea.com` (web) and `api.kaamwala.avezea.com` (API). The scripts add only KaamWala's own Postgres database, its `kaamwala-api` systemd service on private port 3002, and its Caddy site blocks. Nothing else on the server is changed or restarted.

1. In Namecheap's Advanced DNS for `avezea.com`, add A records for `kaamwala` and `api.kaamwala` pointing to the droplet's IP.
2. Copy `infra/deploy.env.example` to `infra/deploy.env` and set the droplet host, SSH user and domain. SSH must work with a key.
3. Run `bash deploy.sh --setup`, then run the single `ssh -t` command it prints. That command asks for the sudo password once in your terminal. Afterwards the deploy user can run only `/usr/local/sbin/kaamwala-ctl` without a password.
4. Run `bash deploy.sh --push-env` to copy the Gemini and push keys from `apps/api/.env` to the server.
5. Run `bash deploy.sh --seed` for the first deploy, and `bash deploy.sh` after that.

## Tech stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces, Turborepo, TypeScript |
| `apps/web` | React 18, Vite 5, vite-plugin-pwa (Workbox), Tailwind CSS, IndexedDB via idb, Leaflet with OpenStreetMap tiles, Driver.js |
| `apps/api` | Node.js, Fastify 5, Zod, WebSockets, Prisma 6, PostgreSQL, JWT via jose, Web Push, sharp |
| `packages/jev` | Our own local matching engine in pure TypeScript, tested with Vitest |
| `packages/contracts` | Zod schemas and types shared by the web app and API |
| Hosting | DigitalOcean droplet with Caddy and systemd |

### Jev, the local matching engine

Jev takes raw text in Urdu script, Roman Urdu or English, and returns the best trade and skill matches with confidence scores. It normalises Roman Urdu spellings, maps between Urdu and Roman script, and does fuzzy matching against a dictionary loaded from the admin-managed categories. It is written from scratch, runs locally with no AI service, and keeps text search working when Gemini is unavailable.

## AI services used

All AI features use the **Google Gemini API** through the `@google/genai` SDK. The model is set by the `GEMINI_MODEL` environment variable, which defaults to `gemini-3.5-flash`. If it is overloaded or unavailable, the API falls back through `GEMINI_FALLBACK_MODELS` (`gemini-3.5-flash-lite`, then `gemini-3.1-flash-lite`).

| Feature | What Gemini does |
|---|---|
| Worker voice sign-up | Understands Urdu or Punjabi-Urdu speech, transcribes it, and returns a structured profile as JSON |
| Customer problem description | Reads voice, text or a photo, and detects the trade, urgency and an estimated price range |
| Voice notes | Transcribes each note and shows the text under it |
| Past-work photos | Turns photos into skill tags |
| CNIC photo | Reads the CNIC number so that a salted hash can be stored and duplicates blocked |
| Job card | Generates the task, area, time and agreed price for both sides to confirm |
| Reviews | Summarises a voice review into short trust tags such as "waqt ka paband" |

Jev is not an AI service. It is local code, and every transcript and search also runs through it. Without Gemini, typed search and typed sign-up still work, but voice and photo understanding do not.

## AI coding assistants used

- **Claude Code** (Anthropic), used to build this project.
- **Claude** on claude.ai (Anthropic), used to produce the design mockups submitted separately.
- **Codex** (OpenAI). `TODO: confirm` whether Codex was used on this project, and remove this line if not.

## Seeded / Mocked

These parts are not real, and the product does not present them as real.

| Item | What is actually happening |
|---|---|
| **OTP** | Mocked. No SMS is sent, and the code is shown on screen. |
| **Payments** | Not implemented. The app records the agreed price, and customer and worker settle it between themselves. Earnings are a log of agreed job prices, not money moved through the app. |
| **CNIC verification** | Not verified against any government record, including NADRA. The number is read from the photo, only its salted SHA-256 hash is stored, and the hash is used to block duplicate accounts. |
| **Demo data** | Seeded: at least 40 workers across 9 categories in Islamabad and Rawalpindi sectors, 3 crews, 15 past jobs, 10 customers, 1 admin and 1 agent. All names, phone numbers, coordinates, ratings and reviews are fictional. |
| **Field-agent signup fee** | Collection is mocked. The fee (default Rs 200) and the agent's and platform's shares are recorded in a ledger, but no money is collected or paid out. |

## Known limitations

- There is no NADRA or other government identity verification. It is out of scope.
- A worker is busy from booking confirmation until the job ends, even if the start date is a few days away. This is what guarantees no double-booking, and it means there is no calendar-style booking around other jobs.
- Browsers cannot set a device's screen brightness. Sunlight mode only switches to a maximum-contrast palette with larger text.
- Keeping the screen awake uses the Screen Wake Lock API, which depends on browser support.
- Web Push on iPhone works only after the app is installed to the home screen, on iOS 16.4 or later.
- Voice recording, push notifications and installation need HTTPS and the user's permission.
- Voice and photo understanding need the Gemini API and a network connection.
- Map tiles come from the public OpenStreetMap servers, which suit a demo but not heavy production traffic.
- Live updates run in a single API process, so running more than one instance would need a shared message channel.

## Open-source libraries

Thanks to the authors of these projects. All project-specific code in this repository was written fresh for it.

### Runtime: web app

| Library | License |
|---|---|
| [React](https://react.dev) and React DOM | MIT |
| [React Router](https://reactrouter.com) | MIT |
| [Leaflet](https://leafletjs.com) | BSD-2-Clause |
| [Driver.js](https://driverjs.com) | MIT |
| [idb](https://github.com/jakearchibald/idb) | ISC |
| [browser-image-compression](https://github.com/Donaldcwl/browser-image-compression) | MIT |
| [Lucide React](https://lucide.dev) | ISC |
| [Workbox](https://developer.chrome.com/docs/workbox) (workbox-window) | MIT |
| [Noto Nastaliq Urdu](https://fontsource.org/fonts/noto-nastaliq-urdu) via Fontsource | OFL-1.1 |
| [Zod](https://zod.dev) | MIT |

### Runtime: API

| Library | License |
|---|---|
| [Fastify](https://fastify.dev) | MIT |
| @fastify/cors, @fastify/multipart, @fastify/rate-limit, @fastify/static, @fastify/websocket | MIT |
| [Prisma](https://www.prisma.io) (prisma and @prisma/client) | Apache-2.0 |
| [Zod](https://zod.dev) | MIT |
| [jose](https://github.com/panva/jose) | MIT |
| [sharp](https://sharp.pixelplumbing.com) | Apache-2.0 |
| [web-push](https://github.com/web-push-libs/web-push) | MPL-2.0 |
| [Google Gen AI SDK](https://github.com/googleapis/js-genai) (@google/genai) | Apache-2.0 |

### Build and test tools

| Library | License |
|---|---|
| [TypeScript](https://www.typescriptlang.org) | Apache-2.0 |
| [Turborepo](https://turborepo.com) | MIT |
| [Vite](https://vite.dev) and @vitejs/plugin-react | MIT |
| [vite-plugin-pwa](https://vite-pwa-org.netlify.app) | MIT |
| [Tailwind CSS](https://tailwindcss.com) | MIT |
| [PostCSS](https://postcss.org) and [Autoprefixer](https://github.com/postcss/autoprefixer) | MIT |
| [Vitest](https://vitest.dev) | MIT |
| [Playwright](https://playwright.dev) | Apache-2.0 |
| [tsup](https://tsup.egoist.dev) | MIT |
| [tsx](https://tsx.is) | MIT |
| Type definitions from [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) (@types/*) | MIT |

### Services and data

- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, under the Open Database License.
- PostgreSQL, Caddy and Node.js run the production server.
