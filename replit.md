# Mahlis Auto Journal - Smart Driver's Journal

## Overview
Mahlis Auto Journal — a smart driver's journal application for logging and managing car trips for Tesla vehicles, based in Stockholm, Sweden. Supports multi-user authentication (Google OAuth, username/password), business/private trip classification, odometer tracking, comprehensive reports with CSV export, and Teslemetry webhook integration for automatic trip logging.

## Recent Changes
- 2026-02-18: Removed direct Tesla API polling — now Teslemetry-only (deleted server/tesla.ts)
- 2026-02-18: Removed Tesla OAuth routes (auth, callback, register, poll) — connection via Teslemetry only
- 2026-02-18: Simplified Tesla page frontend to Teslemetry-only UI
- 2026-02-18: Added Teslemetry webhook integration with real-time telemetry
- 2026-02-18: New endpoints: POST /api/teslemetry/webhook (unauthenticated), POST /api/teslemetry/connect, POST /api/teslemetry/refresh
- 2026-02-17: Removed manual vehicle addition — vehicles are only created automatically via Tesla connection
- 2026-02-17: Multi-vehicle management with per-vehicle edit/delete; delete protection if trips exist (409)
- 2026-02-17: Removed manual trip entry from Dashboard - trips auto-logged only via Tesla
- 2026-02-16: Replaced Replit Auth with custom auth (username/password + Google OAuth via passport-local/passport-google-oauth20)
- 2026-02-16: Added userId to all tables (vehicles, trips, tesla_connections, geofences) for multi-user data isolation
- 2026-02-16: Added auth page with login/register form and Google OAuth button
- 2026-02-16: Added Tesla API integration with OAuth flow, automatic trip detection, geofencing, and reverse geocoding
- 2026-02-16: Initial MVP built with full CRUD for trips and vehicles, dashboard, trip log, reports, and vehicle settings

## Tech Stack
- Frontend: React + Vite + TanStack Query + Wouter + Shadcn UI + Tailwind CSS
- Backend: Express + Drizzle ORM + PostgreSQL
- Auth: Custom auth with Passport.js (passport-local + passport-google-oauth20), bcrypt password hashing
- Language: TypeScript

## Project Architecture
```
client/src/
  App.tsx           - Main app with auth gating, sidebar layout, and routing
  components/
    app-sidebar.tsx - Navigation sidebar with user profile and Tesla status
    theme-toggle.tsx - Dark/light mode toggle
  hooks/
    use-auth.ts     - Authentication hook (useAuth) with login/register/logout mutations
  lib/
    queryClient.ts  - TanStack Query client with apiRequest helper
    theme-provider.tsx - Theme context
  pages/
    auth-page.tsx   - Login/register page with Google OAuth button
    profile.tsx     - User Profile page with account info and logout
    dashboard.tsx   - Overview with stats and recent trips
    trip-log.tsx    - Filterable/searchable trip list
    trip-form.tsx   - Add/edit trip form
    trip-detail.tsx - Individual trip view
    reports.tsx     - Monthly/custom/yearly reports with CSV export
    vehicle.tsx     - Vehicle settings management
    tesla.tsx       - Tesla connection, geofence management

server/
  auth.ts        - Custom auth module (passport-local, passport-google-oauth20, bcrypt, sessions)
  db.ts          - Shared database connection (drizzle + pg pool)
  routes.ts      - API endpoints with auth middleware
  storage.ts     - Database storage layer with userId filtering
  teslemetry.ts  - Teslemetry webhook handler, REST API client, trip detection
  seed.ts        - Database seeding (minimal)

shared/
  schema.ts       - Drizzle schema (all tables include userId column)
  models/auth.ts  - Users and sessions tables (username, passwordHash, googleId columns)
```

## Authentication
- Custom auth via Passport.js with two strategies:
  - passport-local: username/password with bcrypt hashing (10 rounds)
  - passport-google-oauth20: Direct Google OAuth (requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)
- Auth routes: POST /api/auth/register, POST /api/auth/login, GET /api/auth/google, GET /api/auth/google/callback, POST /api/auth/logout, GET /api/auth/user
- All API routes protected with isAuthenticated middleware
- Each user has isolated data (vehicles, trips, Tesla connections, geofences)
- Sessions stored in PostgreSQL (sessions table) with 1-week TTL
- Required secrets: SESSION_SECRET (set), GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (optional, for Google login)

## API Endpoints (all require authentication unless noted)
- GET /api/vehicles, GET/PATCH/DELETE /api/vehicles/:id
- GET/POST /api/trips, GET/PATCH/DELETE /api/trips/:id
- GET /api/tesla/status, POST /api/tesla/disconnect, POST /api/tesla/link-vehicle
- POST /api/teslemetry/webhook (**unauthenticated** - receives Teslemetry telemetry data)
- POST /api/teslemetry/connect (connects via Teslemetry API, creates vehicle + connection)
- POST /api/teslemetry/refresh (fetches latest vehicle_data from Teslemetry API)
- GET/POST /api/geofences, PATCH/DELETE /api/geofences/:id
- POST /api/auth/register, POST /api/auth/login, POST /api/auth/logout
- GET /api/auth/user, GET /api/auth/google, GET /api/auth/google/callback

## Teslemetry Integration
- Uses Teslemetry (teslemetry.com) as the sole integration for Tesla Fleet Telemetry (no direct polling)
- Requires TESLEMETRY_API_TOKEN secret (get from Teslemetry dashboard)
- Webhook endpoint: POST /api/teslemetry/webhook receives real-time telemetry data
- Supports both typed key-value array and simplified object webhook formats
- VIN extraction from body.vin, body.vehicle.vin, or body.metadata.vin
- Trip detection logic: shift_state D/R/N = driving, P/SNA = parked, 2-min park confirmation
- Odometer from webhook is in miles, converted to km (* 1.60934) in parse step
- REST API: fetches vehicle list and vehicle_data on demand (for Refresh button)
- Auto-creates vehicle from VIN when connecting via Teslemetry
- Optional TESLEMETRY_WEBHOOK_SECRET for webhook endpoint auth (Bearer token validation)
- Reverse geocoding via OpenStreetMap Nominatim
- Geofencing for automatic business/private classification per user
- Trips marked with autoLogged=true when created by Teslemetry
- GPS distance fallback when odometer unavailable; noted in trip notes
- Setup: Add TESLEMETRY_API_TOKEN → Connect via Teslemetry button → Copy webhook URL to Teslemetry dashboard
- Vehicle must have "Allow Third-Party App Data Streaming" enabled in Settings → Safety

## Key Features
- Multi-user authentication with username/password and Google login
- Tesla-only vehicle management (vehicles auto-created when Tesla connects)
- Automatic trip logging with odometer, locations, time, and purpose (via Teslemetry)
- Business/private trip classification (manual or via geofences)
- Monthly, custom period, and yearly overview reports
- CSV export for tax/accounting
- Teslemetry webhook integration for real-time trip logging (per user)
- Geofencing for automatic trip categorization
- User Profile page with account info
- Dark/light mode

## User Preferences
- Location: Stockholm, Sweden
- Vehicle: Tesla Model Y
- Uses Swedish locale for number formatting (sv-SE)
