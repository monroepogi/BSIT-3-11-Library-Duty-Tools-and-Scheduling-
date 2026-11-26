import { bootstrapApplication } from '@angular/platform-browser';
import {
  PreloadAllModules,
  RouteReuseStrategy,
  provideRouter,
  withComponentInputBinding,
  withPreloading,
} from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';
import { AUTH_SESSION_PORT, provideVitsNetwork, provideVitsSupabase } from '@vits/shared-network';
import { environment } from './environments/environment';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { AuthService } from './app/core/auth.service';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideVitsNetwork(environment),
    provideVitsSupabase(environment),
    { provide: AUTH_SESSION_PORT, useExisting: AuthService },
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
  ],
});
