import { corsHeaders } from "./cors.ts";
export { createSafeLogContext } from "./redaction.ts";

const publicBillingMessages = new Set([
  "Bad Request",
  "Conflict",
  "Forbidden",
  "Internal Server Error",
  "Invalid request",
  "Not Found",
  "Operation failed",
  "Service Unavailable",
  "Too Many Requests",
  "Unauthorized",
]);

export function createErrorResponse(
  status: number,
  message: string,
  custom: Record<string, unknown> = {},
) {
  return new Response(JSON.stringify({ status, message, ...custom }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
    status,
  });
}

export function createBillingErrorResponse(
  status: number,
  code: string,
  message: string,
) {
  const safeStatus =
    Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
  const safeCode =
    typeof code === "string" &&
    code.length > 0 &&
    code.length <= 64 &&
    /^[A-Z][A-Z0-9_]*$/.test(code)
      ? code
      : "OPERATION_FAILED";
  const safeMessage = publicBillingMessages.has(message)
    ? message
    : safeStatus >= 500
      ? "Internal Server Error"
      : "Operation failed";

  return new Response(
    JSON.stringify({
      status: safeStatus,
      code: safeCode,
      message: safeMessage,
    }),
    {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: safeStatus,
    },
  );
}
