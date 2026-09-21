declare module "web-push" {
  export interface PushSubscription {
    endpoint: string;
    keys?: { p256dh?: string; auth?: string };
    expirationTime?: number | null;
  }
  export function setVapidDetails(
    subject: string,
    publicKey: string,
    privateKey: string
  ): void;
  export function sendNotification(
    subscription: PushSubscription,
    payload?: string,
    options?: { ttl?: number; urgency?: string }
  ): Promise<void>;
}
