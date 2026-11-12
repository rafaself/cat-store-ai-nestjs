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

  async canActivate(context: ExecutionContext): Promise<true> {
    const request = context.switchToHttp().getRequest<CustomerRequest>();

    const customer = await this.business.authenticate(request);
    request.customerId = customer.id;

    return true;
  }
}
