export const Config = {
  port: 3000,
  database: {
    host: "localhost",
    port: 5432,
    name: "saas_app",
  },
  jwt: {
    secret: "dev-secret",
    expiresIn: "1h",
  },
  email: {
    from: "noreply@saas-app.com",
  },
} as const;
