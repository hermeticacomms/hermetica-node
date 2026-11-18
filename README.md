# @hermeticacomms/sdk-node

Typed Node.js client for the Hermeticor API (Node 20+). The product is Hermeticor (hermeticor.com); the SDKs, CLI, headers and env vars keep its earlier name Hermetica. `@hermetica/*` and `hermetica` on npm belong to an unrelated company.

```ts
import { createClient } from '@hermeticacomms/sdk-node';

const hm = createClient({ apiKey: process.env.HERMETICA_API_KEY!, baseUrl: 'https://hermeticor.com' });
await hm.profiles.forgetApp({ externalId: 'user_123' }); // the person left this app
```

Guides: https://hermeticor.com/guides/sdks. API reference: https://hermeticor.com/docs (spec at /openapi.json).

Every non-GET call sends an `Idempotency-Key`. Consent and suppression are enforced by the API; the client cannot bypass them.

Generated from the Hermetica monorepo; open issues here, changes land upstream.
