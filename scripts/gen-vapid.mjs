// Generate VAPID keys for Web Push.
// Usage: node scripts/gen-vapid.mjs
import { generateKeys } from "web-push";

const { publicKey, privateKey } = generateKeys();
console.log("Add these to .env:\n");
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log(`VAPID_SUBJECT=mailto:you@yourdomain`);
