import {
  assertEquals,
} from "jsr:@std/assert@1";
import {
  isStaleSubscriptionUpgradeError,
} from "./subscription-upgrade-error.ts";

Deno.test("recognizes the dedicated stale-upgrade SQLSTATE", () => {
  assertEquals(isStaleSubscriptionUpgradeError({ code: "PUG01" }), true);
});

Deno.test("does not treat serialization failures as stale-upgrade errors", () => {
  assertEquals(isStaleSubscriptionUpgradeError({ code: "40001" }), false);
});

Deno.test("does not infer stale-upgrade errors from messages", () => {
  assertEquals(isStaleSubscriptionUpgradeError(new Error("stale")), false);
});
