# @hermeticor/sdk-node

Typed Node.js client for the Hermeticor API (Node 20+). Hermeticor (hermeticor.com) was called Hermetica; headers, env vars and the `hermetica` command keep that name. `@hermeticacomms/*` are the old, deprecated package names, and `@hermetica/*` and `hermetica` on npm belong to an unrelated company.

```ts
import { createClient } from '@hermeticor/sdk-node';

const hm = createClient({ apiKey: process.env.HERMETICA_API_KEY!, baseUrl: 'https://hermeticor.com' });
await hm.profiles.forgetApp({ externalId: 'user_123' }); // the person left this app
```

No schema library at all (fetch only, plain types; reads HERMETICA_URL and HERMETICA_API_KEY or HERMETICA_KEY):

```ts
import { track, forgetApp, sendRaw, identify, verifySignature } from '@hermeticor/sdk-node/lite';

await track({ name: 'signed_up', dedupeKey: `signup-${userId}`, profile: { externalId: userId, email } }); // creates or updates the person too
```

zod is an optional peer dependency, needed only for the full client's TypeScript types.

Guides: https://hermeticor.com/guides/sdks. API reference: https://hermeticor.com/docs (spec at /openapi.json).

Pass `{ idempotencyKey }` on a write to make it safe to retry (the lite entry adds one to every write). Consent and suppression are enforced by the API; the client cannot bypass them.

Generated from the Hermetica monorepo; open issues here, changes land upstream.
