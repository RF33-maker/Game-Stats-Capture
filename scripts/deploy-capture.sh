#!/bin/sh
# Build the capture app and put it on Vercel as a static site.
# Needs artifacts/swish-stats/.env.local (the public Supabase URL and anon key)
# and a logged-in Vercel CLI. Usage: scripts/deploy-capture.sh [--prod]
set -e
cd "$(dirname "$0")/../artifacts/swish-stats"
NODE_ENV=production pnpm run build
cat > dist/public/vercel.json <<'JSON'
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [
    { "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
    { "source": "/index.html", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
    { "source": "/manifest.webmanifest", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }
  ]
}
JSON
cd dist/public
vercel link --yes --project swish-stats-capture >/dev/null
vercel deploy --yes "$@"
