import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { ApiConfig } from '@cat-supplies-store/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const port = app.get(ConfigService).getOrThrow<ApiConfig>('api').port;

  app.enableShutdownHooks();

  await app.listen(port);
}

void bootstrap();
