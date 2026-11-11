import { ConfigService } from '@nestjs/config';
import type { LoggerConfig } from '@cat-supplies-store/config';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(
    new ConsoleLogger(
      app.get(ConfigService).getOrThrow<LoggerConfig>('logger'),
    ),
  );
  app.enableShutdownHooks();
}

void bootstrap();
