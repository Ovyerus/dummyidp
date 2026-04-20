# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Commands

```bash
npm install        # install dependencies
npm run dev        # start development server
npm run build      # production build
```

There is no test suite or lint command configured.

## Architecture

DummyIDP is a Next.js 14 app that emulates a SAML Identity Provider (IDP) and
SCIM server, used to test SAML/SCIM support in service provider ("SP")
applications.

### Hybrid router setup

The app uses **both** the App Router and Pages Router simultaneously:

- `src/app/` — App Router: handles server-side routes
  - `src/app/actions.ts` — Next.js server actions (createApp, upsertApp)
  - `src/app/apps/[id]/sso/route.ts` — receives SAML `AuthnRequest` POSTs
    (HTTP-POST binding), redirects to the login page
  - `src/app/apps/[id]/metadata/route.ts` — serves SAML IDP metadata XML
  - `src/app/instant-setup/route.ts` — one-step URL to configure an app and
    redirect to login
  - `src/app/page.tsx` / `src/app/layout.tsx` — root home page and layout

- `src/pages/` — Pages Router: handles client-rendered UI and API routes
  - `src/pages/apps/[id].tsx` — app configuration dashboard
  - `src/pages/apps/[id]/login.tsx` — "simulate login" page; reads `SAMLRequest`
    query param
  - `src/pages/api/apps.ts` — REST API used by client components (GET/POST an
    `App`)
  - `src/pages/_app.tsx` — wraps all pages in TanStack Query provider

### Data model and storage

All state is persisted in **Vercel KV** (Redis via `@vercel/kv`). Each "App" is
stored as a hash keyed by its ULID-based `id` (`app_<ulid>`). The `App` type in
`src/lib/app.ts` is the central entity:

```ts
type App = {
  id: string;
  users: AppUser[]; // list of simulated users
  spAcsUrl?: string; // SP's Assertion Consumer Service URL
  spEntityId?: string; // SP entity ID
  scimBaseUrl?: string; // optional SCIM base URL
  scimBearerToken?: string; // optional SCIM bearer token
};
```

Local development requires KV credentials in `.env.development.local`. Copy the
template from an existing Vercel project or use `vercel env pull`.

### SAML flow

1. SP sends an `AuthnRequest` to `POST /apps/[id]/sso` (HTTP-POST binding) or
   directly navigates to `GET /apps/[id]/login` (HTTP-Redirect binding)
2. `sso/route.ts` decodes the form POST and redirects to the login page with
   query params forwarded
3. The login page (`/apps/[id]/login`) renders `LoginCard`, which lets a user
   select a configured identity to simulate
4. On submit, `LoginCard` calls `encodeAssertion()` from `src/lib/saml.ts` to
   build and sign a SAML response, then POSTs it to the SP's ACS URL

The SAML signing uses a **single hardcoded RSA key pair** in
`src/lib/insecure-cert.ts` — this is intentional; DummyIDP is a testing tool and
the private key is public by design.

### SCIM sync

When an `App` is saved with `scimBaseUrl` + `scimBearerToken`, `upsertApp()` in
`src/lib/app.ts` performs a stateless sync: for each user, it calls
`GET /Users?filter=userName eq "email"` to look up existing SCIM user IDs, then
PUT (update) or POST (create). Deleted users are DELETEd. The SCIM `/Users` list
response supports both `Resources` and `resources` keys.

### Client data fetching

Pages-Router pages are client-rendered and fetch data via:

- `useApp(id)` — `GET /api/apps?id=<id>`
- `useUpsertApp()` — `POST /api/apps?id=<id>`

Both are defined in `src/lib/hooks.ts` using TanStack Query.

### URL helpers

`src/lib/app.ts` exports helpers that build IDP URLs:

- `appIdpEntityId(app)` — always uses `dummyidp.com` as the base (hardcoded)
- `appIdpRedirectUrl`, `appIdpMetadataUrl`, `appLoginUrl` — use
  `NEXT_PUBLIC_DUMMYIDP_CUSTOM_DOMAIN` or fall back to `VERCEL_URL`

### UI

Components use shadcn/ui (Radix UI + Tailwind). Form state is managed with
`react-hook-form` + `zod`. Toasts use `sonner`.
