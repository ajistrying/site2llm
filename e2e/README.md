# E2E Testing Guide

## Running Tests

```bash
# Run all e2e tests
npx playwright test

# Run with browser visible (headed mode)
npx playwright test --headed

# Run specific test file
npx playwright test e2e/core-flow.test.ts --headed

# Run with UI mode (best for debugging)
npx playwright test --ui
```

## Test Files

- **core-flow.test.ts** - Basic app functionality (form, generation, localStorage)
- **stripe-flow.test.ts** - Full payment flow with mocked Stripe webhook

## Testing Stripe Payments

### Option 1: Mock Webhook (Default)

The `stripe-flow.test.ts` tests simulate Stripe webhooks by generating valid signatures
locally. This is fast and doesn't require external services.

**Setup:**
```bash
# Set a test webhook secret in .env.local or export it
export STRIPE_WEBHOOK_SECRET=whsec_test_secret_for_testing

# Run the tests
npx playwright test e2e/stripe-flow.test.ts --headed
```

### Option 2: Real Stripe Test Mode with CLI

For more realistic testing, use the Stripe CLI to forward actual webhooks.

**Setup:**

1. Install Stripe CLI:
   ```bash
   brew install stripe/stripe-cli/stripe
   # or download from https://stripe.com/docs/stripe-cli
   ```

2. Login to Stripe:
   ```bash
   stripe login
   ```

3. Start webhook forwarding (in a separate terminal):
   ```bash
   stripe listen --forward-to localhost:4173/api/stripe/webhook
   ```

   This will output a webhook signing secret like:
   ```
   Ready! Your webhook signing secret is whsec_xxxxx
   ```

4. Set the secret in your environment:
   ```bash
   export STRIPE_WEBHOOK_SECRET=whsec_xxxxx
   ```

5. Use Stripe test card for checkout:
   - Card number: `4242 4242 4242 4242`
   - Expiry: Any future date
   - CVC: Any 3 digits
   - ZIP: Any 5 digits

**Manual Testing Flow:**

1. Start the app: `pnpm run preview` (after `pnpm run build`)
2. Fill the form and generate llms.txt
3. Click "Pay to unlock"
4. Use test card `4242424242424242` in Stripe checkout
5. After success, you should return to the app with download enabled
6. Watch the Stripe CLI terminal to see webhook events

### Stripe Test Cards

| Card Number         | Description              |
|---------------------|--------------------------|
| 4242 4242 4242 4242 | Succeeds                 |
| 4000 0000 0000 9995 | Insufficient funds       |
| 4000 0000 0000 0002 | Card declined            |
| 4000 0025 0000 3155 | Requires authentication  |

## Environment Variables

Required for Stripe testing:
```env
STRIPE_SECRET_KEY=sk_test_xxx        # Stripe test secret key
STRIPE_PRICE_ID=price_xxx            # Your test price ID
STRIPE_WEBHOOK_SECRET=whsec_xxx      # Webhook signing secret
```

## Debugging

```bash
# Run with Playwright inspector
npx playwright test --debug

# Run with trace recording
npx playwright test --trace on

# View trace after test
npx playwright show-trace test-results/trace.zip
```
