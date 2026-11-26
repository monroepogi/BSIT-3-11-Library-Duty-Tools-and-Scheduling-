import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { EndpointGroup } from '@vits/shared-types';
import { Observable } from 'rxjs';
import { ENDPOINT_GROUP_TOKEN, ENVIRONMENT_CONFIG, SKIP_AUTH_TOKEN } from './tokens';

export interface ApiRequestOptions {
  endpointGroup: EndpointGroup;
  params?: Record<string, string | number | boolean | null | undefined>;
  skipAuth?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly env = inject(ENVIRONMENT_CONFIG);

  get<TRes>(path: string, options: ApiRequestOptions): Observable<TRes> {
    return this.http.get<TRes>(this.buildUrl(path), {
      params: this.buildParams(options.params),
      context: this.buildContext(options),
    });
  }

  post<TReq, TRes>(path: string, body: TReq, options: ApiRequestOptions): Observable<TRes> {
    return this.http.post<TRes>(this.buildUrl(path), body, {
      params: this.buildParams(options.params),
      context: this.buildContext(options),
    });
  }

  patch<TReq, TRes>(path: string, body: TReq, options: ApiRequestOptions): Observable<TRes> {
    return this.http.patch<TRes>(this.buildUrl(path), body, {
      params: this.buildParams(options.params),
      context: this.buildContext(options),
    });
  }

  put<TReq, TRes>(path: string, body: TReq, options: ApiRequestOptions): Observable<TRes> {
    return this.http.put<TRes>(this.buildUrl(path), body, {
      params: this.buildParams(options.params),
      context: this.buildContext(options),
    });
  }

  delete<TRes>(
    path: string,
    options: ApiRequestOptions & { body?: unknown },
  ): Observable<TRes> {
    return this.http.delete<TRes>(this.buildUrl(path), {
      body: options.body,
      params: this.buildParams(options.params),
      context: this.buildContext(options),
    });
  }

  private buildUrl(path: string): string {
    const cleanBase = this.env.apiBaseUrl.replace(/\/+$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${cleanBase}/v1${cleanPath}`;
  }

  private buildParams(
    params?: Record<string, string | number | boolean | null | undefined>,
  ): HttpParams {
    let httpParams = new HttpParams();
    if (!params) return httpParams;
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        httpParams = httpParams.set(key, String(value));
      }
    }
    return httpParams;
  }

  private buildContext(options: ApiRequestOptions): HttpContext {
    return new HttpContext()
      .set(ENDPOINT_GROUP_TOKEN, options.endpointGroup)
      .set(SKIP_AUTH_TOKEN, Boolean(options.skipAuth));
  }
}
