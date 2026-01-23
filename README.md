# PLU Substitutions

PLU Substitutions is a lightweight React application designed to help retail staff and managers quickly find and manage product code substitutions at the point of need.

The application was deliberately architected to balance operational efficiency, security, and cost control. It removes reliance on printed sheets, back-office terminals, or verbal handovers, improving speed, accuracy, and flow on the shop floor. Staff can check updated product codes instantly on any device without leaving their work area.

From the outset, the system was designed to operate with zero recurring infrastructure cost, using free-tier cloud services without compromising security or availability. Access control is enforced at the database layer rather than the user interface, ensuring data integrity and permissions remain robust even in a browser-based deployment.

The result is a simple, mobile-first tool that improves accuracy, reduces disruption, and demonstrates prudent technical and financial decision-making.

## Why this app exists

In many retail environments, product codes change regularly. When substitutions are not immediately available on the shop floor, staff are forced to walk to the back office, ask a manager, or rely on memory. This wastes time, increases queue pressure, and introduces avoidable errors.

PLU Substitutions addresses this by providing:

- Instant access to the latest codes
- A simple, mobile-first interface
- Clear separation between public access and management controls
- Strong security without adding friction for staff

## Key features

### Public access

- No login required for searching
- Search by product name, old code, new code, or notes
- Optimised for mobile use on the shop floor
- Read-only access enforced at the database level

### Manager and admin access

- Authenticated users can add, edit, and delete substitutions
- Simple login flow with optional username shortcuts
- Immediate UI updates after changes
- Duplicate prevention for Product Name and New Code

### Progressive Web App (PWA)

- Installable on Android, iOS, and desktop
- Works offline using cached data
- Fast loading and low data usage

## Security model

Security is enforced server-side using Supabase Row Level Security (RLS), not the frontend.

Key security properties:

- Public users can only read data
- Only authenticated users can write data
- All permissions are enforced in Postgres, not JavaScript
- Supabase anon key is safe to expose because RLS defines access
- No credentials or secrets are stored in the client

This means that even if someone inspects the frontend code or network requests, they cannot bypass access controls.

## Ease of use

The app is intentionally minimal:

- No training required for staff
- Large, touch-friendly UI elements
- Clear separation between search and management actions
- Optional username-based login shortcuts for managers who prefer not to type an email address

The design prioritises speed and clarity over visual complexity.

## Tech stack

- React
- Vite
- Supabase
- Authentication
- Postgres
- Row Level Security
- Progressive Web App support

## Setup

Install dependencies:

```bash
npm install
```

Environment variables

Create a `.env` file with your Supabase credentials:

```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Run locally:

```bash
npm run dev
```

## Supabase table schema

Create a table named `code_substitutions` with the following columns:

- `id` (uuid, primary key)
- `product_name` (text, required)
- `old_code` (text, required)
- `new_code` (text, required)
- `notes` (text, nullable)

The app expects these exact column names.

## Row Level Security policies

Recommended policies on `code_substitutions`:

- `SELECT` for anon users (public read access)
- `SELECT`, `INSERT`, `UPDATE`, `DELETE` for authenticated users

If authenticated users see no rows, ensure a `SELECT` policy exists for authenticated users as well as anon.

## Duplicate protection

The UI prevents duplicates for:

- Product Name (case-insensitive)
- New Code (case-insensitive)

For stronger guarantees, unique indexes can be added in Supabase to enforce this server-side.

## Authentication shortcuts

The login flow supports optional username shortcuts that map to email addresses. This allows managers to log in using a simple username instead of a full email address.

The mapping is defined in:

- `src/App.jsx`

Search for:

- `USERNAME_TO_EMAIL`

## Scripts

- `npm run dev` - start development server
- `npm run build` - production build
- `npm run preview` - preview production build locally

## Notes

- The application is intentionally designed to operate at zero recurring cost by using static hosting and free-tier backend services, while still enforcing strong security controls through database-level access policies
- The Supabase anon key is used safely with RLS enforcing all access rules
- Glass styling is intentionally limited to headers and panels for clarity
- Product cards are plain by design for readability
- PWA configuration and offline logic live in `src/pwa.js` and `public/icons/`
