const REDACTED = "[REDACTED]";
const REDACTED_ERROR = "[REDACTED_ERROR]";
const REDACTED_URL = "[REDACTED_URL]";
const CIRCULAR = "[CIRCULAR]";
const MAX_DEPTH = "[MAX_DEPTH]";
const UNSUPPORTED = "[UNSUPPORTED]";

const prohibitedKeys = new Set([
  "authorization",
  "apikey",
  "body",
  "content",
  "cookie",
  "credentials",
  "detail",
  "details",
  "email",
  "error",
  "evidence",
  "hint",
  "id",
  "message",
  "password",
  "passwd",
  "phone",
  "query",
  "rawbody",
  "rawpayload",
  "reason",
  "request",
  "response",
  "secret",
  "signature",
  "signedurl",
  "sql",
  "stack",
  "token",
  "url",
]);

const prohibitedKeyFragments = [
  "authorization",
  "credential",
  "evidencecontent",
  "evidencepath",
  "objectpath",
  "password",
  "providerpayload",
  "secret",
  "signature",
  "signedurl",
  "storagepath",
  "token",
];

const permittedCorrelationKeys = new Set(["correlationid", "requestid"]);

export type RedactionOptions = {
  maxDepth?: number;
};

export type SafeLogContext = Partial<{
  operation: string;
  code: string;
  result: string;
  reason_code: string;
  request_id: string;
  status: number;
}>;

function normalizedKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isProhibitedKey(key: string) {
  const normalized = normalizedKey(key);
  if (permittedCorrelationKeys.has(normalized)) return false;
  if (prohibitedKeys.has(normalized)) return true;
  if (normalized.endsWith("email") || normalized.includes("emailaddress")) {
    return true;
  }
  if (normalized.endsWith("phone") || normalized.includes("phonenumber")) {
    return true;
  }
  if (normalized.endsWith("id")) return true;
  return prohibitedKeyFragments.some((fragment) =>
    normalized.includes(fragment),
  );
}

function isPlainObject(value: object) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function redactString(value: string) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return REDACTED_URL;
  if ((value.includes("?") || value.includes("#")) && value.includes("/")) {
    return REDACTED_URL;
  }

  let redacted = value
    .replace(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "[REDACTED_JWT]",
    )
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(
      /\b(authorization|api[_-]?key|password|passwd|secret|token|credential|signature)\s*[=:]\s*[^\s,;]+/gi,
      "$1=[REDACTED]",
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/(?:\+?\d[\s().-]*){7,}\d/g, "[REDACTED_PHONE]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[REDACTED_TOKEN]");

  if (
    /(?:^|[/\\])[^/\\]+\.(?:csv|docx?|heic|jpe?g|pdf|png|tiff?|xlsx?)$/i.test(
      redacted,
    )
  ) {
    redacted = "[REDACTED_PATH]";
  }
  return redacted;
}

function boundedDepth(value: number | undefined) {
  if (!Number.isInteger(value)) return 8;
  return Math.min(Math.max(value as number, 1), 20);
}

function redactRecursive(
  value: unknown,
  depth: number,
  maxDepth: number,
  seen: WeakSet<object>,
): unknown {
  if (value === null) return null;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : UNSUPPORTED;
  }
  if (typeof value !== "object") return UNSUPPORTED;
  if (value instanceof Error) return REDACTED_ERROR;
  if (depth >= maxDepth) return MAX_DEPTH;
  if (seen.has(value)) return CIRCULAR;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) =>
      redactRecursive(entry, depth + 1, maxDepth, seen),
    );
  }
  if (!isPlainObject(value)) return UNSUPPORTED;

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    if (isProhibitedKey(key)) {
      try {
        result[key] =
          (value as Record<string, unknown>)[key] instanceof Error
            ? REDACTED_ERROR
            : REDACTED;
      } catch {
        result[key] = REDACTED;
      }
      continue;
    }
    try {
      result[key] = redactRecursive(
        (value as Record<string, unknown>)[key],
        depth + 1,
        maxDepth,
        seen,
      );
    } catch {
      result[key] = UNSUPPORTED;
    }
  }
  return result;
}

export function redactSensitiveValue(
  value: unknown,
  options: RedactionOptions = {},
): unknown {
  try {
    return redactRecursive(
      value,
      0,
      boundedDepth(options.maxDepth),
      new WeakSet<object>(),
    );
  } catch {
    return UNSUPPORTED;
  }
}

function safeString(value: unknown, pattern: RegExp) {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    return undefined;
  }
  if (!pattern.test(value)) return undefined;
  const redacted = redactString(value);
  return redacted === value ? value : undefined;
}

function safeRequestId(value: unknown) {
  if (typeof value !== "string" || value.length < 8 || value.length > 64) {
    return undefined;
  }
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value) ? value : undefined;
}

export function createSafeLogContext(input: unknown): SafeLogContext {
  if (input === null || typeof input !== "object" || !isPlainObject(input)) {
    return {};
  }
  const source = input as Record<string, unknown>;
  const context: SafeLogContext = {};

  const operation = safeString(source.operation, /^[A-Za-z][A-Za-z0-9_.-]*$/);
  const code = safeString(source.code, /^[A-Z][A-Z0-9_]*$/);
  const result = safeString(
    source.result,
    /^(succeeded|denied|failed|ignored|pending)$/,
  );
  const reasonCode = safeString(
    source.reasonCode ?? source.reason_code,
    /^[A-Z][A-Z0-9_]*$/,
  );
  const requestId = safeRequestId(
    source.requestId ?? source.request_id ?? source.correlationId,
  );

  if (operation) context.operation = operation;
  if (code) context.code = code;
  if (result) context.result = result;
  if (reasonCode) context.reason_code = reasonCode;
  if (requestId) context.request_id = requestId;
  if (
    typeof source.status === "number" &&
    Number.isInteger(source.status) &&
    source.status >= 100 &&
    source.status <= 599
  ) {
    context.status = source.status;
  }
  return context;
}
