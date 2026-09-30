# Cloudflare Deployment

## Target

```text
Cloudflare Access
      ↓
Worker + Static Assets
  ├── D1  metadata / revisions / RBAC / audit
  └── R2  proof / production artifacts
```

## 1. Create resources

Create a staging D1 database and R2 bucket:

```bash
npx wrangler d1 create carton-artwork-studio-staging
npx wrangler r2 bucket create carton-artwork-studio-staging-files
```

Record the D1 database UUID.

## 2. GitHub configuration

Repository **Secrets**:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

Repository **Variables**:

```text
CLOUDFLARE_D1_DATABASE_ID
CLOUDFLARE_R2_BUCKET_NAME=carton-artwork-studio-staging-files
CLOUDFLARE_BOOTSTRAP_ADMIN_EMAIL
```

Use a narrowly scoped Cloudflare API token. Do not commit it.

## 3. Deploy staging

The manual workflow `.github/workflows/deploy-staging.yml`:

1. runs `npm run check`;
2. generates a staging Wrangler config;
3. applies D1 migrations remotely;
4. deploys the Worker/assets.

Trigger it only after the secrets and variables above are configured.

## 4. Configure Cloudflare Access

Protect the staging hostname with a Cloudflare Access self-hosted application.

The Worker expects Access to authenticate the request and provide the authenticated user email header.

Do not enable `AUTH_BYPASS` in staging or production.

## 5. Bootstrap RBAC

Set `CLOUDFLARE_BOOTSTRAP_ADMIN_EMAIL` to the first administrator's Access email.

After deployment:

1. sign in through Access;
2. open **System Management**;
3. create normal users;
4. grant OPERATOR / REVIEWER / other roles;
5. remove the bootstrap variable from the next deployment.

## 6. Promotion to production

Do not promote staging until these gates pass:

- CI green;
- D1 migrations applied;
- Access enforced;
- four-eyes approval verified with two identities;
- R2 export hash verified;
- backup/rollback procedure exercised;
- barcode business symbology confirmed;
- font embedding/outlining gate closed;
- PDF/X gate closed where required.

## Official Cloudflare references

- GitHub Actions deployment:
  https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- D1 migrations:
  https://developers.cloudflare.com/d1/reference/migrations/
- D1 Wrangler commands:
  https://developers.cloudflare.com/workers/wrangler/commands/d1/
