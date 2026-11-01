# @hermeticacomms/sdk-node

Typed Node.js client for the Hermetica API (Node 20+).

```ts
import { createClient } from '@hermeticacomms/sdk-node';

const hm = createClient({ apiKey: process.env.HERMETICA_API_KEY!, baseUrl: 'https://api.example.com' });
```

Every non-GET call sends an `Idempotency-Key`. Consent and suppression are enforced by the API; the client cannot bypass them.

Generated from the Hermetica monorepo; open issues here, changes land upstream.
