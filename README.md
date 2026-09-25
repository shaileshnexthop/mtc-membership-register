# MTC Membership Register

Membership portal for The Mauritius Turf Club: online applications replicating the Club's
*Formulaire de candidature*, KYC and compliance review, MIPS payments, staff-approved upgrades,
renewals, the member record and reporting. Built by Nexthop.

## Stack

- Next.js (App Router, TypeScript), self-hosted as a standalone Node server
- PostgreSQL with Drizzle ORM (`src/db/schema.ts`, migrations in `drizzle/`)
- Staff sign-in through MTC's Microsoft 365 tenant (Entra ID); applicants use email and password
- Email via SMTP2GO, payments via MIPS, documents in a private S3-compatible bucket
- Deployed with Docker Compose and Caddy (automatic HTTPS) on AWS Lightsail

## Local development

```bash
cp .env.example .env          # then set DATABASE_URL
npm install
npm run db:migrate            # apply migrations and reference data
npm run dev
```

## Database changes

Edit `src/db/schema.ts`, then:

```bash
npm run db:generate -- --name <short-description>
npm run db:migrate
```

Commit the generated SQL in `drizzle/`. Migrations run automatically on each deploy.

## Deployment

See [docs/SETUP.md](docs/SETUP.md) for the one-time Lightsail setup. After that, every push to
`main` is checked, built into a Docker image and deployed by `.github/workflows/deploy.yml`.
