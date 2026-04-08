import { Model, DataTypes } from "sequelize";

export interface EmailLog {
  id: number;
  to: string;
  subject: string;
  body: string;
  status: "queued" | "sent" | "failed";
  scheduledAt: Date | null;
  sentAt: Date | null;
}

export class EmailLogModel extends Model<EmailLog> {
  static initialize(sequelize: any) {
    EmailLogModel.init(
      {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        to: { type: DataTypes.STRING, allowNull: false },
        subject: { type: DataTypes.STRING, allowNull: false },
        body: { type: DataTypes.TEXT, allowNull: false },
        status: { type: DataTypes.ENUM("queued", "sent", "failed"), allowNull: false },
        scheduledAt: { type: DataTypes.DATE, allowNull: true },
        sentAt: { type: DataTypes.DATE, allowNull: true },
      },
      { sequelize, tableName: "email_logs" }
    );
  }
}
