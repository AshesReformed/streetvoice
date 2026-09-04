# StreetVoice

Voice-first civic complaint platform for Pakistan. Citizens call a phone number, speak a complaint in a regional language, and the system transcribes, translates, classifies, and routes it to the appropriate government department.

## Architecture

- **Frontend + API**: Next.js App Router (deployed to Vercel)
- **Database/Auth/Storage**: Supabase (Postgres + Auth + RLS)
- **External Services**: ASR, Translation, Classification — pluggable interfaces with mock implementations

## Quick Start

### Prerequisites
- Node.js 18+
- A Supabase project (free tier works)

### Setup

1. Clone and install dependencies:
   ```bash
   cd streetvoice
   npm install
   ```

2. Configure environment:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your Supabase project URL and keys
   ```

3. Apply database migrations:
   Run the SQL files in `supabase/migrations/` in order against your Supabase project:
   - `001_initial_schema.sql` — tables, indexes, triggers
   - `002_rls_policies.sql` — Row Level Security policies
   - `003_seed_data.sql` — seed departments

4. Seed officer accounts (one-time):
   ```bash
   npm run seed:officers
   ```
   This creates test accounts:
   - Admin: `admin@streetvoice.pk` / `admin123456`
   - Officers: `water.officer@streetvoice.pk`, `electricity.officer@streetvoice.pk`, etc. (password: `officer123456`)

5. Start dev server:
   ```bash
   npm run dev
   ```

### Test Accounts

| Email | Password | Role | Department |
|-------|----------|------|------------|
| admin@streetvoice.pk | admin123456 | Admin | All departments |
| water.officer@streetvoice.pk | officer123456 | Officer | Water & Sanitation |
| electricity.officer@streetvoice.pk | officer123456 | Officer | Electricity |
| roads.officer@streetvoice.pk | officer123456 | Officer | Roads & Infrastructure |
| waste.officer@streetvoice.pk | officer123456 | Officer | Sanitation & Waste |
| general.officer@streetvoice.pk | officer123456 | Officer | General/Unclassified |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/calls/webhook | Webhook secret | Telephony call intake pipeline |
| GET | /api/complaints/status/:trackingId | None | Public status check (returns status + dept only) |
| GET | /api/complaints | Officer/Admin | List complaints (RLS-filtered) |
| PATCH | /api/complaints/:id/status | Officer/Admin | Update complaint status |
| PATCH | /api/complaints/:id | Admin | Re-route complaint to different department |
| GET/POST | /api/departments | Admin | List/create departments |
| PATCH | /api/departments/:id | Admin | Update department |
| GET/POST | /api/officers | Admin | List/create officers |
| GET | /api/dashboard/summary | Officer/Admin | Dashboard statistics |
| GET | /api/health | None | Health check |

## External Service Interfaces

All external services (ASR, Translation, Classification) are behind pluggable TypeScript interfaces in `src/lib/services/`. Mock implementations ship by default — no paid API keys required.

To swap in a real provider, implement the interface and update the factory in `src/lib/services/index.ts`.

## Testing

```bash
# Run unit tests
npm test

# Run with integration tests (requires running Supabase)
RUN_INTEGRATION_TESTS=true npm test
```

## Project Structure

```
streetvoice/
├── src/
│   ├── app/
│   │   ├── api/          # API route handlers
│   │   ├── admin/        # Admin portal pages
│   │   ├── portal/       # Officer portal pages
│   │   ├── login/        # Authentication
│   │   └── track/        # Public status check (dev/demo)
│   ├── components/       # Shared UI components
│   │   └── ui/           # shadcn/ui primitives
│   └── lib/
│       ├── services/     # External service interfaces + mocks
│       ├── pipeline/     # Call processing pipeline
│       ├── supabase/     # Supabase client utilities
│       ├── middleware/    # Auth middleware helpers
│       ├── validation/   # Zod schemas
│       ├── hooks/        # React hooks
│       └── types/        # TypeScript types
├── supabase/
│   └── migrations/       # SQL schema + RLS + seed data
├── scripts/
│   └── seed-officers.ts  # One-time officer seeding script
└── .env.example
```

## Key Design Decisions

- **Postgres RLS** enforces department isolation at the database layer, not just the app layer
- **Tracking IDs** use a Postgres sequence (SV-000001, SV-000002...) for guaranteed uniqueness
- **Status history trigger** auto-records every status change, regardless of which code path triggers it
- **Low-confidence gate**: complaints with ASR confidence < 0.6 or classification confidence < 0.5 are never auto-routed — they go to "needs_review" for manual triage
- **Anonymous filing**: citizen_id is nullable throughout, so callers without caller ID still get their complaints registered
