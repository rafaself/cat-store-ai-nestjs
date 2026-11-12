import { ConversationService } from './conversation.service';
import { ConversationRepository } from './conversation.repository';
import { BusinessApiModule } from '../../integrations/business-api/business-api.module';
import { OrdersTools } from './tools/orders.tools';
import { CatalogTools } from './tools/catalog.tools';
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { CustomerAuthGuard } from '../../auth/customer-auth.guard';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { ChatStreamService } from './chat-stream.service';

@Module({
  imports: [
    BusinessApiModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
  ],
  controllers: [AssistantController],
  providers: [
    ConversationService,
    ConversationRepository,
    ChatStreamService,
    AssistantService,
    CustomerAuthGuard,
    OrdersTools,
    CatalogTools,
  ],
})
export class AssistantModule {}
