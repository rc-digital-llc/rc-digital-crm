#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CONTRACT_PATH = ".github/release/production-auth.json";

const redirectUrls = (value) =>
  String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export function verifyProductionAuthConfig({
  expected,
  current,
  projectRef,
}) {
  if (!expected || typeof expected !== "object") {
    throw new Error("production Auth contract is invalid");
  }
  if (projectRef !== expected.project_ref) {
    throw new Error("production Auth project reference does not match");
  }
  if (current?.site_url !== expected.site_url) {
    throw new Error("production Auth Site URL does not match the canonical URL");
  }

  const liveRedirects = redirectUrls(current?.uri_allow_list);
  const requiredRedirects = expected.required_redirect_urls;
  if (!Array.isArray(requiredRedirects) || requiredRedirects.length === 0) {
    throw new Error("production Auth contract has no required redirects");
  }
  for (const required of requiredRedirects) {
    if (!liveRedirects.includes(required)) {
      throw new Error("production Auth required redirect is missing");
    }
  }

  const forbiddenPatterns = expected.forbidden_redirect_url_patterns;
  if (!Array.isArray(forbiddenPatterns) || forbiddenPatterns.length === 0) {
    throw new Error("production Auth contract has no forbidden patterns");
  }
  const liveUrls = [String(current.site_url), ...liveRedirects];
  for (const pattern of forbiddenPatterns) {
    if (
      liveUrls.some((url) =>
        url.toLowerCase().includes(String(pattern).toLowerCase()),
      )
    ) {
      throw new Error("production Auth contains a forbidden redirect URL");
    }
  }

  return {
    project_ref: projectRef,
    site_url: current.site_url,
    required_redirects_verified: requiredRedirects.length,
  };
}

export async function fetchProductionAuthConfig({ projectRef, accessToken }) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/config/auth`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    throw new Error(
      `Supabase Auth configuration readback failed with HTTP ${response.status}`,
    );
  }
  return response.json();
}

async function main() {
  try {
    const contractPath = process.argv[2] ?? DEFAULT_CONTRACT_PATH;
    if (process.argv.length > 3) {
      throw new Error(
        "usage: verify-production-auth-config.mjs [contract.json]",
      );
    }
    const expected = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    const projectRef = process.env.SUPABASE_PROJECT_ID;
    const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
    if (!projectRef || !accessToken) {
      throw new Error("production Auth readback credentials are missing");
    }
    if (
      process.env.RELEASE_PROVIDER_TARGET &&
      process.env.RELEASE_PROVIDER_TARGET !== projectRef
    ) {
      throw new Error("release provider target does not match the Auth project");
    }

    const current = await fetchProductionAuthConfig({
      projectRef,
      accessToken,
    });
    const report = verifyProductionAuthConfig({
      expected,
      current,
      projectRef,
    });
    process.stdout.write(`${JSON.stringify({ verified: true, ...report })}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "error"}\n`,
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
