/** RFC 5424–style severities stored as single-letter codes in the database. */
export type EventLevelCode = "C" | "W" | "I";

export type EventDefinition = {
  level: EventLevelCode;
  label: string;
};

/**
 * Canonical application event types. The `category` column in `event_logs`
 * stores these codes; levels are fixed per event and must not be overridden.
 */
export const EVENT_CATALOG = {
  environment_crash: { level: "C", label: "Environment crash" },
  system_crash: { level: "C", label: "System crash" },
  application_crash: { level: "C", label: "Application crash" },
  database_connection_failure: {
    level: "C",
    label: "Database connection failure",
  },
  database_query_timeout: { level: "C", label: "Database query timeout" },
  api_gateway_unavailability: {
    level: "C",
    label: "API gateway unavailability",
  },
  core_service_dependency_failure: {
    level: "C",
    label: "Core service dependency failure",
  },
  memory_exhaustion: { level: "C", label: "Memory exhaustion" },
  disk_space_exhaustion: { level: "C", label: "Disk space exhaustion" },
  uncaught_runtime_exception: {
    level: "C",
    label: "Uncaught runtime exception",
  },
  critical_security_breach_detection: {
    level: "C",
    label: "Critical security breach detection",
  },
  hardware_component_failure: {
    level: "C",
    label: "Hardware component failure",
  },
  ssl_tls_certificate_expiration: {
    level: "C",
    label: "SSL/TLS certificate expiration",
  },
  third_party_api_rate_limit_exceeded: {
    level: "W",
    label: "Third-party API rate limit exceeded",
  },
  non_breaking_api_runtime_error: {
    level: "W",
    label: "Non-breaking API runtime error",
  },
  deprecated_software_dependency_usage: {
    level: "W",
    label: "Deprecated software dependency usage",
  },
  deprecated_api_version_usage: {
    level: "W",
    label: "Deprecated API version usage",
  },
  high_memory_utilization_threshold: {
    level: "W",
    label: "High memory utilization threshold reached",
  },
  high_cpu_utilization_threshold: {
    level: "W",
    label: "High CPU utilization threshold reached",
  },
  database_connection_pool_near_capacity: {
    level: "W",
    label: "Database connection pool near capacity",
  },
  failed_user_authentication_attempt: {
    level: "W",
    label: "Failed user authentication attempt",
  },
  malformed_incoming_request_payload: {
    level: "W",
    label: "Malformed incoming request payload",
  },
  slow_query_performance_threshold_exceeded: {
    level: "W",
    label: "Slow query performance threshold exceeded",
  },
  configuration_file_missing_default_fallback: {
    level: "W",
    label: "Configuration file missing default value fallback",
  },
  file_system_write_permission_delay: {
    level: "W",
    label: "File system write permission delay",
  },
  user_login_success: { level: "I", label: "User login success" },
  user_logout: { level: "I", label: "User logout" },
  user_account_registration: {
    level: "I",
    label: "User account registration",
  },
  component_ui_rendering_event: {
    level: "I",
    label: "Component UI rendering event",
  },
  feature_utilization_metrics: {
    level: "I",
    label: "Feature utilization metrics",
  },
  application_configuration_load_success: {
    level: "I",
    label: "Application configuration load success",
  },
  database_migration_execution_success: {
    level: "I",
    label: "Database migration execution success",
  },
  background_job_routine_initialization: {
    level: "I",
    label: "Background job routine initialization",
  },
  background_job_routine_completion: {
    level: "I",
    label: "Background job routine completion",
  },
  api_request_received: { level: "I", label: "API request received" },
  api_response_sent: { level: "I", label: "API response sent" },
  data_export_request_initiated: {
    level: "I",
    label: "Data export request initiated",
  },
  session_token_renewal: { level: "I", label: "Session token renewal" },
} as const satisfies Record<string, EventDefinition>;

export type EventCode = keyof typeof EVENT_CATALOG;

const LEGACY_CATEGORY_LABELS: Record<string, string> = {
  auth: "Authentication",
  api: "API",
  client: "Client",
  data: "Data",
  enrichment: "Enrichment",
  godmode: "God mode",
  http: "HTTP",
  karafun: "KaraFun",
  process: "Process",
  release: "Release",
  spotify: "Spotify",
  system: "System",
};

export function isEventCode(value: string): value is EventCode {
  return Object.prototype.hasOwnProperty.call(EVENT_CATALOG, value);
}

export function getEventDefinition(
  code: string | null | undefined
): EventDefinition | null {
  if (!code) return null;
  if (isEventCode(code)) return EVENT_CATALOG[code];
  return null;
}

export function levelForEvent(code: EventCode): EventLevelCode {
  return EVENT_CATALOG[code].level;
}

export function labelForEvent(code: string | null | undefined): string {
  const def = getEventDefinition(code);
  if (def) return def.label;
  if (!code) return "—";
  if (LEGACY_CATEGORY_LABELS[code]) return LEGACY_CATEGORY_LABELS[code];
  return code
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function levelTitle(level: EventLevelCode): string {
  if (level === "C") return "Critical";
  if (level === "W") return "Warning";
  return "Informational";
}

export const EVENT_CATALOG_ENTRIES = Object.entries(EVENT_CATALOG).map(
  ([code, def]) => ({
    code: code as EventCode,
    level: def.level,
    label: def.label,
  })
);
