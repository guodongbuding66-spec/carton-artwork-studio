# Cloudflare Access + RBAC

Carton Artwork Studio uses two layers:

1. **Cloudflare Access** authenticates the human identity.
2. **D1 RBAC** determines what that authenticated identity may do inside the application.

## Identity source

The Worker reads the Access-provided header:

```text
Cf-Access-Authenticated-User-Email
```

The application does **not** trust a browser-supplied role header in production.

For local development only, `AUTH_BYPASS=1` enables `DEV_USER_EMAIL` and `DEV_USER_ROLES`. Never enable this in staging or production.

## Application roles

| Role | Primary capabilities |
| --- | --- |
| OPERATOR | create/edit drafts, preflight, submit, batch import, production export after approval |
| REVIEWER | review comments, blocking comments, approve/reject |
| TEMPLATE_DESIGNER | template drafting/editing |
| TEMPLATE_APPROVER | publish/approve template versions |
| ADMIN | user/role administration and all application permissions |

## Four-eyes rule

The Worker records `artwork_revisions.created_by` from the authenticated Access identity.

The same email is prohibited from approving or rejecting the Revision it submitted:

```text
Operator A submits R04
Reviewer B approves R04    ✅
Operator A approves R04    ❌ FOUR_EYES_REQUIRED
```

This rule also applies to ADMIN.

## Bootstrap admin

Before the first D1 user exists, configure:

```text
BOOTSTRAP_ADMIN_EMAIL=owner@company.com
```

If that exact Access-authenticated email signs in, the Worker grants an ephemeral ADMIN role. Use it to create normal D1 users and roles. After RBAC is configured, remove the bootstrap variable.

## Review comments

Comments are stored by Artwork + Revision.

- OPERATOR / REVIEWER / ADMIN can add normal comments.
- Only REVIEWER / ADMIN can create blocking comments.
- Only REVIEWER / ADMIN can resolve blocking comments.
- Approval is blocked while the current Revision has unresolved blocking comments.

## Production export

Production artifact persistence requires:

- authenticated OPERATOR or ADMIN;
- Artwork status = APPROVED;
- requested Revision = current Revision;
- Revision status = APPROVED;
- no stale Revision mismatch.

The R2 object hash is recomputed server-side before D1 export metadata is written.

## Cloudflare references

- Access authenticated user header:
  https://developers.cloudflare.com/cloudflare-one/tutorials/access-workers/
- Service token request headers:
  https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/
