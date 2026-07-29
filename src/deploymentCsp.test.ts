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

const getCatchAllCspDirectiveSources = (directiveName: string) => {
  const config = JSON.parse(
    readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
  ) as { headers: VercelHeaderRule[] };
  const catchAllRule = config.headers.find((rule) => rule.source === "/(.*)");
  const policy = catchAllRule?.headers.find(
    (header) => header.key === "Content-Security-Policy",
  )?.value;

  return policy
    ?.split(";")
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith(`${directiveName} `))
    ?.split(/\s+/)
    .slice(1);
};

test("permits the partner location geocoder in the deployed connect-src policy", () => {
  const connectSources = getCatchAllCspDirectiveSources("connect-src");
  expect(connectSources).toContain("https://nominatim.openstreetmap.org");
});

test("permits WebAssembly compilation without allowing general string evaluation", () => {
  const scriptSources = getCatchAllCspDirectiveSources("script-src");

  expect(scriptSources).toContain("'wasm-unsafe-eval'");
  expect(scriptSources).not.toContain("'unsafe-eval'");
});

test("permits scanner audio embedded as a data URL", () => {
  const mediaSources = getCatchAllCspDirectiveSources("media-src");

  expect(mediaSources).toContain("data:");
});

test("permits configured HTTPS video embeds and direct video links", () => {
  const frameSources = getCatchAllCspDirectiveSources("frame-src");
  const mediaSources = getCatchAllCspDirectiveSources("media-src");

  expect(frameSources).toContain("https:");
  expect(mediaSources).toContain("https:");
  expect(mediaSources).toContain("blob:");
});
