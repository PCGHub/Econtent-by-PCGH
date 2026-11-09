import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type VerifiedPayment = { gateway:"flutterwave";reference:string;providerTransactionId:string;amountKobo:number;currency:"NGN";paidAt:string;payloadHash:string };
export interface PaymentProvider {
  readonly name:"flutterwave";
  createCheckout(input:{reference:string;amountKobo:number;email:string;name:string;callbackUrl:string}):Promise<{checkoutUrl:string}>;
  verifyWebhook(request:Request):Promise<VerifiedPayment>;
  verifyReference(reference:string):Promise<VerifiedPayment>;
}
type Transaction={id?:number|string;tx_ref?:string;amount?:number;currency?:string;status?:string;created_at?:string};
type ResponseBody={status?:string;message?:string;data?:Transaction|{link?:string}};
export class FlutterwaveError extends Error {}
const required=(name:string)=>{const value=process.env[name]?.trim();if(!value)throw new FlutterwaveError(`${name} is not configured`);return value};
const safeEqual=(a:string,b:string)=>{const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right)};
export function verifyFlutterwaveSignature(raw:string,signature:string|null,secret:string){
  return !!signature&&safeEqual(signature.trim(),createHmac("sha256",secret).update(raw).digest("base64"));
}
const validTestSecret=(key:string)=>key.startsWith("FLWSECK_TEST-")&&key.length>24;
export function flutterwaveConfigured(){const key=process.env.FLUTTERWAVE_SECRET_KEY?.trim(),hash=process.env.FLUTTERWAVE_SECRET_HASH?.trim();return process.env.FLUTTERWAVE_MODE==="test"&&!!key&&validTestSecret(key)&&!!hash&&hash.length>=16}

export function createFlutterwaveProvider(fetcher:typeof fetch=fetch):PaymentProvider{
  const key=required("FLUTTERWAVE_SECRET_KEY");
  if(process.env.FLUTTERWAVE_MODE!=="test"||!validTestSecret(key))throw new FlutterwaveError("Only a Flutterwave Test Mode secret key is accepted");
  const secret=required("FLUTTERWAVE_SECRET_HASH");if(secret.length<16)throw new FlutterwaveError("Flutterwave webhook secret hash is too short");
  const call=async(path:string,init?:RequestInit)=>{const response=await fetcher(`https://api.flutterwave.com/v3${path}`,{...init,headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json",...init?.headers},signal:AbortSignal.timeout(15000)});const body=await response.json().catch(()=>({})) as ResponseBody;if(!response.ok||body.status==="error")throw new FlutterwaveError(body.message||`Flutterwave request failed (${response.status})`);return body};
  const normalize=(data:Transaction|undefined):VerifiedPayment=>{const amount=Number(data?.amount);if(!data?.id||!data.tx_ref||data.status?.toLowerCase()!=="successful"||data.currency?.toUpperCase()!=="NGN"||!Number.isFinite(amount))throw new FlutterwaveError("Flutterwave transaction is not a successful NGN payment");const amountKobo=Math.round(amount*100);if(amountKobo<=0||Math.abs(amount*100-amountKobo)>.001)throw new FlutterwaveError("Flutterwave returned an invalid amount");return{gateway:"flutterwave",reference:data.tx_ref,providerTransactionId:String(data.id),amountKobo,currency:"NGN",paidAt:data.created_at||new Date().toISOString(),payloadHash:createHash("sha256").update(JSON.stringify(data)).digest("hex")}};
  const verifyId=async(id:string)=>normalize((await call(`/transactions/${encodeURIComponent(id)}/verify`)).data as Transaction);
  return{name:"flutterwave",async createCheckout(input){const body=await call("/payments",{method:"POST",body:JSON.stringify({tx_ref:input.reference,amount:(input.amountKobo/100).toFixed(2),currency:"NGN",redirect_url:input.callbackUrl,customer:{email:input.email,name:input.name},customizations:{title:"Econtent by PCGH Credits",description:`${input.amountKobo/1000} Econtent credits`}})});const link=(body.data as {link?:string}|undefined)?.link;if(!link?.startsWith("https://"))throw new FlutterwaveError("Flutterwave did not return a secure checkout URL");return{checkoutUrl:link}},async verifyWebhook(request){const raw=await request.text();if(raw.length>262144)throw new FlutterwaveError("Flutterwave webhook body is too large");if(!verifyFlutterwaveSignature(raw,request.headers.get("flutterwave-signature"),secret))throw new FlutterwaveError("Invalid Flutterwave webhook signature");const event=JSON.parse(raw) as {data?:Transaction};if(!event.data?.id)throw new FlutterwaveError("Flutterwave webhook has no transaction ID");const verified=await verifyId(String(event.data.id));if(event.data.tx_ref&&verified.reference!==event.data.tx_ref)throw new FlutterwaveError("Flutterwave reference mismatch");return verified},async verifyReference(reference){const body=await call(`/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`);const verified=normalize(body.data as Transaction);if(verified.reference!==reference)throw new FlutterwaveError("Flutterwave reference mismatch");return verified}};
}
export function configuredPaymentProvider():PaymentProvider|null{return flutterwaveConfigured()?createFlutterwaveProvider():null}
