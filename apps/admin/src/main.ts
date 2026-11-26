import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { AUTH_SESSION_PORT, provideVitsNetwork } from '@vits/shared-network';
import { environment } from './environments/environment';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { AdminAuthService } from './app/core/admin-auth.service';

bootstrapApplication(AppComponent, {
  providers: [
    provideIonicAngular(),
    provideRouter(routes),
    provideVitsNetwork(environment),
    { provide: AUTH_SESSION_PORT, useExisting: AdminAuthService },
  ],
});
