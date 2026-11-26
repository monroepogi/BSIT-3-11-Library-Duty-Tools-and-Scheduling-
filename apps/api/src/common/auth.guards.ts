import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { UserProfileDto, UserRole } from '@vits/shared-types';
import type { Request } from 'express';
import { InMemoryApiStore } from '../repositories/in-memory.store';
import { VitsHttpException } from './api-error';
import type { ApiConfig } from './config';

export const ROLES_METADATA_KEY = 'vits_roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_METADATA_KEY, roles);

export interface JwtAccessClaims {
  sub: string;
  role: UserRole;
  sid: string;
  clientId: string;
}

export interface AuthenticatedRequest extends Request {
  vitsUser?: UserProfileDto;
  vitsClaims?: JwtAccessClaims;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserProfileDto => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.vitsUser) {
      throw new VitsHttpException(401, 'AUTH_TOKEN_EXPIRED', 'Authenticated user missing from request.');
    }
    return req.vitsUser;
  },
);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly store: InMemoryApiStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new VitsHttpException(401, 'AUTH_TOKEN_EXPIRED', 'Missing bearer access token.');
    }
    const token = authHeader.slice('Bearer '.length).trim();

    let claims: JwtAccessClaims;
    try {
      const cfg: ApiConfig = this.store.config;
      claims = await this.jwt.verifyAsync<JwtAccessClaims>(token, {
        secret: cfg.jwtAccessSecret,
      });
    } catch {
      throw new VitsHttpException(401, 'AUTH_TOKEN_EXPIRED', 'Access token is invalid or expired.');
    }

    const session = this.store.findSessionById(claims.sid);
    if (!session || session.revoked) {
      throw new VitsHttpException(401, 'AUTH_REFRESH_REVOKED', 'Session has been revoked.');
    }

    const user = this.store.findUserById(claims.sub);
    if (!user || !user.profile.active) {
      throw new VitsHttpException(401, 'AUTH_ACCOUNT_INACTIVE', 'Account not found or inactive.');
    }

    req.vitsUser = user.profile;
    req.vitsClaims = claims;
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = req.vitsUser?.role;
    if (!role || !required.includes(role)) {
      throw new VitsHttpException(
        403,
        'AUTH_INSUFFICIENT_ROLE',
        `Requires one of roles: ${required.join(', ')}.`,
      );
    }
    return true;
  }
}
