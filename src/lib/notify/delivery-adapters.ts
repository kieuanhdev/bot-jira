/**
 * Delivery adapters for Push and Chat (Discord) channels.
 *
 * Each adapter implements `DeliveryAdapter` from `./delivery-contract`.
 */

import { prisma as defaultPrisma } from "@/lib/prisma";
import { sendPush as defaultSendPush } from "./push";
import { sendChatOutbox as defaultSendChatOutbox } from "./chat-delivery";
import {
  type DeliveryAdapter,
  type DeliveryOutcome,
  type OutboxItem,
  classifyPushError,
  classifyChatError,
} from "./delivery-contract";

export interface PushAdapterDeps {
  prisma?: typeof defaultPrisma;
  sendPush?: typeof defaultSendPush;
}

export class PushDeliveryAdapter implements DeliveryAdapter {
  readonly channel = "push";
  private prisma: typeof defaultPrisma;
  private sendPush: typeof defaultSendPush;

  constructor(deps?: PushAdapterDeps) {
    this.prisma = deps?.prisma ?? defaultPrisma;
    this.sendPush = deps?.sendPush ?? defaultSendPush;
  }

  async deliver(item: OutboxItem): Promise<DeliveryOutcome> {
    const user = await this.prisma.user.findUnique({
      where: { id: item.userId },
      select: { id: true, pushSubscription: true },
    });

    if (!user) {
      return { status: "skipped", reason: "user not found" };
    }

    if (!user.pushSubscription) {
      return { status: "skipped", reason: "no push subscription" };
    }

    try {
      await this.sendPush(item.userId, {
        title: item.title,
        body: item.body,
        url: item.link ?? "/",
      });
      return { status: "sent" };
    } catch (pushError) {
      const classified = classifyPushError(pushError);
      if (classified.isSubscriptionGone) {
        return {
          status: "skipped",
          reason: "subscription gone",
          cleanupSubscription: true,
        };
      }
      return {
        status: "retry",
        error: classified.sanitizedMessage,
      };
    }
  }
}

export interface DiscordAdapterDeps {
  sendChatOutbox?: typeof defaultSendChatOutbox;
}

export class DiscordDeliveryAdapter implements DeliveryAdapter {
  readonly channel = "discord";
  private sendChatOutbox: typeof defaultSendChatOutbox;

  constructor(deps?: DiscordAdapterDeps) {
    this.sendChatOutbox = deps?.sendChatOutbox ?? defaultSendChatOutbox;
  }

  async deliver(item: OutboxItem): Promise<DeliveryOutcome> {
    try {
      const delivered = await this.sendChatOutbox({
        userId: item.userId,
        title: item.title,
        body: item.body,
        link: item.link,
      });

      if (!delivered) {
        return { status: "skipped", reason: "no Discord destination" };
      }
      return { status: "sent" };
    } catch (chatError) {
      const classified = classifyChatError(chatError);
      return {
        status: "retry",
        error: classified.sanitizedMessage,
        retryAfterMs: classified.retryAfterMs,
      };
    }
  }
}

export class UnsupportedChannelAdapter implements DeliveryAdapter {
  constructor(readonly channel: string) {}

  async deliver(): Promise<DeliveryOutcome> {
    return {
      status: "skipped",
      reason: `unsupported channel: ${this.channel}`,
    };
  }
}

export const defaultPushAdapter = new PushDeliveryAdapter();
export const defaultDiscordAdapter = new DiscordDeliveryAdapter();

/**
 * Resolve the appropriate adapter for a given notification channel.
 */
export function getDeliveryAdapter(
  channel: string,
  deps?: { push?: PushAdapterDeps; discord?: DiscordAdapterDeps }
): DeliveryAdapter {
  if (channel === "push") {
    return deps?.push ? new PushDeliveryAdapter(deps.push) : defaultPushAdapter;
  }
  if (channel === "discord" || channel === "chat") {
    return deps?.discord ? new DiscordDeliveryAdapter(deps.discord) : defaultDiscordAdapter;
  }
  return new UnsupportedChannelAdapter(channel);
}
