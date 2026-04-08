export class SmsClient {
  private accountSid: string;
  private authToken: string;

  constructor(accountSid: string, authToken: string) {
    this.accountSid = accountSid;
    this.authToken = authToken;
  }

  async send(to: string, message: string): Promise<void> {
    // Send via Twilio
  }
}
