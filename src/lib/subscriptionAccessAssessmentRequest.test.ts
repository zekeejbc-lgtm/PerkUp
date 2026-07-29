import { describe, expect, it } from "vitest";
import { createAssessmentRequestController } from "./subscriptionAccessAssessmentRequest";

describe("subscription access assessment request controller", () => {
  it("rejects an older response after a newer assessment begins", () => {
    const controller = createAssessmentRequestController();
    const graceRequest = controller.begin();
    const freezeRequest = controller.begin();

    expect(controller.isCurrent(graceRequest)).toBe(false);
    expect(controller.isCurrent(freezeRequest)).toBe(true);
  });

  it("rejects the active response after the panel is cancelled", () => {
    const controller = createAssessmentRequestController();
    const request = controller.begin();

    controller.cancel();

    expect(controller.isCurrent(request)).toBe(false);
  });
});
