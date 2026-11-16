import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";
import type { AppConfig } from "./config/configuration";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  configureApp(app);
  app.enableShutdownHooks();

  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);
  const port = config.get("port", { infer: true });
  await app.listen(port, "0.0.0.0");
  new Logger("Bootstrap").log(`HTX backend listening on port ${port} (${config.get("nodeEnv", { infer: true })})`);
}

bootstrap().catch((error) => {
  const detail = error instanceof Error ? error.stack || error.message : String(error);
  process.exitCode = 1;
  process.stderr.write(`[Bootstrap] Không khởi động được server: ${detail}\n`, () => {
    process.exit(1);
  });
});
