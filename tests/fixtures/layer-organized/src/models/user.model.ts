import { Model, DataTypes } from "sequelize";

export interface User {
  id: number;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: Date;
}

export class UserModel extends Model<User> {
  static initialize(sequelize: any) {
    UserModel.init(
      {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        email: { type: DataTypes.STRING, unique: true, allowNull: false },
        passwordHash: { type: DataTypes.STRING, allowNull: false },
        name: { type: DataTypes.STRING, allowNull: false },
        createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      },
      { sequelize, tableName: "users" }
    );
  }
}
