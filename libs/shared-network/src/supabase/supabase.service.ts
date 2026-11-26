import { type EnvironmentProviders, inject, Injectable, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { createClient, type SupabaseClient, type SupabaseClientOptions } from '@supabase/supabase-js';
import type { EnvironmentConfig, SupabaseConfig } from '@vits/shared-types';
import { ENVIRONMENT_CONFIG } from '../tokens';
import type { Database } from './database.types';

export type SupabaseClientFactory = (
  url: string,
  anonKey: string,
  options?: SupabaseClientOptions<'public'>,
) => SupabaseClient<Database>;

export const SUPABASE_CONFIG = new InjectionToken<SupabaseConfig | null>('VITS_SUPABASE_CONFIG');
export const SUPABASE_CLIENT_FACTORY = new InjectionToken<SupabaseClientFactory>(
  'VITS_SUPABASE_CLIENT_FACTORY',
);

const PLACEHOLDER_KEYS = new Set([
  '',
  'YOUR_SUPABASE_ANON_KEY',
  'replace_with_your_supabase_anon_key',
  'replace_in_local_env',
]);

export function isValidSupabaseConfig(config?: SupabaseConfig | null): config is SupabaseConfig {
  if (!config) return false;
  const url = config.url?.trim() ?? '';
  const anonKey = config.anonKey?.trim() ?? '';
  if (!/^https?:\/\/.+/i.test(url) || url.includes('YOUR_PROJECT_REF')) {
    return false;
  }
  return Boolean(anonKey) && !PLACEHOLDER_KEYS.has(anonKey);
}

export interface SupabaseHealthResult {
  configured: boolean;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

/**
 * Typed Supabase connector service for VITS Ionic/Angular apps.
 * Lazily initializes a singleton SupabaseClient when valid credentials are configured.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly env = inject(ENVIRONMENT_CONFIG, { optional: true });
  private readonly explicitConfig = inject(SUPABASE_CONFIG, { optional: true });
  private readonly clientFactory = inject(SUPABASE_CLIENT_FACTORY, { optional: true });

  private clientInstance: SupabaseClient<Database> | null = null;

  get config(): SupabaseConfig | null {
    return this.explicitConfig ?? this.env?.supabase ?? null;
  }

  get isConfigured(): boolean {
    return isValidSupabaseConfig(this.config);
  }

  getClientOrNull(): SupabaseClient<Database> | null {
    if (!this.isConfigured) {
      return null;
    }
    if (!this.clientInstance) {
      const cfg = this.config!;
      const factory: SupabaseClientFactory =
        this.clientFactory ??
        ((url, key, options) => createClient<Database>(url, key, options));

      this.clientInstance = factory(cfg.url.trim(), cfg.anonKey.trim(), {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: !Capacitor.isNativePlatform(),
          storageKey: 'vits.supabase.auth',
        },
        db: {
          schema: 'public',
        },
      });
    }
    return this.clientInstance;
  }

  getClient(): SupabaseClient<Database> {
    const client = this.getClientOrNull();
    if (!client) {
      throw new Error(
        'Supabase is not configured. Set supabase.url and supabase.anonKey in apps/mobile/src/environments/environment.ts.',
      );
    }
    return client;
  }

  get auth() {
    return this.getClient().auth;
  }

  from<TableName extends string & keyof Database['public']['Tables']>(table: TableName) {
    return this.getClient().from(table);
  }

  rpc<FnName extends string & keyof Database['public']['Functions']>(
    fn: FnName,
    args?: Database['public']['Functions'][FnName]['Args'],
  ) {
    return this.getClient().rpc(fn, args);
  }

  async checkHealth(): Promise<SupabaseHealthResult> {
    if (!this.isConfigured) {
      return {
        configured: false,
        ok: false,
        latencyMs: 0,
        error: 'Supabase URL or anon key is not configured.',
      };
    }

    const started = Date.now();
    try {
      const { error } = await this.getClient().from('library_sections').select('id').limit(1);
      const latencyMs = Date.now() - started;
      if (error) {
        return { configured: true, ok: false, latencyMs, error: error.message };
      }
      return { configured: true, ok: true, latencyMs };
    } catch (err) {
      return {
        configured: true,
        ok: false,
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message : 'Unknown Supabase connection error.',
      };
    }
  }
}

export function provideVitsSupabase(config: EnvironmentConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: ENVIRONMENT_CONFIG, useValue: config },
    { provide: SUPABASE_CONFIG, useValue: config.supabase ?? null },
  ]);
}
