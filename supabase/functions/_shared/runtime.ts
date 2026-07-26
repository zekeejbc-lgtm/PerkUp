export type RuntimeMode = "production" | "development" | "maintenance";

export type RuntimeConfig = {
  mode: RuntimeMode;
  mode_before_maintenance?: "production" | "development";
  maintenance_title?: string;
  maintenance_reason?: string;
  maintenance_details?: string;
  maintenance_started_at?: string | null;
};

export const readRuntimeConfig = async (admin: any): Promise<RuntimeConfig> => {
  const { data, error } = await admin
    .from("system_runtime_config")
    .select("mode,mode_before_maintenance,maintenance_title,maintenance_reason,maintenance_details,maintenance_started_at")
    .eq("id", "global")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return {
      mode: "maintenance",
      maintenance_title: "System status unavailable",
      maintenance_reason: "PerkUp cannot verify the current operating mode.",
    };
  }
  return data as RuntimeConfig;
};

export const maintenanceError = (config: RuntimeConfig) => ({
  error: config.maintenance_reason || "PerkUp is currently under maintenance.",
  code: "maintenance_mode",
  maintenance: {
    title: config.maintenance_title || "Scheduled maintenance",
    reason: config.maintenance_reason || "PerkUp is currently under maintenance.",
    details: config.maintenance_details || "",
    startedAt: config.maintenance_started_at || null,
  },
});
