# Sagrum_ — Supabase project

The project uses Supabase for Postgres, Auth, Storage, and the payment API. The website source is in the connected GitHub repository.

## Supabase integration

- GitHub repository: Nexora-OS-1/Sagrum_
- Production branch: main
- Working directory: . (the supabase/ folder is at the repository root)
- Production deploy is enabled

Supabase deploys database migrations, Edge Functions, and bucket configuration from the connected repository. The Sagrum content migration and sagrum-clips bucket are already present in the project.

## Payments

The original payment.py is a FastAPI server that calls localhost:8000. Supabase does not run Python servers, so its Stripe and PayPal Sandbox behavior is implemented as the TypeScript Edge Function at supabase/functions/payment-api/index.ts.

The only configured product is a test order for EUR 1.00. Stripe accepts test secret keys only (sk_test_); PayPal uses its Sandbox API. Do not use live payment credentials with this test product.

After the GitHub Pages deployment creates the public website URL, add these values in Supabase Dashboard → Edge Functions → Secrets:

- SITE_URL — the complete public URL of the website, including a trailing slash and any project path
- STRIPE_SECRET_KEY — a Stripe test secret key
- STRIPE_WEBHOOK_SECRET — the signing secret for the Stripe webhook
- PAYPAL_CLIENT_ID — a PayPal Sandbox application client ID
- PAYPAL_CLIENT_SECRET — its PayPal Sandbox secret

Never commit provider credentials or put them in browser code. Configure the Stripe webhook endpoint as:

https://pizgtsnitsmjdunnhqtg.supabase.co/functions/v1/payment-api/api/stripe/webhook

Subscribe it to checkout.session.completed. The Stripe success page also checks the Checkout Session directly.

## Website hosting

GitHub Pages hosts the static frontend. The workflow at `.github/workflows/deploy-pages.yml` runs `npm run build` on pushes to `main` and publishes `dist/`. The build prefixes links and assets with `/Sagrum_` for the GitHub Pages project URL. Supabase continues to host the database, storage, authentication, and payment API.

The website URL will be `https://nexora-os-1.github.io/Sagrum_/` after Pages is enabled and the first workflow succeeds. Set `SITE_URL` in Supabase Edge Function Secrets to that exact URL, including the trailing slash.

## Editing

- Website pages: src/
- Website styles: style/
- Browser-side code: scripts/
- Database schema and security rules: supabase/migrations/
- Supabase Edge Functions: supabase/functions/
- Bucket and function configuration: supabase/config.toml

Commit changes to main to sync Supabase migrations, functions, and storage configuration. Website files must also be deployed to the selected static host.
