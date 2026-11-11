import { Module } from '@nestjs/common';
import { BusinessApiClient } from './business-api.client';

@Module({
  providers: [BusinessApiClient],
  exports: [BusinessApiClient],
})
export class BusinessApiModule {}
