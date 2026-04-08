import { Model, DataTypes } from "sequelize";

export interface Subscription {
  id: number;
  userId: number;
  plan: "free" | "pro" | "enterprise";
  stripeSubscriptionId: string;
  status: "active" | "canceled" | "past_due";
  currentPeriodEnd: Date;
}

export class SubscriptionModel extends Model<Subscription> {
  static initialize(sequelize: any) {
    SubscriptionModel.init(
      {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        userId: { type: DataTypes.INTEGER, allowNull: false },
        plan: { type: DataTypes.ENUM("free", "pro", "enterprise"), allowNull: false },
        stripeSubscriptionId: { type: DataTypes.STRING, allowNull: false },
        status: { type: DataTypes.ENUM("active", "canceled", "past_due"), allowNull: false },
        currentPeriodEnd: { type: DataTypes.DATE, allowNull: false },
      },
      { sequelize, tableName: "subscriptions" }
    );
  }
}
