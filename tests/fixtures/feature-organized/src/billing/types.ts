export interface Subscription {
  id: string;
  userId: string;
  plan: Plan;
  status: "active" | "canceled" | "past_due";
  startedAt: Date;
  canceledAt?: Date;
}

export interface Invoice {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: "draft" | "paid" | "void";
  issuedAt: Date;
}

export interface Plan {
  id: string;
  name: string;
  priceMonthly: number;
  features: string[];
}
