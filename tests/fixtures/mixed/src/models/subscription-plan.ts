export interface Plan {
  id: string;
  name: string;
  priceMonthly: number;
  features: string[];
}

export class PlanModel {
  static async findById(id: string): Promise<Plan | null> {
    return null;
  }

  static async listAll(): Promise<Plan[]> {
    return [];
  }
}
