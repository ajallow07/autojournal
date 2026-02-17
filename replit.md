# Mahlis Auto Journal - Smart Driver's Journal

## Overview
Mahlis Auto Journal — a smart driver's journal application for logging and managing car trips for Tesla vehicles, based in Stockholm, Sweden. Supports multi-user authentication (Google OAuth, username/password), business/private trip classification, odometer tracking, comprehensive reports with CSV export, and Tesla API integration for automatic trip logging.

## Recent Changes
- 2026-02-17: Removed manual vehicle addition — vehicles are only created automatically via Tesla connection
- 2026-02-17: Removed Biluppgifter vehicle lookup endpoint (no longer needed with Tesla-only vehicles)
- 2026-02-17: Refactored Tesla polling to "perfect" journal strategy: trigger poll checks shift_state, P→D starts trip with odometer, 2-min park confirmation before ending trip, GPS backup for route
- 2026-02-17: Polling intervals: 1min driving/monitoring, 2min idle; parkedSince/lastShiftState columns added for park confirmation
- 2026-02-17: Trip completion extracted to separate completeTrip() function for cleaner code
- 2026-02-17: GPS haversine distance as fallback when odometer data unavailable
- 2026-02-17: Vehicle odometer auto-updates after each trip; GPS-estimated trips noted in trip notes
- 2026-02-17: Auto-create vehicle when Tesla connects (VIN parsing for model detection)
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
  auth.ts     - Custom auth module (passport-local, passport-google-oauth20, bcrypt, sessions)
  db.ts       - Shared database connection (drizzle + pg pool)
  routes.ts   - API endpoints with auth middleware
  storage.ts  - Database storage layer with userId filtering
  tesla.ts    - Tesla API service (multi-user polling, trip detection)
  seed.ts     - Database seeding (minimal)

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

## API Endpoints (all require authentication)
- GET /api/vehicles, GET/PATCH/DELETE /api/vehicles/:id
- GET/POST /api/trips, GET/PATCH/DELETE /api/trips/:id
- GET /api/tesla/status, GET /api/tesla/auth, GET /api/tesla/callback
- POST /api/tesla/disconnect, POST /api/tesla/poll, POST /api/tesla/link-vehicle
- GET/POST /api/geofences, PATCH/DELETE /api/geofences/:id
- POST /api/auth/register, POST /api/auth/login, POST /api/auth/logout
- GET /api/auth/user, GET /api/auth/google, GET /api/auth/google/callback

## Tesla Integration
- OAuth 2.0 flow with Tesla Fleet API (EU endpoint: fleet-api.prd.eu.vn.cloud.tesla.com)
- Requires TESLA_CLIENT_ID and TESLA_CLIENT_SECRET secrets
- **Sleep-Aware State Machine** polling algorithm with 4 states:
  - **DEEP_SLEEP**: Vehicle asleep/offline. Only polls lightweight `/vehicles` endpoint (no wake) every 10min
  - **AWAKE_IDLE**: Vehicle online but parked. Polls `/vehicle_data` every 90s to detect P→D transition
  - **ACTIVE_TRIP**: Vehicle driving. Polls `/vehicle_data` every 30s for GPS/odometer tracking
  - **SLEEP_PENDING**: Idle >15min without charging. Stops `/vehicle_data` calls, only checks `/vehicles` every 60s to let car sleep (prevents vampire drain)
- Endpoint separation: `/vehicles/{id}` (state check, doesn't wake car) vs `/vehicle_data` (full payload, resets sleep timer)
- 2-min park confirmation before ending trip (prevents false trip-ends at red lights)
- Sleep allowance: after 15min idle, stops polling vehicle_data to allow car's ~15min sleep timer
- Error resilience: 408/429 errors handled gracefully in ALL states (deep_sleep, sleep_pending stay put; active_trip keeps trip open; force-closes after 10min)
- Token refresh with 60s buffer before expiry to prevent missed trip starts
- Wake-up with retry (3 attempts) when trip needs completing and car sleeps; resets error counters on successful wake
- Sleep-pending → awake_idle preserves idleSince to prevent infinite sleep-loop (vampire drain protection)
- **Crash recovery**: All trip state persisted in DB (tripInProgress, tripStartTime, odometer, GPS, pollState, idleSince). On server restart, initTeslaPolling detects in-progress trips and corrects pollState to active_trip if stuck in deep_sleep/sleep_pending
- Reverse geocoding via OpenStreetMap Nominatim
- Geofencing for automatic business/private classification per user
- Trips marked with autoLogged=true when created by Tesla integration
- GPS distance fallback when odometer unavailable; noted in trip notes
- Schema columns: pollState, idleSince, consecutiveErrors, lastApiErrorAt for state machine tracking

## Key Features
- Multi-user authentication with username/password and Google login
- Tesla-only vehicle management (vehicles auto-created when Tesla connects)
- Automatic trip logging with odometer, locations, time, and purpose (Tesla API)
- Business/private trip classification (manual or via geofences)
- Monthly, custom period, and yearly overview reports
- CSV export for tax/accounting
- Tesla API integration for real-time trip logging (per user)
- Geofencing for automatic trip categorization
- User Profile page with account info
- Dark/light mode

## User Preferences
- Location: Stockholm, Sweden
- Vehicle: Tesla Model Y
- Uses Swedish locale for number formatting (sv-SE)
