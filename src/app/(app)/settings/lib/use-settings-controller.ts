"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useSetUserRole } from "@/hooks/use-settings";
import type { Role } from "@/lib/permissions";
import { SERVICE_KEYS, type Health } from "./settings-model";

export function useSettingsController() {
  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(false);
  const setRoleMutation = useSetUserRole();

  async function checkHealth() {
    setChecking(true);
    try {
      const h = await api<Health>("/api/health");
      setHealth(h);
    } finally {
      setChecking(false);
    }
  }

  function handleSetRole(userId: string, role: Role) {
    setRoleMutation.mutate({ id: userId, role });
  }

  return {
    health,
    checking,
    checkHealth,
    serviceKeys: SERVICE_KEYS,
    handleSetRole,
    setRoleMutation,
  };
}
