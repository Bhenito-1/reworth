# Shared environment for scripts/dry-run/{run.sh,clock.sh}. Sourced, not run.
# Exported for these processes only; your .env is read by the app but never
# changed. PSP (mock|paystack) must be set before sourcing.

export NODE_ENV=development
export DATABASE_URL="postgresql://reworth:reworth@localhost:55432/reworth_dryrun?schema=public"
export REDIS_URL="redis://localhost:56379"
export API_PORT=3101
export API_URL="http://localhost:3101"
export APP_URL="http://localhost:3100"
export NEXT_PUBLIC_API_URL="http://localhost:3101/api/v1"
export NEXT_PUBLIC_WEB_URL="http://localhost:3100"
export WEB_ORIGIN="http://localhost:3100"
export ADMIN_ORIGIN="http://localhost:3102"
export ADMIN_URL="http://localhost:3102"
export EMAIL_APP_URL="http://localhost:3100"
export MOBILE_WEB_ORIGINS=""
export STORAGE_DRIVER=local
export MEDIA_LOCAL_DIR="${DRYRUN_OUT:-$(pwd)/scripts/dry-run/out}/media"
export MEDIA_PIPELINE=mock
export BULLMQ_INLINE=true
export EMAIL_PROVIDER=mock
export PUSH_PROVIDER=mock
export ENABLE_PUSH=false
export DELIVERY_PROVIDER=mock
export IDENTITY_PROVIDER=mock
export GEOCODING_PROVIDER=mock
export AI_PROVIDER=mock
export ASSISTANT_PROVIDER=mock
export IMAGE_MODERATION_PROVIDER=mock
export INSPECTION_PROVIDER=mock
export AUTHENTICATION_PROVIDER=mock
export SEARCH_PROVIDER=postgres
export SEARCH_USE_POSTGRES_FTS_FALLBACK=true
export ACCOUNT_NAME_PROVIDER=mock
export SENTRY_DSN=""
export DISABLE_THROTTLE=1
export SWAGGER_ENABLED=false
export ADMIN_SEED_ON_BOOT=true
export ADMIN_SUPER_EMAIL="dryrun-admin@reworth.test"
export ADMIN_SUPER_PASSWORD="DryRun!Admin2026"
export ORDER_PAYMENT_WINDOW_HOURS=24
export BUYER_PROTECTION_COVERAGE_DAYS=7
export ORDER_AUTO_RELEASE_DAYS=3
export PAYMENTS_PROVIDER="${PSP:-mock}"
# Background jobs off: the runner / clock.sh run them on demand after moving
# the clock, so you see each step happen.
for s in ORDER_AUTO_RELEASE RECONCILIATION SELLER_SUB BOOST_EXPIRY CIRCULAR_DONATE \
  CONSIGNMENT_EXPIRY DISPUTE_SELLER_EXPIRY INSPECTION_EXPIRY LISTING_EXPIRY \
  MOVING_SALE_EXPIRY OFFER_EXPIRY PRO_SUBSCRIPTION SAVED_SEARCH_ALERT \
  SAVED_SEARCH_DIGEST SWAP_EXPIRY VALUATION_REFRESH; do
  export "${s}_SCHEDULER=false"
done

# Node < 22.12 (and < 20.19) cannot require() ES modules by default; otplib 13
# (admin TOTP) needs it, so the API crashes at boot. Enable the flag there.
if ! node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=12)||(a===20&&b>=19)||a===21?0:1)"; then
  export NODE_OPTIONS="${NODE_OPTIONS:-} --experimental-require-module"
fi
