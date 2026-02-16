# Körjournal - Tesla Model Y Driver's Journal

## Overview
A Swedish driver's journal (körjournal) application for logging and managing car trips for a Tesla Model Y based in Stockholm, Sweden. Supports business/private trip classification, odometer tracking, and comprehensive reports with CSV export.

## Recent Changes
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
    app-sidebar.tsx - Navigation sidebar
    theme-toggle.tsx - Dark/light mode toggle
  pages/
    dashboard.tsx   - Overview with stats and recent trips
    trip-log.tsx    - Filterable/searchable trip list
    trip-form.tsx   - Add/edit trip form
    trip-detail.tsx - Individual trip view
    reports.tsx     - Monthly/custom/yearly reports with CSV export
    vehicle.tsx     - Vehicle settings management
  lib/
    theme-provider.tsx - Theme context

server/
  routes.ts   - API endpoints (/api/trips, /api/vehicles)
  storage.ts  - Database storage layer with Drizzle ORM
  seed.ts     - Seed data with realistic Stockholm trips

shared/
  schema.ts   - Drizzle schema (vehicles, trips tables)
```

## API Endpoints
- GET/POST /api/vehicles, GET/PATCH /api/vehicles/:id
- GET/POST /api/trips, GET/PATCH/DELETE /api/trips/:id

## Key Features
- Trip logging with odometer, locations, time, and purpose
- Business/private trip classification
- Monthly, custom period, and yearly overview reports
- CSV export for tax/accounting
- Dark/light mode
- Seed data with realistic Stockholm-area trips

## User Preferences
- Location: Stockholm, Sweden
- Vehicle: Tesla Model Y
- Uses Swedish locale for number formatting (sv-SE)
