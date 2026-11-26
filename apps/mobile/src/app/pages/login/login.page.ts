import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  NavController,
} from '@ionic/angular';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  standalone: true,
  imports: [FormsModule, IonContent, IonButton, IonIcon, IonInput],
})
export class LoginPage implements OnInit {
  readonly auth = inject(AuthService);
  private readonly nav = inject(NavController);

  email = '';
  password = '';
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.auth.ensureInitialized();
    if (this.auth.locked()) {
      await this.nav.navigateRoot('/unlock');
      return;
    }
    if (this.auth.isAuthenticated()) {
      await this.nav.navigateRoot(this.auth.homeUrl());
    }
  }

  async signIn(): Promise<void> {
    if (!this.email.trim() || !this.password) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const user = await this.auth.login(this.email, this.password);
      await this.nav.navigateRoot(user.role === 'oic' ? '/oic/home' : '/student/home');
    } catch (err) {
      this.error.set(this.auth.extractErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }
}
