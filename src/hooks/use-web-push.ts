"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushStatus =
  | "unsupported"
  | "prompt"
  | "granted"
  | "denied"
  | "loading";

export function useWebPush() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    if (typeof window === "undefined") return;

    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setIsSupported(supported);

    if (!supported) {
      setLoading(false);
      return;
    }

    setPermission(Notification.permission);

    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        setIsSubscribed(Boolean(sub));
      } else {
        setIsSubscribed(false);
      }
    } catch (err) {
      console.warn("Failed to check push subscription:", err);
      setIsSubscribed(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void checkStatus();
  }, [checkStatus]);

  const subscribe = async (): Promise<boolean> => {
    setError(null);
    setLoading(true);

    try {
      if (!isSupported) {
        throw new Error("Trình duyệt không hỗ trợ Web Push.");
      }

      // Request browser permission
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== "granted") {
        throw new Error("Bạn đã từ chối cấp quyền thông báo trình duyệt.");
      }

      // Fetch VAPID public key
      const { publicKey } = await api<{ publicKey: string | null }>("/api/push/vapid");
      if (!publicKey) {
        throw new Error("Hệ thống chưa cấu hình VAPID keys cho Web Push.");
      }

      // Register service worker if needed
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      // Subscribe with PushManager
      const convertedKey = urlBase64ToUint8Array(publicKey);
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey,
        });
      }

      // Send to server
      await api("/api/push/subscribe", {
        method: "POST",
        body: { subscription: sub.toJSON() },
      });

      setIsSubscribed(true);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async (): Promise<boolean> => {
    setError(null);
    setLoading(true);

    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
        }
      }

      await api("/api/push/subscribe", {
        method: "POST",
        body: { unsubscribe: true },
      });

      setIsSubscribed(false);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const sendTestNotification = async (): Promise<void> => {
    setError(null);
    await api("/api/push/test", { method: "POST" });
  };

  return {
    isSupported,
    permission,
    isSubscribed,
    loading,
    error,
    subscribe,
    unsubscribe,
    sendTestNotification,
    refreshStatus: checkStatus,
  };
}
