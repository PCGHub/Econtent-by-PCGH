import { createHmac } from "node:crypto";
import { writeFileSync } from "node:fs";
const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const unsigned =
  encode({ alg: "HS256", typ: "JWT" }) +
  "." +
  encode({
    role: "anon",
    iss: "econtent-local-tests",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
  });
const key =
  unsigned +
  "." +
  createHmac("sha256", "local-econtent-test-secret-at-least-32-characters")
    .update(unsigned)
    .digest("base64url");
writeFileSync(
  ".env.local",
  "NEXT_PUBLIC_SUPABASE_URL=http://localhost:55321\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=" +
    key +
    "\n",
  { mode: 0o600 },
);
console.log(
  "Configured .env.local for the isolated local Auth test stack. No cloud secrets used.",
);
