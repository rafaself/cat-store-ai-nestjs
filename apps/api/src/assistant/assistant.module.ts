import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { DemoCustomerGuard } from '../auth/demo-auth.guard';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }])],
  controllers: [AssistantController],
  providers: [AssistantService, DemoCustomerGuard],
})
export class AssistantModule {}
