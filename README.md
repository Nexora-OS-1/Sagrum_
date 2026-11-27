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

After choosing a public website host, add these values in Supabase Dashboard → Edge Functions → Secrets:

- SITE_URL — the complete public URL of the website, including a trailing slash and any project path
- STRIPE_SECRET_KEY — a Stripe test secret key
- STRIPE_WEBHOOK_SECRET — the signing secret for the Stripe webhook
- PAYPAL_CLIENT_ID — a PayPal Sandbox application client ID
- PAYPAL_CLIENT_SECRET — its PayPal Sandbox secret

Never commit provider credentials or put them in browser code. Configure the Stripe webhook endpoint as:

https://pizgtsnitsmjdunnhqtg.supabase.co/functions/v1/payment-api/api/stripe/webhook

Subscribe it to checkout.session.completed. The Stripe success page also checks the Checkout Session directly.

## Website hosting

Supabase hosts the backend, not the HTML, CSS, and JavaScript website. Supabase Storage returns HTML as plain text on its default domain, and Edge Functions are for API endpoints. Publish the generated dist/ directory on a static website host. The connected GitHub repository can build it with npm run build.

## Editing

- Website pages: src/
- Website styles: style/
- Browser-side code: scripts/
- Database schema and security rules: supabase/migrations/
- Supabase Edge Functions: supabase/functions/
- Bucket and function configuration: supabase/config.toml

Commit changes to main to sync Supabase migrations, functions, and storage configuration. Website files must also be deployed to the selected static host.
