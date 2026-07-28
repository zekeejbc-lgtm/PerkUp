import assert from "node:assert/strict";
import test from "node:test";
import {
  archivePayMongoInvoiceLinks,
  archivePayMongoPaymentLink,
} from "./paymongo.ts";

const archivedResponse = (id = "link_live_1") =>
  new Response(JSON.stringify({
    data: {
      id,
      amount: 50000,
      currency: "PHP",
      description: "Perk subscription",
      remarks: "Invoice invoice-1",
      status: "archived",
      livemode: true,
      url: "https://pm.link/perk/ABC123",
      reference_number: "ABC123",
      metadata: { invoice_id: "invoice-1" },
      restrictions: { completed_sessions: { count: 0, limit: 1 } },
      created_at: "2026-07-28T00:00:00Z",
      updated_at: "2026-07-28T00:01:00Z",
    },
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const emptyPaymentsResponse = () =>
  new Response(JSON.stringify({ data: [] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const activeResponse = (id = "link_live_1") =>
  new Response(JSON.stringify({
    data: {
      id,
      status: "active",
      livemode: true,
    },
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

test("archives an unpaid live link with the documented PATCH request", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.includes("/payments?")) return emptyPaymentsResponse();
    return init?.method === "PATCH" ? archivedResponse() : activeResponse();
  };

  const result = await archivePayMongoInvoiceLinks([{
    paymongo_link_id: "link_live_1",
    status: "link_created",
    livemode: true,
  }], {
    mode: "live",
    secretKey: "sk_live_example",
    fetcher,
  });

  assert.deepEqual(result, { archived: 1, skippedTest: 0 });
  assert.equal(requests.length, 3);
  assert.equal(requests[1].url, "https://api.paymongo.com/v1/payment_links/link_live_1");
  assert.equal(requests[1].init?.method, "PATCH");
  assert.equal(
    new Headers(requests[1].init?.headers).get("Authorization"),
    `Basic ${btoa("sk_live_example:")}`,
  );
  assert.equal(
    new Headers(requests[1].init?.headers).get("Content-Type"),
    "application/json",
  );
  assert.deepEqual(JSON.parse(String(requests[1].init?.body)), { archive: true });
  assert.equal(
    requests[2].url,
    "https://api.paymongo.com/v1/payment_links/link_live_1/payments?status=paid",
  );
  assert.equal(requests[2].init?.method, "GET");
});

test("URL-encodes a payment link ID before archiving it", async () => {
  const capturedUrls: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    capturedUrls.push(url);
    if (url.includes("/payments?")) return emptyPaymentsResponse();
    return init?.method === "PATCH"
      ? archivedResponse("link/with space")
      : activeResponse("link/with space");
  };

  await archivePayMongoPaymentLink("link/with space", "sk_test_example", fetcher);

  assert.equal(
    capturedUrls[0],
    "https://api.paymongo.com/v1/payment_links/link%2Fwith%20space",
  );
});

test("does not archive paid invoices or rows without link IDs", async () => {
  const fetcher: typeof fetch = async () => {
    throw new Error("PayMongo must not be called");
  };

  const result = await archivePayMongoInvoiceLinks([
    { paymongo_link_id: "link_paid", status: "paid", livemode: true },
    { paymongo_link_id: null, status: "link_created", livemode: true },
  ], {
    mode: "live",
    fetcher,
  });

  assert.deepEqual(result, { archived: 0, skippedTest: 0 });
});

test("deduplicates repeated payment link IDs", async () => {
  let patchCount = 0;
  const fetcher: typeof fetch = async (_input, init) => {
    if (String(_input).includes("/payments?")) return emptyPaymentsResponse();
    if (init?.method === "PATCH") {
      patchCount += 1;
      return archivedResponse("link_duplicate");
    }
    return activeResponse("link_duplicate");
  };

  const result = await archivePayMongoInvoiceLinks([
    { paymongo_link_id: "link_duplicate", status: "failed", livemode: true },
    { paymongo_link_id: "link_duplicate", status: "expired", livemode: true },
  ], {
    mode: "live",
    secretKey: "sk_live_example",
    fetcher,
  });

  assert.equal(patchCount, 1);
  assert.deepEqual(result, { archived: 1, skippedTest: 0 });
});

test("skips test links while configured for live mode", async () => {
  const fetcher: typeof fetch = async () => {
    throw new Error("A test link must not be sent to the live API key");
  };

  const result = await archivePayMongoInvoiceLinks([{
    paymongo_link_id: "link_test_1",
    status: "pending",
    livemode: false,
  }], {
    mode: "live",
    fetcher,
  });

  assert.deepEqual(result, { archived: 0, skippedTest: 1 });
});

test("rejects a live link while configured for test mode", async () => {
  const fetcher: typeof fetch = async () => {
    throw new Error("The live link must be rejected before an API request");
  };

  await assert.rejects(
    archivePayMongoInvoiceLinks([{
      paymongo_link_id: "link_live_1",
      status: "pending",
      livemode: true,
    }], {
      mode: "test",
      secretKey: "sk_test_example",
      fetcher,
    }),
    /live PayMongo link cannot be archived while PAYMONGO_MODE is test/i,
  );
});

test("requires the PayMongo secret only when an archive request is needed", async () => {
  await assert.rejects(
    archivePayMongoInvoiceLinks([{
      paymongo_link_id: "link_test_1",
      status: "pending",
      livemode: false,
    }], {
      mode: "test",
    }),
    /PAYMONGO_SECRET_KEY is not configured/i,
  );

  const noLinks = await archivePayMongoInvoiceLinks([], { mode: "test" });
  assert.deepEqual(noLinks, { archived: 0, skippedTest: 0 });
});

test("fails closed when PayMongo rejects the archive request", async () => {
  const fetcher: typeof fetch = async () =>
    new Response(JSON.stringify({
      errors: [{ code: "not_found", detail: "Payment Link was not found." }],
    }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });

  await assert.rejects(
    archivePayMongoPaymentLink("link_missing", "sk_live_example", fetcher),
    /PayMongo link archival failed: Payment Link was not found\./,
  );
});

test("fails closed when PayMongo returns a non-archived success response", async () => {
  const fetcher: typeof fetch = async () =>
    new Response(JSON.stringify({
      data: {
        id: "link_active",
        status: "active",
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  await assert.rejects(
    archivePayMongoPaymentLink("link_active", "sk_live_example", fetcher),
    /did not confirm that the link is archived/i,
  );
});

test("fails closed when PayMongo reports a completed payment after archival", async () => {
  const fetcher: typeof fetch = async (input, init) => {
    if (init?.method === "PATCH") return archivedResponse("link_paid_race");
    if (!String(input).includes("/payments?")) return activeResponse("link_paid_race");
    return new Response(JSON.stringify({
      data: [{
        id: "pay_1",
        type: "payment",
        attributes: {
          amount: 50000,
          currency: "PHP",
          status: "paid",
          livemode: true,
        },
      }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  await assert.rejects(
    archivePayMongoPaymentLink("link_paid_race", "sk_live_example", fetcher),
    /already has a completed payment/i,
  );
});

test("accepts an already archived link without issuing another PATCH", async () => {
  let patchCount = 0;
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input).includes("/payments?")) return emptyPaymentsResponse();
    if (init?.method === "PATCH") patchCount += 1;
    return archivedResponse("link_already_archived");
  };

  await archivePayMongoPaymentLink(
    "link_already_archived",
    "sk_live_example",
    fetcher,
  );

  assert.equal(patchCount, 0);
});

test("does not expose a secret key from a failed network request", async () => {
  const secretKey = "sk_live_do_not_expose";
  const fetcher: typeof fetch = async () => {
    throw new Error(`request failed while using ${secretKey}`);
  };

  await assert.rejects(
    archivePayMongoPaymentLink("link_network_error", secretKey, fetcher),
    (error: unknown) => {
      assert.match(String(error), /network request failed/i);
      assert.doesNotMatch(String(error), /sk_live_do_not_expose/);
      return true;
    },
  );
});
