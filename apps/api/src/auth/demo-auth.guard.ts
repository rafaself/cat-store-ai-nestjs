import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { ApiConfig, AuthConfig } from '@cat-supplies-store/config';
import type { DemoAuthenticatedRequest, DemoCustomer } from './demo-auth.types';

function matchesBearerToken(
  authorization: string | string[] | undefined,
  expectedToken: string | undefined,
): boolean {
  if (!expectedToken || Array.isArray(authorization)) return false;
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;

  const actual = Buffer.from(match[1]);
  const expected = Buffer.from(expectedToken);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

@Injectable()
export class DemoCustomerGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<DemoAuthenticatedRequest>();

    if (this.config.getOrThrow<ApiConfig>('api').environment === 'production') {
      throw new ServiceUnavailableException(
        'Demo customer authentication is disabled in production.',
      );
    }

    if (
      !matchesBearerToken(
        request.headers.authorization,
        this.config.getOrThrow<AuthConfig>('auth').demoCustomerToken,
      )
    ) {
      throw new UnauthorizedException(
        'A valid demo customer token is required.',
      );
    }

    const user: DemoCustomer = { id: 'cus_123' };
    request.user = user;
    return true;
  }
}

@Injectable()
export class SupportApprovalGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<DemoAuthenticatedRequest>();

    if (this.config.getOrThrow<ApiConfig>('api').environment === 'production') {
      throw new ServiceUnavailableException(
        'Demo support approvals are disabled in production.',
      );
    }

    if (
      !matchesBearerToken(
        request.headers.authorization,
        this.config.getOrThrow<AuthConfig>('auth').supportApprovalToken,
      )
    ) {
      throw new UnauthorizedException(
        'A valid support approval token is required.',
      );
    }

    return true;
  }
}
