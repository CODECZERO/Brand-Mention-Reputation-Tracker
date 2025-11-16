import { config } from "./orchestrator/config.js";
import { logger } from "./orchestrator/logger.js";
import { OrchestratorApp } from "./orchestrator/app.js";

async function main(): Promise<void> {
  const orchestrator = new OrchestratorApp();

  try {
    await orchestrator.start();
    logger.info(
      {
        httpPort: config.HTTP_PORT,
        metricsPort: config.PROMETHEUS_PORT,
        workerStatusPort: config.WORKER_STATUS_PORT,
      },
      "Orchestrator started",
    );
  } catch (error) {
    logger.error({ error }, "Failed to start orchestrator");
    process.exit(1);
  }
}

void main();
