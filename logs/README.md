# Application event log

Events are stored in Turso (`event_logs`) and mirrored here as **JSON Lines** for review in GitHub.

The `category` column stores a canonical **event code** (snake_case). Each code has a fixed **level** that must not be overridden when logging through `logCatalogEvent`.

## Levels

| Code | Severity | When to use |
|------|----------|-------------|
| **C** | Critical | Unhandled failures, outages, or conditions that threaten core operation |
| **W** | Warning | Handled errors, degraded features, or threshold breaches |
| **I** | Informational | Normal audit trail (sign-in, jobs, configuration, API traffic) |

## Canonical events

| Event code | Label | Level |
|------------|-------|-------|
| `environment_crash` | Environment crash | C |
| `system_crash` | System crash | C |
| `application_crash` | Application crash | C |
| `database_connection_failure` | Database connection failure | C |
| `database_query_timeout` | Database query timeout | C |
| `api_gateway_unavailability` | API gateway unavailability | C |
| `core_service_dependency_failure` | Core service dependency failure | C |
| `memory_exhaustion` | Memory exhaustion | C |
| `disk_space_exhaustion` | Disk space exhaustion | C |
| `uncaught_runtime_exception` | Uncaught runtime exception | C |
| `critical_security_breach_detection` | Critical security breach detection | C |
| `hardware_component_failure` | Hardware component failure | C |
| `ssl_tls_certificate_expiration` | SSL/TLS certificate expiration | C |
| `third_party_api_rate_limit_exceeded` | Third-party API rate limit exceeded | W |
| `non_breaking_api_runtime_error` | Non-breaking API runtime error | W |
| `deprecated_software_dependency_usage` | Deprecated software dependency usage | W |
| `deprecated_api_version_usage` | Deprecated API version usage | W |
| `high_memory_utilization_threshold` | High memory utilization threshold reached | W |
| `high_cpu_utilization_threshold` | High CPU utilization threshold reached | W |
| `database_connection_pool_near_capacity` | Database connection pool near capacity | W |
| `failed_user_authentication_attempt` | Failed user authentication attempt | W |
| `malformed_incoming_request_payload` | Malformed incoming request payload | W |
| `slow_query_performance_threshold_exceeded` | Slow query performance threshold exceeded | W |
| `configuration_file_missing_default_fallback` | Configuration file missing default value fallback | W |
| `file_system_write_permission_delay` | File system write permission delay | W |
| `user_login_success` | User login success | I |
| `user_logout` | User logout | I |
| `user_account_registration` | User account registration | I |
| `component_ui_rendering_event` | Component UI rendering event | I |
| `feature_utilization_metrics` | Feature utilization metrics | I |
| `application_configuration_load_success` | Application configuration load success | I |
| `database_migration_execution_success` | Database migration execution success | I |
| `background_job_routine_initialization` | Background job routine initialization | I |
| `background_job_routine_completion` | Background job routine completion | I |
| `api_request_received` | API request received | I |
| `api_response_sent` | API response sent | I |
| `data_export_request_initiated` | Data export request initiated | I |
| `session_token_renewal` | Session token renewal | I |

Source of truth: `src/lib/eventCatalog.ts`.

## JSONL format

Each line in `application-events.jsonl` is one JSON object:

```json
{"at":"2026-05-20T12:00:00.000Z","level":"I","user":"singer","message":"User login success","event":"user_login_success","category":"user_login_success"}
```

The server appends to this file on every logged event (when the filesystem is writable). Production hosts may only persist to the database; export from **God Mode → Event log** in the app or query Turso directly.
