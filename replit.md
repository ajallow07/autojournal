# Körjournal - Tesla Model Y Driver's Journal

## Overview
A Swedish driver's journal (körjournal) application for logging and managing car trips for a Tesla Model Y based in Stockholm, Sweden. Supports multi-user authentication (Google, email, etc.), business/private trip classification, odometer tracking, comprehensive reports with CSV export, and Tesla API integration for automatic trip logging.

## Recent Changes
- 2026-02-16: Added multi-user authentication via Replit Auth (supports Google, GitHub, Apple, email login)
- 2026-02-16: Added userId to all tables (vehicles, trips, tesla_connections, geofences) for multi-user data isolation
- 2026-02-16: Added landing page for logged-out users, User Profile page
- 2026-02-16: Added Tesla API integration with OAuth flow, automatic trip detection, geofencing, and reverse geocoding
- 2026-02-16: Initial MVP built with full CRUD for trips and vehicles, dashboard, trip log, reports, and vehicle settings

## Tech Stack
- Frontend: React + Vite + TanStack Query + Wouter + Shadcn UI + Tailwind CSS
- Backend: Express + Drizzle ORM + PostgreSQL
- Auth: Replit Auth (OpenID Connect) with Passport.js
- Language: TypeScript

## Project Architecture
```
client/src/
  App.tsx           - Main app with auth gating, sidebar layout, and routing
  components/
    app-sidebar.tsx - Navigation sidebar with user profile and Tesla status
    theme-toggle.tsx - Dark/light mode toggle
  hooks/
    use-auth.ts     - Authentication hook (useAuth)
  lib/
    auth-utils.ts   - Auth error handling utilities
    theme-provider.tsx - Theme context
  pages/
    landing.tsx     - Landing page for logged-out users
    profile.tsx     - User Profile page with account info and logout
    dashboard.tsx   - Overview with stats and recent trips
    trip-log.tsx    - Filterable/searchable trip list
    trip-form.tsx   - Add/edit trip form
    trip-detail.tsx - Individual trip view
    reports.tsx     - Monthly/custom/yearly reports with CSV export
    vehicle.tsx     - Vehicle settings management
    tesla.tsx       - Tesla connection, geofence management

server/
  db.ts       - Shared database connection (drizzle + pg pool)
  routes.ts   - API endpoints with auth middleware
  storage.ts  - Database storage layer with userId filtering
  tesla.ts    - Tesla API service (multi-user polling, trip detection)
  seed.ts     - Database seeding (minimal)
  replit_integrations/auth/ - Replit Auth module (OIDC, passport, sessions)

shared/
  schema.ts       - Drizzle schema (all tables include userId column)
  models/auth.ts  - Users and sessions tables for auth
```

## Authentication
- Replit Auth via OpenID Connect (supports Google, GitHub, Apple, email/password)
- Auth routes: /api/login, /api/logout, /api/callback, /api/auth/user
- All API routes protected with isAuthenticated middleware
- Each user has isolated data (vehicles, trips, Tesla connections, geofences)
- Sessions stored in PostgreSQL (sessions table)

## API Endpoints (all require authentication)
- GET/POST /api/vehicles, GET/PATCH /api/vehicles/:id
- GET/POST /api/trips, GET/PATCH/DELETE /api/trips/:id
- GET /api/tesla/status, GET /api/tesla/auth, GET /api/tesla/callback
- POST /api/tesla/disconnect, POST /api/tesla/poll, POST /api/tesla/link-vehicle
- GET/POST /api/geofences, PATCH/DELETE /api/geofences/:id
- GET /api/auth/user (current authenticated user)

## Tesla Integration
- OAuth 2.0 flow with Tesla Fleet API (EU endpoint: fleet-api.prd.eu.vn.cloud.tesla.com)
- Requires TESLA_CLIENT_ID and TESLA_CLIENT_SECRET secrets
- Multi-user polling: polls all active Tesla connections every 30s
- Reverse geocoding via OpenStreetMap Nominatim
- Geofencing for automatic business/private classification per user
- Trips marked with autoLogged=true when created by Tesla integration

## Key Features
- Multi-user authentication with Google login support
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
