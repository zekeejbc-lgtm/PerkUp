import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

export type RuntimeMode = "production" | "development" | "maintenance";

export type RuntimeConfig = {
  id: "global";
  mode: RuntimeMode;
  modeBeforeMaintenance: "production" | "development";
  maintenanceTitle: string;
  maintenanceReason: string;
  maintenanceDetails: string;
  maintenanceStartedAt: string | null;
  subscriptionUpgradesEnabled: boolean;
  subscriptionUpgradesChangedAt: string | null;
  modeChangedAt: string;
  updatedAt: string;
};

const unavailableConfig: RuntimeConfig = {
  id: "global",
  mode: "maintenance",
  modeBeforeMaintenance: "production",
  maintenanceTitle: "Perk is temporarily unavailable",
  maintenanceReason: "We could not verify the current system status. Access is paused as a safety precaution.",
  maintenanceDetails: "Please try again shortly. An auditor can use the recovery option below.",
  maintenanceStartedAt: null,
  subscriptionUpgradesEnabled: false,
  subscriptionUpgradesChangedAt: null,
  modeChangedAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

type RuntimeModeContextValue = {
  config: RuntimeConfig;
  loading: boolean;
  statusUnavailable: boolean;
  refreshRuntimeMode: () => Promise<RuntimeConfig>;
};

const RuntimeModeContext = createContext<RuntimeModeContextValue | null>(null);

const mapRuntimeConfig = (row: Record<string, unknown>): RuntimeConfig => ({
  id: "global",
  mode: row.mode === "development" || row.mode === "maintenance" ? row.mode : "production",
  modeBeforeMaintenance: row.mode_before_maintenance === "development" ? "development" : "production",
  maintenanceTitle: String(row.maintenance_title || "Scheduled maintenance"),
  maintenanceReason: String(row.maintenance_reason || "Perk is temporarily unavailable."),
  maintenanceDetails: String(row.maintenance_details || ""),
  maintenanceStartedAt: row.maintenance_started_at ? String(row.maintenance_started_at) : null,
  subscriptionUpgradesEnabled: row.subscription_upgrades_enabled === true,
  subscriptionUpgradesChangedAt: row.subscription_upgrades_changed_at
    ? String(row.subscription_upgrades_changed_at)
    : null,
  modeChangedAt: String(row.mode_changed_at || new Date().toISOString()),
  updatedAt: String(row.updated_at || new Date().toISOString()),
});

export function RuntimeModeProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<RuntimeConfig>(unavailableConfig);
  const [loading, setLoading] = useState(true);
  const [statusUnavailable, setStatusUnavailable] = useState(false);

  const refreshRuntimeMode = useCallback(async () => {
    const { data, error } = await supabase
      .from("system_runtime_config")
      .select("id,mode,mode_before_maintenance,maintenance_title,maintenance_reason,maintenance_details,maintenance_started_at,subscription_upgrades_enabled,subscription_upgrades_changed_at,mode_changed_at,updated_at")
      .eq("id", "global")
      .single();
    if (error || !data) {
      setConfig(unavailableConfig);
      setStatusUnavailable(true);
      setLoading(false);
      throw error || new Error("Runtime status was unavailable.");
    }
    const next = mapRuntimeConfig(data as Record<string, unknown>);
    setConfig(next);
    setStatusUnavailable(false);
    setLoading(false);
    return next;
  }, []);

  useEffect(() => {
    void refreshRuntimeMode().catch((error) => {
      console.error("Runtime status check failed:", error);
    });

    const channel = supabase
      .channel("public-system-runtime-config")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "system_runtime_config", filter: "id=eq.global" },
        () => void refreshRuntimeMode().catch(() => undefined),
      )
      .subscribe();
    const timer = window.setInterval(
      () => void refreshRuntimeMode().catch(() => undefined),
      5_000,
    );
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshRuntimeMode().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [refreshRuntimeMode]);

  const value = useMemo(
    () => ({ config, loading, statusUnavailable, refreshRuntimeMode }),
    [config, loading, refreshRuntimeMode, statusUnavailable],
  );

  return <RuntimeModeContext.Provider value={value}>{children}</RuntimeModeContext.Provider>;
}

export function useRuntimeMode() {
  const context = useContext(RuntimeModeContext);
  if (!context) throw new Error("useRuntimeMode must be used within RuntimeModeProvider.");
  return context;
}
