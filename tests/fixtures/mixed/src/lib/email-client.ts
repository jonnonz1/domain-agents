export class EmailClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async send(to: string, subject: string, body: string): Promise<void> {
    // Send via SendGrid
  }
}
