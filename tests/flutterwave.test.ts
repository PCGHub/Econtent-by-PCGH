import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createFlutterwaveProvider, verifyFlutterwaveSignature } from "../lib/billing/payment-provider";

const secretHash="econtent-test-webhook-secret";
test("Flutterwave signatures use an HMAC over the exact raw body",()=>{
  const raw='{"data":{"id":42}}',signature=createHmac("sha256",secretHash).update(raw).digest("base64");
  assert.equal(verifyFlutterwaveSignature(raw,signature,secretHash),true);
  assert.equal(verifyFlutterwaveSignature(raw+" ",signature,secretHash),false);
  assert.equal(verifyFlutterwaveSignature(raw,null,secretHash),false);
});

test("Flutterwave Test Mode creates an exact NGN checkout without trusting client identity",async()=>{
  process.env.FLUTTERWAVE_MODE="test";process.env.FLUTTERWAVE_SECRET_KEY="FLWSECK_TEST-12345678901234567890-X";process.env.FLUTTERWAVE_SECRET_HASH=secretHash;
  let body:Record<string,unknown>|undefined;
  const provider=createFlutterwaveProvider(async(_input,init)=>{body=JSON.parse(String(init?.body));return Response.json({status:"success",data:{link:"https://checkout.flutterwave.com/test"}})}) as ReturnType<typeof createFlutterwaveProvider>;
  const result=await provider.createCheckout({reference:"ect_test_11111111-1111-4111-8111-111111111111",amountKobo:50000,email:"test@example.com",name:"Test user",callbackUrl:"https://preview.example/wallet"});
  assert.equal(result.checkoutUrl,"https://checkout.flutterwave.com/test");assert.equal(body?.amount,"500.00");assert.equal(body?.currency,"NGN");assert.equal(body?.tx_ref,"ect_test_11111111-1111-4111-8111-111111111111");
});

test("a signed webhook is independently verified with Flutterwave",async()=>{
  process.env.FLUTTERWAVE_MODE="test";process.env.FLUTTERWAVE_SECRET_KEY="FLWSECK_TEST-12345678901234567890-X";process.env.FLUTTERWAVE_SECRET_HASH=secretHash;
  let calls=0;const provider=createFlutterwaveProvider(async(input)=>{calls++;assert.match(String(input),/\/transactions\/981\/verify$/);return Response.json({status:"success",data:{id:981,tx_ref:"ect_test_11111111-1111-4111-8111-111111111111",amount:500,currency:"NGN",status:"successful",created_at:"2026-11-09T00:00:00Z"}})}) as ReturnType<typeof createFlutterwaveProvider>;
  const raw=JSON.stringify({data:{id:981,tx_ref:"ect_test_11111111-1111-4111-8111-111111111111"}}),signature=createHmac("sha256",secretHash).update(raw).digest("base64");
  const verified=await provider.verifyWebhook(new Request("https://preview.example/api/billing/payments/webhook",{method:"POST",headers:{"flutterwave-signature":signature},body:raw}));
  assert.equal(calls,1);assert.equal(verified.amountKobo,50000);assert.equal(verified.providerTransactionId,"981");
});
