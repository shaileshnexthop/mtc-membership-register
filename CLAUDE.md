@AGENTS.md

# MTC Membership Register — project notes

- Client: The Mauritius Turf Club (MTC). Built by Nexthop.
- Requirement IDs in code comments (REG-, APP-, KYC-, REV-, UPG-, PAY-, REN-, MEM-, RPT-, ADM-, NOT-)
  refer to the functional specification agreed with MTC.
- Applicant-facing pages are in French, replicating MTC's paper form wording exactly.
  Staff pages are in English until MTC decides on the language question.
- Staff sign in through MTC's Microsoft 365 tenant; roles come from Entra app roles
  (Reviewer, ComplianceOfficer, Approver, Finance, Administrator).
- Money is integer cents in MUR. History is appended, never overwritten.
- No card data is ever stored; MIPS payments are confirmed only by the verified server callback.
- KYC documents go to the private bucket only; never serve them from a public URL.
- Database: Drizzle ORM. Change `src/db/schema.ts`, run `npm run db:generate`, commit `drizzle/`.
- Hosting: Docker Compose + Caddy on AWS Lightsail (`deploy/`); see `docs/SETUP.md`.
