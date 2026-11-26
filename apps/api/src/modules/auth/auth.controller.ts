import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Body, Controller, Get, Headers, HttpCode, Inject, Injectable, Post, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthTokensResponseDto, UserProfileDto } from '@vits/shared-types';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser, JwtAuthGuard } from '../../common/auth.guards';
import { VitsHttpException } from '../../common/api-error';
import { verifyPasswordArgon2id } from '../../common/password.util';
import { InMemoryApiStore } from '../../repositories/in-memory.store';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(4)
  password!: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  deviceName?: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;

  @IsOptional()
  @IsString()
  deviceId?: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(InMemoryApiStore) private readonly store: InMemoryApiStore,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto, clientIdHeader?: string): Promise<AuthTokensResponseDto> {
    const clientId = clientIdHeader === 'admin' ? 'admin' : 'mobile';
    const userRecord = this.store.findUserByEmail(dto.email);
    if (!userRecord || !verifyPasswordArgon2id(dto.password, userRecord.passwordHash)) {
      throw new VitsHttpException(401, 'AUTH_INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    if (!userRecord.profile.active) {
      throw new VitsHttpException(403, 'AUTH_ACCOUNT_INACTIVE', 'Account has been deactivated.');
    }

    const role = userRecord.profile.role;
    if (clientId === 'mobile' && role === 'admin') {
      throw new VitsHttpException(
        403,
        'AUTH_FORBIDDEN_CLIENT',
        'Admin accounts must sign in using the VITS Admin Web Portal.',
      );
    }
    if (clientId === 'admin' && role !== 'admin') {
      throw new VitsHttpException(
        403,
        'AUTH_FORBIDDEN_CLIENT',
        'Student and OIC accounts must use the VITS mobile app.',
      );
    }

    return this.issueSessionTokens(userRecord.profile, clientId, dto.deviceId ?? 'dev-default', randomUUID());
  }

  async refresh(dto: RefreshDto): Promise<AuthTokensResponseDto> {
    const hash = sha256Hex(dto.refreshToken);
    const existing = this.store.findSessionByRefreshHash(hash);
    if (!existing) {
      throw new VitsHttpException(401, 'AUTH_REFRESH_EXPIRED', 'Refresh token is invalid or expired.');
    }

    if (existing.revoked) {
      throw new VitsHttpException(401, 'AUTH_REFRESH_REVOKED', 'Session has already been revoked.');
    }

    // Reuse detection: previously rotated refresh token presented again -> revoke entire family
    if (existing.usedAt !== null) {
      this.store.revokeSessionFamily(existing.familyId);
      throw new VitsHttpException(
        401,
        'AUTH_REFRESH_REUSED',
        'Refresh token reuse detected. All sessions in this family have been revoked.',
      );
    }

    if (Date.now() > Date.parse(existing.expiresAt)) {
      existing.revoked = true;
      throw new VitsHttpException(401, 'AUTH_REFRESH_EXPIRED', 'Refresh token has expired.');
    }

    const userRecord = this.store.findUserById(existing.userId);
    if (!userRecord || !userRecord.profile.active) {
      this.store.revokeSessionFamily(existing.familyId);
      throw new VitsHttpException(401, 'AUTH_ACCOUNT_INACTIVE', 'User account is inactive.');
    }

    existing.usedAt = new Date().toISOString();
    return this.issueSessionTokens(
      userRecord.profile,
      existing.clientId,
      dto.deviceId ?? existing.deviceId,
      existing.familyId,
    );
  }

  logout(userId: string, refreshToken?: string): { revoked: boolean } {
    if (refreshToken) {
      const match = this.store.findSessionByRefreshHash(sha256Hex(refreshToken));
      if (match && match.userId === userId) {
        this.store.revokeSessionFamily(match.familyId);
        return { revoked: true };
      }
    }
    for (const sess of this.store.sessions.values()) {
      if (sess.userId === userId) {
        sess.revoked = true;
      }
    }
    return { revoked: true };
  }

  private async issueSessionTokens(
    user: UserProfileDto,
    clientId: 'mobile' | 'admin',
    deviceId: string,
    familyId: string,
  ): Promise<AuthTokensResponseDto> {
    const sid = randomUUID();
    const rawRefreshToken = `vits-rt-${randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(
      Date.now() + this.store.config.jwtRefreshTtlDays * 86_400_000,
    ).toISOString();

    this.store.sessions.set(sid, {
      id: sid,
      familyId,
      userId: user.id,
      clientId,
      deviceId,
      refreshTokenHash: sha256Hex(rawRefreshToken),
      usedAt: null,
      revoked: false,
      expiresAt,
    });

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role, sid, clientId },
      {
        secret: this.store.config.jwtAccessSecret,
        expiresIn: this.store.config.jwtAccessTtlSec,
      },
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresInSec: this.store.config.jwtAccessTtlSec,
      user,
    };
  }
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(
    @Body() dto: LoginDto,
    @Headers('x-client-id') clientId?: string,
  ): Promise<AuthTokensResponseDto> {
    return this.authService.login(dto, clientId);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto): Promise<AuthTokensResponseDto> {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  logout(@CurrentUser() user: UserProfileDto, @Body() dto: LogoutDto): { revoked: boolean } {
    return this.authService.logout(user.id, dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  me(@CurrentUser() user: UserProfileDto): UserProfileDto {
    return user;
  }
}
