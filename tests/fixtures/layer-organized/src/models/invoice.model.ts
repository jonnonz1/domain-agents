import { Model, DataTypes } from "sequelize";

export interface Invoice {
  id: number;
  userId: number;
  subscriptionId: number;
  amountCents: number;
  currency: string;
  status: "paid" | "open" | "void";
  stripeInvoiceId: string;
  issuedAt: Date;
}

export class InvoiceModel extends Model<Invoice> {
  static initialize(sequelize: any) {
    InvoiceModel.init(
      {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        userId: { type: DataTypes.INTEGER, allowNull: false },
        subscriptionId: { type: DataTypes.INTEGER, allowNull: false },
        amountCents: { type: DataTypes.INTEGER, allowNull: false },
        currency: { type: DataTypes.STRING, defaultValue: "usd" },
        status: { type: DataTypes.ENUM("paid", "open", "void"), allowNull: false },
        stripeInvoiceId: { type: DataTypes.STRING, allowNull: false },
        issuedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      },
      { sequelize, tableName: "invoices" }
    );
  }
}
