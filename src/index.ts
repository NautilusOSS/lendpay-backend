import { app } from "./server";
import { config } from "./config";

const server = app.listen(config.port, () => {
  console.log(`paid-workflow-gateway listening on port ${config.port}`);
});

const shutdown = (): void => {
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
