import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import {
  BusinessApiClient,
  type CustomerRequest,
} from '../integrations/business-api/business-api.client';

@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(private readonly business: BusinessApiClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CustomerRequest>();
    await this.business.authenticate(request);
    return true;
  }
}
