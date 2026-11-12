import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from '@nestjs/ai';
import { buildAiOptions } from '@cat-supplies-store/ai';
import { appConfigOptions, aiConfig } from './app.config';
import { AssistantModule } from './apps/assistant/assistant.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot(appConfigOptions),
    AiModule.forRootAsync({
      isGlobal: true,
      inject: [aiConfig.KEY],
      useFactory: buildAiOptions,
    }),
    AssistantModule,
  ],
  providers: [{ provide: APP_PIPE, useClass: StandardSchemaValidationPipe }],
  controllers: [HealthController],
})
export class AppModule {}
