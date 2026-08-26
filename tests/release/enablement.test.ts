import { describe, expect, it } from "vitest";

import { assertFeatureTransition } from "../../scripts/release/feature-transition.mjs";
import { assertEnablementEligibility } from "../../scripts/release/verify-financial-enable.mjs";

const NOW = new Date("2026-08-26T01:00:00.000Z");
const feature = {
  name: "synthetic-fixed-billing",
  provider_target: "synthetic-production",
  control_id: "synthetic-fixed-billing-control",
};
const dormantReceipt = {
  stage: "dormant",
  feature_flag_state: {
    feature: feature.name,
    state: "dormant",
  },
  target_environment: {
    name: "production",
    provider_target: feature.provider_target,
  },
};
const passingInvariants = {
  captured_at: "2026-08-26T00:59:00.000Z",
  held: false,
  disputed: false,
  kill_switch_active: false,
  required_checks_current: true,
  financial_invariants_pass: true,
};

describe("financial feature transition", () => {
  it("allows only a registered dormant feature with fresh passing invariants", () => {
    expect(
      assertEnablementEligibility({
        features: [feature],
        featureName: feature.name,
        dormantReceipt,
        invariants: passingInvariants,
        now: NOW,
      }),
    ).toMatchObject({ feature });
    expect(
      assertFeatureTransition({
        features: [feature],
        featureName: feature.name,
        currentState: "dormant",
        nextState: "enabled",
      }),
    ).toMatchObject({ from: "dormant", to: "enabled" });
  });

  it("rejects unknown, non-dormant, held, failed, and stale attempts", () => {
    expect(() =>
      assertEnablementEligibility({
        features: [],
        featureName: feature.name,
        dormantReceipt,
        invariants: passingInvariants,
        now: NOW,
      }),
    ).toThrow(/not registered/);
    expect(() =>
      assertEnablementEligibility({
        features: [feature],
        featureName: feature.name,
        dormantReceipt: {
          ...dormantReceipt,
          feature_flag_state: { feature: feature.name, state: "enabled" },
        },
        invariants: passingInvariants,
        now: NOW,
      }),
    ).toThrow(/dormant/);
    for (const override of [
      { held: true },
      { disputed: true },
      { kill_switch_active: true },
      { required_checks_current: false },
      { financial_invariants_pass: false },
    ]) {
      expect(() =>
        assertEnablementEligibility({
          features: [feature],
          featureName: feature.name,
          dormantReceipt,
          invariants: { ...passingInvariants, ...override },
          now: NOW,
        }),
      ).toThrow(/invariant failed/);
    }
    expect(() =>
      assertEnablementEligibility({
        features: [feature],
        featureName: feature.name,
        dormantReceipt,
        invariants: {
          ...passingInvariants,
          captured_at: "2026-08-26T00:50:00.000Z",
        },
        now: NOW,
      }),
    ).toThrow(/stale/);
  });
});
