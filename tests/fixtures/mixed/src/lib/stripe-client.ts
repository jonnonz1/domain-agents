export class StripeClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async createCharge(amount: number, currency: string, token: string): Promise<string> {
    // Call Stripe API
    return "ch_mock";
  }

  async createSubscription(customerId: string, priceId: string): Promise<string> {
    return "sub_mock";
  }
}
