import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

interface VercelHeader {
  key: string;
  value: string;
}

interface VercelHeaderRule {
  source: string;
  headers: VercelHeader[];
}

test("permits the partner location geocoder in the deployed connect-src policy", () => {
  const config = JSON.parse(
    readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
  ) as { headers: VercelHeaderRule[] };
  const catchAllRule = config.headers.find((rule) => rule.source === "/(.*)");
  const policy = catchAllRule?.headers.find(
    (header) => header.key === "Content-Security-Policy",
  )?.value;
  const connectSources = policy
    ?.split(";")
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith("connect-src "))
    ?.split(/\s+/)
    .slice(1);

  expect(connectSources).toContain("https://nominatim.openstreetmap.org");
});
