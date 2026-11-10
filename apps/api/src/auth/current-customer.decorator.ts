import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { DemoAuthenticatedRequest, DemoCustomer } from './demo-auth.types';

export const CurrentCustomer = createParamDecorator(
  (_data: unknown, context: ExecutionContext): DemoCustomer => {
    const request = context
      .switchToHttp()
      .getRequest<DemoAuthenticatedRequest>();
    if (!request.user) {
      throw new UnauthorizedException('Customer authentication is required.');
    }
    return request.user;
  },
);
