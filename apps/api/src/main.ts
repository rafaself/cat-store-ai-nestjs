import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { ApiConfig } from '@llm-chatbot-nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const port = app.get(ConfigService).getOrThrow<ApiConfig>('api').port;
  await app.listen(port);
}

void bootstrap();
