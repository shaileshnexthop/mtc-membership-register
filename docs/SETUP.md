# Demo environment setup (AWS Lightsail)

One-time steps to get the portal running at `https://<demo subdomain>`.
After this, every push to `main` builds and deploys automatically.

Replace `<domain>` below with the demo subdomain, e.g. `mtc-demo.example.mu`.

## 1. Lightsail instance

1. Lightsail → **Create instance** → Linux/Unix → **OS Only** → **Ubuntu 24.04 LTS**.
2. Region: the nearest available to Mauritius.
3. Plan: at least **2 GB RAM**.
4. Name it `mtc-demo` and create it.
5. On the instance's **Snapshots** tab, turn on **automatic snapshots**.

## 2. Networking and DNS

1. **Networking** tab → **Create static IP** and attach it to `mtc-demo`.
2. IPv4 firewall:
   - HTTP (80) and HTTPS (443): allow all.
   - SSH (22): allow all. GitHub Actions deploys over SSH from changing IP addresses, so SSH
     cannot be limited to one office IP. The server only accepts keys (no passwords) and
     fail2ban blocks repeated failed attempts.
3. At your DNS provider, add an **A record**: `<domain>` → the static IP.

## 3. Deploy key (on your own computer)

```bash
ssh-keygen -t ed25519 -f mtc_deploy -C "github-deploy" -N ""
```

This creates `mtc_deploy` (private; goes into GitHub only) and `mtc_deploy.pub` (public; goes on the server).

## 4. Prepare the server

1. Open the instance's browser SSH (**Connect using SSH**).
2. Create the script: `nano bootstrap.sh`, paste the contents of
   [`deploy/bootstrap.sh`](../deploy/bootstrap.sh) (use GitHub's **Raw** view), save with Ctrl+O, exit with Ctrl+X.
3. Run it, with the full text of `mtc_deploy.pub` in quotes:

   ```bash
   sudo bash bootstrap.sh <domain> "ssh-ed25519 AAAA... github-deploy"
   ```

It installs Docker, security updates, fail2ban and swap, creates a `deploy` user, turns off SSH password login, and writes `/opt/mtc/.env` with a generated database password and session secret.

## 5. GitHub secrets

In the repo: **Settings → Secrets and variables → Actions → New repository secret**.

| Secret | Value |
| --- | --- |
| `LIGHTSAIL_HOST` | The static IP |
| `LIGHTSAIL_SSH_KEY` | The full contents of `mtc_deploy` (the private key) |
| `LIGHTSAIL_KNOWN_HOSTS` | Output of `ssh-keyscan -t ed25519 <static IP>` run on your computer |

To confirm the known-hosts value is really your server, compare its fingerprint with
`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` run in the browser SSH.

Then **Actions → Build and deploy → Run workflow**. When it finishes,
`https://<domain>/api/health` should return `{"status":"ok","database":"ok"}`.

## 6. Settings file

Fill in the empty values as each service is ready:

```bash
sudo -u deploy nano /opt/mtc/.env
cd /opt/mtc && sudo -u deploy docker compose up -d --force-recreate app
```

### Document storage (Lightsail bucket)

1. Lightsail → **Storage** → **Create bucket**, same region as the instance, and keep it **private**.
2. Bucket → **Permissions** → **Create access key**.
3. Set `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.

### Staff sign-in (MTC's Microsoft 365 tenant)

Done by an admin of MTC's tenant in the Entra admin centre:

1. **App registrations → New registration**
   - Name: `MTC Membership Portal`
   - Supported account types: **this organisational directory only**
   - Redirect URI (Web): `https://<domain>/api/auth/entra/callback`
2. **Certificates & secrets → New client secret**. Note its expiry date.
3. **API permissions**: Microsoft Graph delegated `openid`, `profile`, `email`, `User.Read` → **Grant admin consent**.
4. **App roles → Create app role** (allowed member types: Users/Groups), one per row:

   | Display name | Value |
   | --- | --- |
   | Reviewer | `Reviewer` |
   | Compliance officer | `ComplianceOfficer` |
   | Approver | `Approver` |
   | Finance | `Finance` |
   | Administrator | `Administrator` |

5. **Enterprise applications → MTC Membership Portal → Properties**: set **Assignment required** to **Yes**.
6. **Users and groups**: assign staff (or groups, if the tenant has Entra ID P1) to their roles.
7. Set `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`.

### Email (SMTP2GO)

1. **Sending → Verified senders → Sender domains**: add the sending domain and publish the DNS records it shows.
2. **Sending → API keys**: create a key allowed to send email.
3. Set `SMTP2GO_API_KEY`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`.

### Payments (MIPS test account)

Ask MIPS for test merchant credentials and give them:

- Callback (notification) URL: `https://<domain>/api/payments/mips/callback`
- Return URL: `https://<domain>/paiement/retour`

Set the `MIPS_*` values when they arrive.

## Useful commands on the server

```bash
cd /opt/mtc
sudo -u deploy docker compose ps            # what is running
sudo -u deploy docker compose logs -f app   # live app logs
sudo -u deploy docker compose restart app   # restart the app
```
