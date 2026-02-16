# Körjournal - Tesla Model Y Driver's Journal

## Overview
A Swedish driver's journal (körjournal) application for logging and managing car trips for a Tesla Model Y based in Stockholm, Sweden. Supports business/private trip classification, odometer tracking, comprehensive reports with CSV export, and Tesla API integration for automatic trip logging.

## Recent Changes
- 2026-02-16: Added Tesla API integration with OAuth flow, automatic trip detection, geofencing, and reverse geocoding
- 2026-02-16: Initial MVP built with full CRUD for trips and vehicles, dashboard, trip log, reports, and vehicle settings

## Tech Stack
- Frontend: React + Vite + TanStack Query + Wouter + Shadcn UI + Tailwind CSS
- Backend: Express + Drizzle ORM + PostgreSQL
- Language: TypeScript

## Project Architecture
```
client/src/
  App.tsx           - Main app with sidebar layout and routing
  components/
    app-sidebar.tsx - Navigation sidebar with Tesla status indicator
    theme-toggle.tsx - Dark/light mode toggle
  pages/
    dashboard.tsx   - Overview with stats and recent trips
    trip-log.tsx    - Filterable/searchable trip list
    trip-form.tsx   - Add/edit trip form
    trip-detail.tsx - Individual trip view
    reports.tsx     - Monthly/custom/yearly reports with CSV export
    vehicle.tsx     - Vehicle settings management
    tesla.tsx       - Tesla connection, geofence management
  lib/
    theme-provider.tsx - Theme context

server/
  routes.ts   - API endpoints (/api/trips, /api/vehicles, /api/tesla/*, /api/geofences)
  storage.ts  - Database storage layer with Drizzle ORM
  tesla.ts    - Tesla API service (OAuth, polling, trip detection, geocoding)
  seed.ts     - Seed data with realistic Stockholm trips

shared/
  schema.ts   - Drizzle schema (vehicles, trips, tesla_connections, geofences tables)
```

## API Endpoints
- GET/POST /api/vehicles, GET/PATCH /api/vehicles/:id
- GET/POST /api/trips, GET/PATCH/DELETE /api/trips/:id
- GET /api/tesla/status, GET /api/tesla/auth, GET /api/tesla/callback
- POST /api/tesla/disconnect, POST /api/tesla/poll, POST /api/tesla/link-vehicle
- GET/POST /api/geofences, PATCH/DELETE /api/geofences/:id

## Tesla Integration
- OAuth 2.0 flow with Tesla Fleet API (EU endpoint: fleet-api.prd.eu.vn.cloud.tesla.com)
- Requires TESLA_CLIENT_ID and TESLA_CLIENT_SECRET secrets
- Automatic trip detection via drive state polling (30s interval)
- Reverse geocoding via OpenStreetMap Nominatim
- Geofencing for automatic business/private classification
- Trips marked with autoLogged=true when created by Tesla integration

## Key Features
- Manual and automatic trip logging with odometer, locations, time, and purpose
- Business/private trip classification (manual or via geofences)
- Monthly, custom period, and yearly overview reports
- CSV export for tax/accounting
- Tesla API integration for real-time trip logging
- Geofencing for automatic trip categorization
- Dark/light mode
- Seed data with realistic Stockholm-area trips

## User Preferences
- Location: Stockholm, Sweden
- Vehicle: Tesla Model Y
- Uses Swedish locale for number formatting (sv-SE)
