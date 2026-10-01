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

Create a staging D1 database and Workers KV namespace:

```bash
npx wrangler d1 create carton-artwork-studio-staging
npx wrangler kv namespace create carton-artwork-studio-staging-artifacts
```

Record the D1 database UUID and KV namespace ID.

Staging deliberately uses Workers KV so R2 billing activation is not required. Production still requires R2.

## 2. GitHub configuration

Repository / staging Environment **Secrets**:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_ACCESS_CLIENT_ID
CLOUDFLARE_ACCESS_CLIENT_SECRET
CLOUDFLARE_PDFX_VALIDATOR_TOKEN
```

Repository **Variables**:

```text
CLOUDFLARE_D1_DATABASE_ID
CLOUDFLARE_KV_NAMESPACE_ID=<workers-kv-namespace-id>
CLOUDFLARE_BOOTSTRAP_ADMIN_EMAIL
CLOUDFLARE_STAGING_URL=https://<staging-hostname>
CLOUDFLARE_PDFX_VALIDATOR_URL=https://<trusted-validator-endpoint>   # required for v2 final staging acceptance
```

Use a narrowly scoped Cloudflare API token. Do not commit it.

`PDFX_VALIDATOR_TOKEN` is required by the v2 trust policy. Store its source value as the GitHub Environment secret `CLOUDFLARE_PDFX_VALIDATOR_TOKEN`; the staging workflow pipes it directly to `wrangler secret put PDFX_VALIDATOR_TOKEN`. Do not place it in repository variables or source control.

## 3. Deploy staging

Staging now has two independent deployment paths:

1. Cloudflare Workers Builds connected directly to GitHub.
2. GitHub Actions `.github/workflows/deploy-staging.yml`, triggered automatically whenever the reviewed `staging` branch advances and still available through `workflow_dispatch`.

This removes Cloudflare Workers Builds as a single point of deployment failure.

1. runs `npm run check`;
2. generates a staging Wrangler config;
3. applies D1 migrations remotely;
4. deploys the Worker/assets with D1 + KV Artifact Store;
5. installs the trusted validator bearer token as the Worker `PDFX_VALIDATOR_TOKEN` secret;
6. runs an Access-authenticated post-deploy smoke test for service identity, version, D1, R2, Assets, auth-bypass state, and trusted-validator configuration;
7. uploads `staging-acceptance.json` as a GitHub Actions artifact.

Advance `staging` only to a reviewed commit already merged into `main`. Both deployment paths watch the same reviewed `staging` ref. Configure Cloudflare Workers Builds to watch the `staging` branch and use deploy command `npm run deploy:staging`. This command runs repository checks, applies remote D1 migrations, deploys the Worker with D1 + KV bindings, and executes the staging smoke test.

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
5. remove the bootstrap variable from the next deployment;
6. redeploy and run **System Management > Staging Readiness Center > Run R2 Deep Probe**.

## 6. Promotion to production

Do not promote staging until these gates pass:

- CI green;
- D1 migrations applied;
- Access enforced;
- four-eyes approval verified with two identities;
- Staging Readiness Center = `STAGING_READY`;
- Artifact Store deep probe passed within 24 hours;
- Artifact hash verified;
- Production Artifact Store is R2;
- backup/rollback procedure exercised;
- barcode business symbology confirmed;
- font embedding/outlining gate closed;
- PDF/X gate closed where required;
- external PDF/X validator endpoint/version/ruleset approved and validation evidence accepted by the target printer/RIP.

## Official Cloudflare references

- GitHub Actions deployment:
  https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- D1 migrations:
  https://developers.cloudflare.com/d1/reference/migrations/
- D1 Wrangler commands:
  https://developers.cloudflare.com/workers/wrangler/commands/d1/


## Staging Readiness Center

Operational details and gate definitions:

`docs/STAGING_READINESS.md`


## External PDF/X validation

Bridge protocol and trust boundary:

`docs/PDFX_VALIDATOR_BRIDGE.md`


## v2.0 trusted PDF/X promotion

The selected automated production validator is pinned in code to callas pdfToolbox CLI/Server 17.0.683 and ruleset `CAS-PDFX4-PRODUCTION-1@1.0.0`.

This is not sufficient by itself to enable PDF/X-4 Production. Independent PitStop 26.07 regression evidence plus actual printer/RIP Ghent PDF Output Suite 5.0 Level 1+2 evidence are required.

See:

`docs/PRODUCTION_PROMOTION_POLICY.md`


### Staging storage policy

```text
STAGING    = Workers + D1 + KV
PRODUCTION = Workers + D1 + R2
```

KV does not satisfy the Production Artifact Store gate. Production PDF and Production Bundle endpoints reject KV-backed environments server-side.


## Cloudflare Workers Builds

The preferred staging CI path is Cloudflare-native Git integration:

```text
GitHub staging branch
        ↓
Cloudflare Workers Builds
        ↓
npm run deploy:staging
        ↓
npm run check
D1 migrations apply --remote
wrangler deploy
staging smoke
```

Use:

- Repository: `guodongbuding66-spec/carton-artwork-studio`
- Production branch for this Worker: `staging`
- Deploy command: `npm run deploy:staging`
- Wrangler config: `wrangler.staging.jsonc`

This path does not require storing a Cloudflare API token in GitHub Secrets because the build executes inside Cloudflare's native CI environment.
