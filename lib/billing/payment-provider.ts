import "server-only";

export type VerifiedPayment = {
  gateway: string;
  reference: string;
  providerTransactionId: string;
  amountKobo: number;
  currency: "NGN";
  paidAt: string;
  payloadHash: string;
};

export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: {
    reference: string;
    amountKobo: number;
    email: string;
    callbackUrl: string;
  }): Promise<{ checkoutUrl: string; providerTransactionId?: string }>;
  verifyWebhook(request: Request): Promise<VerifiedPayment>;
  verifyReference(reference: string): Promise<VerifiedPayment>;
}

export function configuredPaymentProvider(): PaymentProvider | null {
  // Deliberately closed until a reviewed Nigerian gateway adapter and secrets exist.
  // A browser callback must never implement this interface or credit a wallet.
  return null;
}

