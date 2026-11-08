import assert from "node:assert/strict";
import test from "node:test";
import { calculateQuote, CREDIT_VALUE_KOBO, TOP_UPS_KOBO } from "../lib/billing/model";

test("basic export is five credits and integer kobo", () => {
  const quote = calculateQuote(3599, [{ feature_key: "basic_export", display_name: "Basic export",
    fixed_credits: 5, credits_per_started_minute: 0, minimum_credits: 5,
    provider_key: null, provider_cost_estimate_kobo: null, estimate_only: false, version: 1 }]);
  assert.equal(quote.totalCredits, 5);
  assert.equal(quote.totalAmountKobo, 5 * CREDIT_VALUE_KOBO);
});

test("duration pricing rounds up started minutes and marks provider estimates", () => {
  const quote = calculateQuote(61, [
    { feature_key: "basic_export", display_name: "Basic export", fixed_credits: 5,
      credits_per_started_minute: 0, minimum_credits: 5, provider_key: null,
      provider_cost_estimate_kobo: null, estimate_only: false, version: 1 },
    { feature_key: "ai_subtitles", display_name: "AI subtitles", fixed_credits: 0,
      credits_per_started_minute: 8, minimum_credits: 15, provider_key: "provider-a",
      provider_cost_estimate_kobo: 2000, estimate_only: true, version: 3 },
  ]);
  assert.equal(quote.totalCredits, 21);
  assert.equal(quote.features[1].credits, 16);
  assert.equal(quote.features[1].estimateOnly, true);
});

test("top-ups have no bonus and map exactly at 1000 kobo per credit", () => {
  assert.deepEqual(TOP_UPS_KOBO.map((kobo) => kobo / CREDIT_VALUE_KOBO), [50, 100, 200, 500]);
});

test("quotes reject missing basic export and duplicate pricing", () => {
  const ai = { feature_key: "ai_voiceover", display_name: "AI voice-over", fixed_credits: 25,
    credits_per_started_minute: 0, minimum_credits: 25, provider_key: "provider",
    provider_cost_estimate_kobo: 1000, estimate_only: true, version: 1 };
  assert.throws(() => calculateQuote(30, [ai]), /basic_export/);
  const basic = { ...ai, feature_key: "basic_export", display_name: "Basic", estimate_only: false };
  assert.throws(() => calculateQuote(30, [basic, basic]), /unique/);
});

