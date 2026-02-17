# Körjournal - Tesla Model Y Driver's Journal

## Overview
A Swedish driver's journal (körjournal) application for logging and managing car trips for a Tesla Model Y based in Stockholm, Sweden. Supports multi-user authentication (Google OAuth, username/password), business/private trip classification, odometer tracking, comprehensive reports with CSV export, and Tesla API integration for automatic trip logging.

## Recent Changes
- 2026-02-17: Fixed trip detection to use GPS haversine distance as fallback when Tesla API doesn't provide odometer data
- 2026-02-17: Fixed stuck trip state - trips now complete even without odometer readings
- 2026-02-17: Added debug logging for Tesla API polling to diagnose data issues
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
- GET/POST /api/vehicles, GET/PATCH /api/vehicles/:id
- GET/POST /api/trips, GET/PATCH/DELETE /api/trips/:id
- GET /api/tesla/status, GET /api/tesla/auth, GET /api/tesla/callback
- POST /api/tesla/disconnect, POST /api/tesla/poll, POST /api/tesla/link-vehicle
- GET/POST /api/geofences, PATCH/DELETE /api/geofences/:id
- POST /api/auth/register, POST /api/auth/login, POST /api/auth/logout
- GET /api/auth/user, GET /api/auth/google, GET /api/auth/google/callback

## Tesla Integration
- OAuth 2.0 flow with Tesla Fleet API (EU endpoint: fleet-api.prd.eu.vn.cloud.tesla.com)
- Requires TESLA_CLIENT_ID and TESLA_CLIENT_SECRET secrets
- Multi-user polling: polls all active Tesla connections every 30s
- Reverse geocoding via OpenStreetMap Nominatim
- Geofencing for automatic business/private classification per user
- Trips marked with autoLogged=true when created by Tesla integration

## Key Features
- Multi-user authentication with username/password and Google login
- Manual and automatic trip logging with odometer, locations, time, and purpose
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
