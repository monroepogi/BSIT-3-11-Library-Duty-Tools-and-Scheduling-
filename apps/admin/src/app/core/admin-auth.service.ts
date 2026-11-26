import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiClient, type AuthSessionPort } from '@vits/shared-network';
import {
  type AuthTokensResponseDto,
  isApiErrorEnvelope,
  type LoginRequestDto,
  type LogoutRequestDto,
  type UserProfileDto,
  VitsApiError,
} from '@vits/shared-types';

@Injectable({ providedIn: 'root' })
export class AdminAuthService implements AuthSessionPort {
  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);

  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  readonly currentUser = signal<UserProfileDto | null>(null);
  readonly sessionMessage = signal<string | null>(null);
  readonly isAuthenticated = computed(() => this.currentUser() !== null && this.accessToken !== null);
  readonly isAdmin = computed(() => this.currentUser()?.role === 'admin');

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  updateTokens(tokens: AuthTokensResponseDto): void {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.currentUser.set(tokens.user);
    this.sessionMessage.set(null);
  }

  onSessionInvalidated(reason: 'revoked' | 'expired'): void {
    this.clearMemorySession();
    this.sessionMessage.set(
      reason === 'revoked'
        ? 'Your session was revoked. Please sign in again.'
        : 'Your admin session expired. Please sign in again.',
    );
    void this.router.navigateByUrl('/login');
  }

  async login(email: string, password: string): Promise<UserProfileDto> {
    const res = await firstValueFrom(
      this.api.post<LoginRequestDto, AuthTokensResponseDto>(
        '/auth/login',
        { email: email.trim(), password, deviceName: 'Admin Web Browser' },
        { endpointGroup: 'identity', skipAuth: true },
      ),
    );
    this.updateTokens(res);
    return res.user;
  }

  async logout(): Promise<void> {
    try {
      if (this.accessToken) {
        await firstValueFrom(
          this.api.post<LogoutRequestDto, { revoked: boolean }>(
            '/auth/logout',
            { refreshToken: this.refreshToken ?? undefined },
            { endpointGroup: 'identity' },
          ),
        );
      }
    } catch {
      // Clear local session regardless of logout transport result
    } finally {
      this.clearMemorySession();
      await this.router.navigateByUrl('/login');
    }
  }

  extractErrorMessage(err: unknown): string {
    if (err instanceof VitsApiError) {
      return `${err.code}: ${err.message}`;
    }
    if (isApiErrorEnvelope(err)) {
      return `${err.error.code}: ${err.error.message}`;
    }
    if (err instanceof Error) return err.message;
    return 'Unable to reach the VITS server. Check your connection and try again.';
  }

  private clearMemorySession(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.currentUser.set(null);
  }
}
