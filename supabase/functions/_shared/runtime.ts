export type RuntimeMode = "production" | "development" | "maintenance";

export type RuntimeConfig = {
  mode: RuntimeMode;
  mode_before_maintenance?: "production" | "development";
  maintenance_title?: string;
  maintenance_reason?: string;
  maintenance_details?: string;
  maintenance_started_at?: string | null;
  subscription_upgrades_enabled: boolean;
  subscription_upgrades_changed_at?: string | null;
  subscription_upgrades_changed_by?: string | null;
};

export const readRuntimeConfig = async (admin: any): Promise<RuntimeConfig> => {
  const { data, error } = await admin
    .from("system_runtime_config")
    .select("mode,mode_before_maintenance,maintenance_title,maintenance_reason,maintenance_details,maintenance_started_at,subscription_upgrades_enabled,subscription_upgrades_changed_at,subscription_upgrades_changed_by")
    .eq("id", "global")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return {
      mode: "maintenance",
      maintenance_title: "System status unavailable",
      maintenance_reason: "Perk cannot verify the current operating mode.",
      subscription_upgrades_enabled: false,
    };
  }
  return {
    ...data,
    subscription_upgrades_enabled: data.subscription_upgrades_enabled === true,
  } as RuntimeConfig;
};

export const maintenanceError = (config: RuntimeConfig) => ({
  error: config.maintenance_reason || "Perk is currently under maintenance.",
  code: "maintenance_mode",
  maintenance: {
    title: config.maintenance_title || "Scheduled maintenance",
    reason: config.maintenance_reason || "Perk is currently under maintenance.",
    details: config.maintenance_details || "",
    startedAt: config.maintenance_started_at || null,
  },
});
