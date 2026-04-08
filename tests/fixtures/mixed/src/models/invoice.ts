export interface Invoice {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: "draft" | "sent" | "paid" | "void";
  createdAt: Date;
}

export class InvoiceModel {
  static async findByUserId(userId: string): Promise<Invoice[]> {
    return [];
  }

  static async create(data: Omit<Invoice, "id" | "createdAt">): Promise<Invoice> {
    return { ...data, id: "inv_generated", createdAt: new Date() };
  }
}
