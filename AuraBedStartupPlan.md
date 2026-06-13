# AuraBed — Hospital Resource Availability & Booking Platform
## Complete Startup Implementation Plan

> **Version:** 1.0 | **Date:** June 2026 | **Stage:** Pre-seed / MVP to Production

---

## Table of Contents

1. [Product Vision & Mission](#1-product-vision--mission)
2. [Full Feature Scope](#2-full-feature-scope)
3. [System Architecture](#3-system-architecture)
4. [Database Schema (Complete)](#4-database-schema-complete)
5. [Resource Category Catalogue](#5-resource-category-catalogue)
6. [Authentication Strategy](#6-authentication-strategy)
7. [API Design](#7-api-design)
8. [Implementation Phases (Step-by-Step)](#8-implementation-phases-step-by-step)
9. [Pricing Strategy](#9-pricing-strategy)
10. [Scalability Roadmap](#10-scalability-roadmap)
11. [Go-to-Market Strategy](#11-go-to-market-strategy)
12. [Tech Stack Summary](#12-tech-stack-summary)

---

## 1. Product Vision & Mission

**Mission:** Eliminate the life-threatening information gap between patients seeking critical hospital resources and the hospitals that have them.

**Problem:** Every day, families waste precious hours calling hospital after hospital trying to find an available ICU bed, a scan slot, or an OPD appointment. This friction costs lives.

**Solution:** AuraBed is a real-time hospital resource availability and booking platform. It gives the public a live, searchable view of beds, ICU capacity, scan availability, and doctor slots — and gives hospitals a verified, streamlined booking pipeline.

**Target Users:**
- **Public / Patients** — searching for any hospital resource in an emergency or for planned care
- **Hospital Administrators** — managing resource inventory and incoming booking requests
- **Hospital EHR/HIS Systems** — pushing live bed status via secure API
- **Developers / Integrators** — building on top of AuraBed's API

---

## 2. Full Feature Scope

### Public Portal (Patient-Facing)
- Search hospitals by name, location, or resource type
- View real-time resource availability across all categories
- Phone number-based OTP verification before booking
- Submit reservation requests with patient details
- Track reservation status (Pending → Confirmed → Completed)
- Receive SMS and in-app notifications on status changes
- Map view showing nearby hospitals with availability counts

### Hospital Admin Dashboard
- Secure login via hospital API key + admin credentials (RBAC)
- Real-time reservation inbox with sound alerts and flash notifications
- Approve / decline reservations with one click
- Manual override of any resource status
- Bulk update tools (e.g., mark entire ward as occupied)
- Analytics dashboard: occupancy rates, peak hours, category breakdown
- API key management panel (generate, rotate, revoke)
- Staff account management (add/remove admin users per hospital)

### EHR/HIS Integration API
- Authenticated `POST /api/v1/resources/sync` endpoint for live status pushes
- HMAC-signed webhook payloads for payload integrity verification
- Per-hospital API keys with configurable scopes
- Rate limiting and request logging
- Developer sandbox with test hospital and test resources

### Platform Admin (Internal)
- Onboard new hospitals and issue API keys
- Monitor system health, sync throughput, and error rates
- Manage subscription plans and billing
- View global resource map and occupancy trends

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CDN / Edge Layer                           │
│              (Cloudflare / Vercel Edge — Static Assets)             │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────────┐
│                         React Frontend (Vite)                       │
│   Public Portal │ Hospital Admin Dashboard │ Platform Admin         │
└──────────┬─────────────────────┬──────────────────────┬────────────┘
           │ REST API             │ WebSocket            │ REST API
┌──────────▼──────────┐ ┌───────▼──────────┐ ┌────────▼────────────┐
│  Public API Server  │ │  Realtime Server  │ │  Admin API Server   │
│  (Node / Express)   │ │  (Socket.io)      │ │  (Node / Express)   │
└──────────┬──────────┘ └───────┬──────────┘ └────────┬────────────┘
           │                    │                      │
┌──────────▼────────────────────▼──────────────────────▼────────────┐
│                        Application Database                         │
│               PostgreSQL (Supabase) — Primary Store                │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
┌──────────────────────────────▼─────────────────────────────────────┐
│                         Redis (Upstash)                             │
│        Pub/Sub for broadcast │ Rate limiting │ Session cache        │
└─────────────────────────────────────────────────────────────────────┘

External Services:
  ├── Twilio             — OTP SMS + booking notifications
  ├── SendGrid           — Email receipts and admin reports
  ├── Stripe             — Subscription billing (hospital plans)
  └── Mapbox / Google Maps — Hospital location search
```

---

## 4. Database Schema (Complete)

### hospitals
```sql
CREATE TABLE hospitals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  address         TEXT NOT NULL,
  city            TEXT NOT NULL,
  state           TEXT NOT NULL,
  country         TEXT NOT NULL DEFAULT 'India',
  pincode         TEXT,
  latitude        DECIMAL(10,7),
  longitude       DECIMAL(10,7),
  contact_number  TEXT,
  email           TEXT,
  website         TEXT,
  plan            TEXT NOT NULL DEFAULT 'starter',  -- starter | growth | enterprise
  is_active       BOOLEAN DEFAULT TRUE,
  verified        BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### hospital_api_keys
```sql
CREATE TABLE hospital_api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id     UUID REFERENCES hospitals(id) ON DELETE CASCADE,
  key_hash        TEXT NOT NULL UNIQUE,   -- SHA-256 hash of the actual key
  key_prefix      TEXT NOT NULL,          -- First 8 chars for display (e.g. "ab12cd34")
  label           TEXT,                   -- e.g. "Production HIS", "Test Key"
  scopes          TEXT[] DEFAULT '{"sync"}',   -- sync | read | admin
  last_used_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### hospital_admins
```sql
CREATE TABLE hospital_admins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id     UUID REFERENCES hospitals(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'staff',  -- owner | manager | staff
  is_active       BOOLEAN DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### categories
```sql
CREATE TABLE categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,          -- e.g. "General Bed"
  code            TEXT NOT NULL UNIQUE,   -- e.g. "general_bed"
  description     TEXT,
  icon            TEXT,                   -- icon identifier for frontend
  color_hex       TEXT,                   -- UI accent color
  is_active       BOOLEAN DEFAULT TRUE,
  sort_order      INTEGER DEFAULT 0
);
```

### resources
```sql
CREATE TABLE resources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id     UUID REFERENCES hospitals(id) ON DELETE CASCADE,
  category_id     UUID REFERENCES categories(id),
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'available',
                  -- available | reserved | occupied | maintenance | offline
  attributes      JSONB DEFAULT '{}',
  last_synced_at  TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_resources_hospital_category ON resources(hospital_id, category_id);
CREATE INDEX idx_resources_status ON resources(status);
CREATE INDEX idx_resources_attributes ON resources USING GIN(attributes);
```

### verified_users
```sql
CREATE TABLE verified_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           TEXT NOT NULL UNIQUE,   -- E.164 format: +919876543210
  name            TEXT,
  email           TEXT,
  is_verified     BOOLEAN DEFAULT FALSE,
  verified_at     TIMESTAMPTZ,
  otp_code        TEXT,                   -- hashed OTP (cleared after use)
  otp_expires_at  TIMESTAMPTZ,
  otp_attempts    INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_users_phone ON verified_users(phone);
```

### reservations
```sql
CREATE TABLE reservations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id     UUID REFERENCES resources(id),
  user_id         UUID REFERENCES verified_users(id),
  user_name       TEXT NOT NULL,
  user_contact    TEXT NOT NULL,
  user_email      TEXT,
  reason          TEXT,
  status          TEXT NOT NULL DEFAULT 'pending_approval',
                  -- pending_approval | confirmed | declined | cancelled | completed | expired
  notes           TEXT,                   -- admin notes on approval/decline
  reserved_at     TIMESTAMPTZ DEFAULT now(),
  expires_at      TIMESTAMPTZ DEFAULT now() + INTERVAL '15 minutes',
  confirmed_at    TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_reservations_resource ON reservations(resource_id, status);
CREATE INDEX idx_reservations_user ON reservations(user_id);
CREATE INDEX idx_reservations_expires ON reservations(expires_at) WHERE status = 'pending_approval';
```

### sync_logs
```sql
CREATE TABLE sync_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id     UUID REFERENCES hospitals(id),
  api_key_id      UUID REFERENCES hospital_api_keys(id),
  resource_id     UUID REFERENCES resources(id),
  previous_status TEXT,
  new_status      TEXT,
  payload         JSONB,
  ip_address      TEXT,
  response_code   INTEGER,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## 5. Resource Category Catalogue

AuraBed uses a code-based category system. All categories share the same `resources` table — the `category_id` + `attributes` JSONB field handle the differences. New categories can be added at any time without schema changes.

### Inpatient Beds

| Category | Code | Key Attributes |
|---|---|---|
| General Bed | `general_bed` | ward, floor, room_number, ac |
| High Dependency Unit | `hdu_bed` | ward, monitoring_level, oxygen |
| ICU — General | `icu_general` | ventilator_connected, oxygen_monitor, isolation |
| ICU — Cardiac (CCU) | `ccu_bed` | cardiac_monitor, defibrillator, pacemaker_ready |
| ICU — Neonatal (NICU) | `nicu_bed` | incubator_type, phototherapy, weight_capacity_kg |
| ICU — Surgical (SICU) | `sicu_bed` | post_op_type, ventilator_connected, drains |
| ICU — Medical (MICU) | `micu_bed` | ventilator_connected, dialysis_ready, isolation |
| ICU — Paediatric (PICU) | `picu_bed` | age_range, ventilator_connected, weight_kg |
| Maternity / Labour | `maternity_bed` | delivery_room, epidural_available, neonatal_support |
| Isolation Room | `isolation_room` | isolation_type, negative_pressure, anteroom |

### Outpatient / OPD

| Category | Code | Key Attributes |
|---|---|---|
| OPD Doctor Slot | `opd_appointment` | doctor_name, specialty, time_slot, consultation_room, fee |
| Emergency Walk-in | `emergency_slot` | triage_level, estimated_wait_mins |
| Teleconsultation | `tele_consult` | doctor_name, specialty, time_slot, platform |

### Diagnostics & Imaging

| Category | Code | Key Attributes |
|---|---|---|
| MRI Scan Slot | `mri_scan` | machine_model, tesla_strength, contrast_available, time_slot |
| CT Scan Slot | `ct_scan` | machine_model, slice_count, contrast_available, time_slot |
| X-Ray Slot | `xray_slot` | machine_type, digital, time_slot |
| Ultrasound Slot | `ultrasound_slot` | probe_type, doppler_available, time_slot |
| ECG / EEG Slot | `ecg_eeg_slot` | test_type, time_slot, report_time_hours |
| Endoscopy Slot | `endoscopy_slot` | scope_type, sedation_available, time_slot |
| Pathology / Lab | `lab_slot` | test_name, sample_type, time_slot, tat_hours |

### Operation Theatre

| Category | Code | Key Attributes |
|---|---|---|
| OT Slot | `ot_slot` | ot_type, anaesthesia_type, time_slot, surgeon_name |
| Day Surgery Slot | `day_surgery_slot` | procedure_type, time_slot, recovery_bed_included |

### Blood Bank & Pharmacy

| Category | Code | Key Attributes |
|---|---|---|
| Blood Unit | `blood_unit` | blood_group, component_type, units_available |
| Pharmacy Window | `pharmacy_slot` | service_type, time_slot |

> **Adding a new category:** Insert a row into the `categories` table with the new `code` and update the frontend category renderer. No database migration needed.

---

## 6. Authentication Strategy

### A. Patient / Public User Authentication (OTP via Phone)

**Flow:**
```
1. User enters mobile number (E.164 format)
2. POST /api/v1/auth/otp/request
   → Server generates 6-digit OTP
   → Hashed OTP stored in verified_users with 5-minute expiry
   → Twilio sends SMS: "Your AuraBed OTP is 482931. Valid for 5 minutes."
3. User enters OTP
4. POST /api/v1/auth/otp/verify
   → Server validates hash + expiry
   → On success: issue signed JWT (24h expiry)
   → JWT payload: { userId, phone, verified: true }
5. All reservation requests require Bearer JWT in Authorization header
```

**Security rules:**
- Max 3 OTP attempts per session; lock for 15 minutes after 3 failures
- Max 5 OTP requests per phone per hour
- OTP is cleared from DB immediately after successful verification
- JWT is RS256-signed (asymmetric — safer for multi-service deployments)

### B. Hospital Admin Authentication (Email + Password + RBAC)

**Flow:**
```
1. Hospital admin logs in via email + password
2. POST /api/v1/admin/auth/login
   → Bcrypt password check
   → Issue JWT with hospital_id and role claims
   → JWT payload: { adminId, hospitalId, role: "manager" }
3. All admin routes verify JWT + check hospitalId matches resource ownership
```

**RBAC roles:**

| Role | Can Do |
|---|---|
| `owner` | All actions + manage staff accounts + billing |
| `manager` | Approve/decline reservations + update resources + view analytics |
| `staff` | Update resource statuses only |

### C. Hospital EHR/HIS API Key Authentication

**Flow:**
```
1. Hospital owner generates an API key in the admin dashboard
2. Server generates a 32-byte random key: "aub_live_xxxxxxxxxxxxxxxxxxxxxxxx"
3. SHA-256 hash stored in hospital_api_keys table (raw key shown ONCE to admin)
4. EHR system includes key in every request header:
   X-Api-Key: aub_live_xxxxxxxxxxxxxxxxxxxxxxxx
5. Server: hash the incoming key → look up in DB → validate hospital + scope + active
6. Optionally: HMAC-SHA256 signature in X-Signature header for payload integrity
```

**HMAC signature verification (optional, for high-security hospitals):**
```
HMAC_SECRET = shared secret between hospital and AuraBed
signature = HMAC-SHA256(HMAC_SECRET, timestamp + "." + JSON.stringify(body))
Header: X-Signature: t=1718245200,v1=<hex_signature>
Server verifies within 5-minute timestamp window to prevent replay attacks
```

**API key scopes:**

| Scope | Permitted Endpoints |
|---|---|
| `sync` | POST /api/v1/resources/sync |
| `read` | GET /api/v1/hospitals/:id/resources |
| `admin` | All admin endpoints |

---

## 7. API Design

### Base URL
`https://api.aurabed.in/api/v1`

### Public Endpoints (No auth required)

```
GET  /hospitals                          — List all active hospitals with availability summary
GET  /hospitals/:id                      — Single hospital details
GET  /hospitals/:id/resources            — All resources for a hospital (filterable by category)
GET  /hospitals/:id/resources/:category  — Resources filtered by category code
GET  /categories                         — All resource categories
```

### Patient Endpoints (JWT required)

```
POST /auth/otp/request                   — Request OTP for phone number
POST /auth/otp/verify                    — Verify OTP, receive JWT

POST /reservations                       — Create reservation request
GET  /reservations/:id                   — Get reservation status
DELETE /reservations/:id                 — Cancel own reservation
```

### Hospital Admin Endpoints (Admin JWT required)

```
POST /admin/auth/login                   — Admin login
POST /admin/auth/logout                  — Admin logout

GET  /admin/reservations                 — List reservations for admin's hospital
GET  /admin/reservations/:id             — Reservation detail
POST /admin/reservations/:id/approve     — Approve reservation
POST /admin/reservations/:id/decline     — Decline reservation (with reason)

GET  /admin/resources                    — List all resources for hospital
POST /admin/resources                    — Add new resource
PATCH /admin/resources/:id               — Update resource (status, attributes)
DELETE /admin/resources/:id              — Remove resource

GET  /admin/analytics/summary            — Occupancy rates, booking counts
GET  /admin/analytics/timeline           — Hourly/daily trends

POST /admin/api-keys                     — Generate new API key
GET  /admin/api-keys                     — List API keys (prefix only, no raw key)
DELETE /admin/api-keys/:id               — Revoke API key
```

### EHR/HIS Sync Endpoint (API Key required)

```
POST /resources/sync                     — Push status update for one resource
Body: {
  "resourceId": "uuid",
  "status": "available|occupied|reserved|maintenance",
  "attributes": {}      // optional — merge with existing attributes
}

POST /resources/sync/batch               — Batch update up to 100 resources
Body: { "updates": [{ resourceId, status }, ...] }
```

### Webhook Payloads (AuraBed → Hospital)

AuraBed can push events to a hospital's configured webhook URL:

```json
{
  "event": "reservation.created",
  "timestamp": "2026-06-13T10:30:00Z",
  "data": {
    "reservationId": "uuid",
    "resourceId": "uuid",
    "resourceName": "ICU-03",
    "patientName": "Ravi Kumar",
    "patientContact": "+919876543210",
    "reason": "Post-operative care"
  }
}
```

Events: `reservation.created` | `reservation.cancelled` | `resource.status_changed`

---

## 8. Implementation Phases (Step-by-Step)

---

### Phase 0 — Foundation Setup (Week 1–2)

**Goal:** Working local development environment with project structure.

**Steps:**

1. Initialize monorepo with the following structure:
   ```
   aurabed/
   ├── server/          # Node.js + Express backend
   │   ├── src/
   │   │   ├── routes/
   │   │   ├── middleware/
   │   │   ├── services/
   │   │   ├── db/
   │   │   └── utils/
   │   ├── prisma/
   │   │   └── schema.prisma
   │   └── package.json
   ├── client/          # React + Vite frontend
   │   ├── src/
   │   │   ├── pages/
   │   │   ├── components/
   │   │   ├── hooks/
   │   │   ├── services/
   │   │   └── store/
   │   └── package.json
   ├── tests/
   └── docs/
   ```

2. Install core dependencies:
   ```bash
   # Server
   npm install express prisma @prisma/client bcryptjs jsonwebtoken
   npm install socket.io cors helmet express-rate-limit
   npm install dotenv zod winston twilio @sendgrid/mail
   npm install -D typescript ts-node nodemon

   # Client
   npm create vite@latest client -- --template react
   npm install axios socket.io-client zustand react-router-dom
   npm install react-hot-toast @tanstack/react-query
   ```

3. Set up Prisma with SQLite for local development:
   ```
   # prisma/schema.prisma — define all models per Section 4 schema
   DATABASE_URL="file:./aurabed.db"
   ```

4. Create `.env` files for server:
   ```
   DATABASE_URL=
   JWT_SECRET=
   JWT_EXPIRES_IN=24h
   TWILIO_ACCOUNT_SID=
   TWILIO_AUTH_TOKEN=
   TWILIO_PHONE_NUMBER=
   REDIS_URL=
   PORT=4000
   ```

5. Write database seed script (`server/prisma/seed.ts`) with:
   - All category records from Section 5
   - 3 sample hospitals
   - 30–50 sample resources across all categories
   - 1 test admin account per hospital
   - 1 test API key per hospital

---

### Phase 1 — Core Backend API (Week 3–5)

**Goal:** All REST API endpoints working with authentication.

**Steps:**

1. **Database layer** — implement Prisma service wrappers for each model with typed inputs/outputs

2. **Authentication middleware:**
   - `verifyJWT(req, res, next)` — validates patient/admin JWT
   - `verifyApiKey(req, res, next)` — hashes incoming key, looks up DB
   - `requireRole(...roles)` — RBAC check on admin routes
   - `requireHospitalOwnership` — ensures admin only touches their hospital's data

3. **OTP service** (`server/src/services/otpService.ts`):
   - Generate 6-digit code
   - Hash with bcrypt (cost 8)
   - Store in DB with 5-minute expiry
   - Call Twilio SMS API to deliver code
   - Verify: compare hash, check expiry, increment attempt counter

4. **Public routes** — hospitals list, resource availability (no auth)

5. **Patient auth routes** — OTP request, OTP verify, JWT issue

6. **Reservation routes** — create (JWT required), get own reservation, cancel

7. **Admin auth routes** — email/password login, JWT with role claims

8. **Admin management routes** — reservations CRUD, resource management, API key management

9. **EHR sync endpoint:**
   - API key verification middleware
   - Update resource status in DB
   - Emit Socket.io event `resource:updated` with full resource payload
   - Write to sync_logs table
   - Return 200 with updated resource

10. **Rate limiting:**
    - OTP requests: 5 per phone per hour (Redis-backed)
    - Sync endpoint: 300 requests per minute per API key
    - Public endpoints: 60 requests per minute per IP

11. **Input validation** — Zod schemas for every request body

12. **Error handling middleware** — standardized error response format:
    ```json
    { "error": { "code": "RESOURCE_NOT_FOUND", "message": "Resource r123 does not exist" } }
    ```

---

### Phase 2 — Real-Time Engine (Week 5–6)

**Goal:** WebSocket broadcast working across all clients.

**Steps:**

1. Set up Socket.io server alongside Express:
   ```javascript
   const httpServer = createServer(app);
   const io = new Server(httpServer, { cors: { origin: CLIENT_URL } });
   ```

2. Implement room-based broadcasting:
   ```
   Rooms:
   hospital:{hospitalId}      — all clients watching that hospital
   admin:{hospitalId}         — admin dashboard for that hospital
   reservation:{userId}       — patient watching their own booking
   ```

3. Client joins rooms on connection:
   ```javascript
   socket.on('join:hospital', (hospitalId) => socket.join(`hospital:${hospitalId}`));
   socket.on('join:admin', (hospitalId, token) => { verifyAdminToken(token); socket.join(`admin:${hospitalId}`); });
   ```

4. Events emitted by server:

   | Event | Room | Payload |
   |---|---|---|
   | `resource:updated` | `hospital:{id}` | `{ resourceId, status, hospitalId }` |
   | `reservation:new` | `admin:{id}` | Full reservation object |
   | `reservation:status` | `reservation:{userId}` | `{ id, status }` |
   | `availability:changed` | `hospital:{id}` | `{ categoryCode, availableCount }` |

5. For production scale — add Redis pub/sub adapter so events work across multiple server instances:
   ```javascript
   import { createAdapter } from '@socket.io/redis-adapter';
   io.adapter(createAdapter(pubClient, subClient));
   ```

---

### Phase 3 — Frontend Application (Week 6–10)

**Goal:** Full three-view frontend connected to live backend.

**Steps:**

1. **Routing structure:**
   ```
   /                          → Public hospital search + map
   /hospitals/:id             → Hospital detail + resource grid
   /hospitals/:id/book/:rid   → Reservation flow (OTP gate)
   /reservations/:id          → Reservation tracker
   /admin/login               → Admin login
   /admin                     → Admin dashboard
   /admin/resources           → Resource manager
   /admin/analytics           → Charts and trends
   /admin/settings            → API keys + staff accounts
   /developer                 → API sandbox
   ```

2. **Public Portal components:**
   - `HospitalSearch` — text search + city filter + category filter chips
   - `HospitalCard` — name, city, live availability counts by category color
   - `ResourceGrid` — bed cells with color-coded status, grouped by category
   - `ResourceDetailPanel` — JSONB attributes rendered as key-value pairs
   - `BookingModal` — multi-step: (1) phone entry, (2) OTP input, (3) details form, (4) confirmation
   - `ReservationTracker` — live status card with WebSocket update listener

3. **Admin Dashboard components:**
   - `ReservationInbox` — real-time table with sound alert on new pending items
   - `ResourceOverview` — visual grid of all resources with inline status toggle
   - `BulkUpdatePanel` — select multiple beds and set status in one action
   - `AnalyticsPanel` — occupancy over time, peak hours, category breakdown (Recharts)
   - `ApiKeyManager` — generate, label, copy, and revoke API keys
   - `StaffManager` — invite staff by email, set roles

4. **API Sandbox / Developer page:**
   - Resource selector dropdown
   - Status selector
   - Execute sync button
   - Live JSON payload + response display
   - Activity log with timestamps
   - Copy as curl button

5. **Real-time hooks:**
   ```javascript
   // useHospitalUpdates(hospitalId) — subscribes to resource:updated events
   // useReservationStatus(reservationId) — subscribes to reservation:status events
   // useAdminInbox(hospitalId) — subscribes to reservation:new with sound + badge
   ```

6. **Global state (Zustand stores):**
   - `hospitalStore` — selected hospital, resource map, availability counts
   - `authStore` — user JWT, phone, verification state
   - `adminStore` — admin JWT, hospital data, pending reservation count
   - `socketStore` — socket instance, connection status

---

### Phase 4 — Notifications (Week 10–11)

**Goal:** SMS and email notifications at all key booking events.

**Steps:**

1. **SMS notifications via Twilio** (trigger from reservation service):

   | Event | Recipient | Message |
   |---|---|---|
   | Reservation created | Patient | "Your booking for [Bed G-101] at City Central is pending. Ref: #AB1234" |
   | Reservation confirmed | Patient | "CONFIRMED: Bed G-101, City Central Hospital. Report to Ward A. Contact: 0821-XXXXXX" |
   | Reservation declined | Patient | "Sorry, your booking #AB1234 was declined. Reason: [notes]. Try another bed." |
   | 10-min expiry warning | Patient | "Reminder: Your pending booking #AB1234 expires in 10 minutes unless approved." |
   | New booking | Hospital admin (optional) | "New bed booking request #AB1234 for ICU-03. Login to approve." |

2. **Email notifications via SendGrid:**
   - Booking confirmation HTML receipt
   - Daily occupancy summary email to hospital admins (scheduled cron job)
   - Weekly platform report to platform admin

3. **Auto-expiry cron job** (runs every minute):
   ```sql
   UPDATE reservations
   SET status = 'expired'
   WHERE status = 'pending_approval'
     AND expires_at < NOW();

   UPDATE resources
   SET status = 'available'
   WHERE id IN (
     SELECT resource_id FROM reservations WHERE status = 'expired' AND updated_at > NOW() - INTERVAL '2 minutes'
   );
   ```
   Implemented using `node-cron` or Supabase's `pg_cron` extension in production.

---

### Phase 5 — Production Infrastructure (Week 12–14)

**Goal:** Deploy securely to production on Supabase + Vercel + Railway.

**Steps:**

1. **Database migration:** SQLite → Supabase PostgreSQL
   - Run all DDL from Section 4 in Supabase SQL editor
   - Enable Row Level Security (RLS):
     - Public can SELECT hospitals and resources
     - Patients can SELECT their own reservations only
     - Admins can SELECT/UPDATE within their hospital_id only
   - Create indexes (Section 4)
   - Enable PostGIS for geospatial hospital search

2. **Backend deployment to Railway (or Fly.io):**
   - Dockerfile for Express server
   - Environment variables via Railway secrets
   - Health check endpoint: `GET /health`
   - Auto-deploy on push to `main` branch

3. **Frontend deployment to Vercel:**
   - `VITE_API_URL` and `VITE_WS_URL` set as Vercel environment variables
   - SPA routing: configure `vercel.json` to route all paths to `index.html`

4. **Redis on Upstash:**
   - Connect Socket.io Redis adapter
   - Connect rate limiter storage

5. **Domain + SSL:**
   - `aurabed.in` → Vercel (frontend)
   - `api.aurabed.in` → Railway (backend)
   - Cloudflare proxies both for DDoS protection

6. **Monitoring:**
   - Sentry for backend error tracking
   - Posthog or Mixpanel for frontend analytics
   - Uptime robot for availability monitoring

---

### Phase 6 — Hospital Onboarding & Verification (Week 14–15)

**Goal:** A smooth, trustworthy process to bring hospitals onto the platform.

**Steps:**

1. **Self-service registration form** at `aurabed.in/hospitals/register`
   - Hospital name, address, contact details, GSTIN / registration number
   - Primary admin email and phone
   - Upload: hospital registration certificate (PDF)

2. **Internal verification workflow** (Platform Admin panel):
   - Receive new hospital application
   - Review documents
   - Mark hospital as `verified = true` in DB
   - System auto-generates first API key and sends it to the admin via email
   - Welcome email with integration guide link

3. **Hospital integration guide** (hosted docs at `docs.aurabed.in`):
   - Authentication (API key setup)
   - First sync request (curl example)
   - Bulk resource setup (CSV import tool)
   - Webhook configuration
   - Postman collection download link

---

### Phase 7 — Analytics & Reporting (Week 15–17)

**Goal:** Useful data for hospitals to improve resource management.

**Steps:**

1. **Admin analytics views:**
   - Occupancy rate by category (7-day, 30-day)
   - Peak booking hours heatmap
   - Average time-to-approval
   - Reservation completion vs cancellation rate
   - Top requested resources

2. **Automated reports:**
   - Daily occupancy summary email to hospital admins (6 AM)
   - Monthly PDF report with charts (using Puppeteer or equivalent)

3. **Platform admin global dashboard:**
   - Total hospitals, resources, and reservations
   - Active users per day
   - Revenue by plan tier

---

## 9. Pricing Strategy

### Guiding Principles

- Hospitals pay, not patients. Patient access to view availability and request bookings is always free.
- Price by resource count, not by bookings. Hospitals shouldn't be penalized for high utilization.
- Start simple. Three tiers that map directly to hospital size.

---

### Tier 1 — Starter (Free Forever)

**Target:** Small clinics, nursing homes, diagnostic centers getting started

| Feature | Included |
|---|---|
| Resources | Up to 25 resources |
| API sync | Up to 500 sync calls/month |
| Categories | All standard categories |
| Admin users | 1 |
| Reservations | Unlimited |
| SMS notifications | Not included (patient pays ₹1/SMS optionally) |
| Analytics | Basic (7-day) |
| Support | Community docs |

**Price: ₹0/month**

Purpose: Build trust and network density. A small clinic showing real availability drives public adoption in that area, making the platform more valuable for larger hospitals.

---

### Tier 2 — Growth (₹2,999/month)

**Target:** Medium hospitals (50–300 beds), diagnostic chains, multi-specialty clinics

| Feature | Included |
|---|---|
| Resources | Up to 200 resources |
| API sync | Unlimited |
| Categories | All + custom attributes |
| Admin users | Up to 10 |
| Reservations | Unlimited |
| SMS notifications | 1,000 SMS/month included |
| Analytics | Full (30-day + trends) |
| Webhook outbound | Included |
| API sandbox | Included |
| Support | Email, 48h response |

**Price: ₹2,999/month** (~USD 36) billed monthly, ₹2,499/month billed annually

---

### Tier 3 — Enterprise (₹9,999/month)

**Target:** Large hospitals (300+ beds), hospital networks, government health systems

| Feature | Included |
|---|---|
| Resources | Unlimited |
| API sync | Unlimited + priority queue |
| Categories | All + custom category creation |
| Admin users | Unlimited |
| Reservations | Unlimited |
| SMS notifications | 5,000 SMS/month included |
| Analytics | Advanced + custom date ranges + CSV export |
| Webhook outbound | Included + retry logic |
| HMAC signing | Included |
| SLA uptime | 99.9% guaranteed |
| Custom branding | White-label option |
| Dedicated onboarding | Included (2 sessions) |
| Support | Priority email + phone, 12h response |

**Price: ₹9,999/month** (~USD 120), or custom annual contract for hospital networks

---

### Add-On Services

| Add-On | Price |
|---|---|
| Extra 1,000 SMS | ₹499 |
| CSV resource bulk import | ₹999 one-time |
| Custom API integration assistance | ₹15,000 one-time |
| White-label deployment (own domain + branding) | ₹4,999/month surcharge |
| Dedicated server region (data residency) | Custom quote |

---

### Government / Public Hospital Pricing

For government hospitals and PHCs, offer a **subsidized rate of ₹499/month** for the Growth tier features, contingent on NIC / e-Aushadhi integration or official MoU. Public visibility of government beds is a strong driver of platform credibility.

---

### Revenue Projections (Year 1)

| Scenario | Starter | Growth | Enterprise | Monthly Revenue |
|---|---|---|---|---|
| Conservative | 50 hospitals | 20 hospitals | 2 hospitals | ₹79,960 (~$960) |
| Moderate | 200 hospitals | 60 hospitals | 10 hospitals | ₹279,940 (~$3,360) |
| Optimistic | 500 hospitals | 150 hospitals | 25 hospitals | ₹699,875 (~$8,400) |

---

## 10. Scalability Roadmap

### Near-term (0–6 months)
- Single-region deployment (India — ap-south-1)
- SQLite → Supabase PostgreSQL migration
- Socket.io with Redis adapter for horizontal backend scaling
- Support for all 20+ resource categories from Section 5

### Medium-term (6–18 months)
- Multi-region PostgreSQL read replicas (Supabase's global replication)
- CDN-cached hospital availability snapshots (refreshed every 30s) for high-traffic public pages
- Mobile app (React Native) for patient portal
- HL7 / FHIR compatibility layer for enterprise EHR integration
- Bed cluster view: visualize entire floors/wards as a layout map

### Long-term (18 months+)
- Predictive availability: ML model trained on historical data to predict when ICU beds will free up
- Cross-hospital smart routing: recommend the nearest hospital with the right resource type
- Insurance pre-authorization integration
- Ambulance coordination: API for ambulance dispatch systems to check and soft-lock ICU beds in transit
- Government health dashboard integration (Ayushman Bharat, NHA)

---

## 11. Go-to-Market Strategy

### Phase 1 — Anchor Hospitals (Month 1–3)
- Personally onboard 3–5 hospitals in one city (e.g., Mysuru)
- Offer free white-glove integration support
- Use these as case studies and social proof

### Phase 2 — City Density (Month 3–9)
- Target top-10 hospitals in each of 5 Tier-2 cities
- Direct sales to hospital IT/admin heads
- Referral incentive: ₹5,000 credit per hospital that refers another

### Phase 3 — State-Level Partnerships (Month 9–18)
- Approach state health departments (Karnataka, Tamil Nadu, Maharashtra)
- Propose AuraBed as the public bed visibility layer for state health portals
- Government grants and NIC/NHA integration

### Phase 4 — National Scale (18 months+)
- B2B SaaS sales team across metro cities
- Hospital association partnerships (IMA, NATHEALTH)
- API-first approach: partner with existing HIS vendors (HIS companies like Practo, Medi7, etc.) to bundle AuraBed as their real-time sync layer

---

## 12. Tech Stack Summary

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | Fast builds, strong ecosystem |
| Styling | Tailwind CSS | Utility-first, rapid iteration |
| State | Zustand + React Query | Lightweight yet powerful |
| Backend | Node.js + Express + TypeScript | Familiar, deployable everywhere |
| ORM | Prisma | Type-safe DB access, easy migrations |
| Database (dev) | SQLite | Zero setup for local dev |
| Database (prod) | Supabase (PostgreSQL) | RLS, realtime, managed infrastructure |
| Real-time | Socket.io + Redis Pub/Sub | Battle-tested, scales horizontally |
| Cache / Rate limit | Upstash Redis | Serverless Redis, generous free tier |
| OTP / SMS | Twilio | Reliable delivery in India |
| Email | SendGrid | Transactional email at scale |
| Auth (JWT) | jsonwebtoken (RS256) | Stateless, multi-service compatible |
| Validation | Zod | Runtime + compile-time safety |
| Payments | Stripe or Razorpay | Razorpay preferred for India |
| Monitoring | Sentry + Uptime Robot | Error tracking + uptime |
| Frontend hosting | Vercel | Free tier, edge CDN, instant deploys |
| Backend hosting | Railway | Simple Docker deployment, affordable |
| CI/CD | GitHub Actions | Auto-deploy on push to main |

---

*AuraBed — built for the day someone needs a bed and can't find one.*