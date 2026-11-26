import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonContent, IonIcon, IonInput, NavController } from '@ionic/angular';
import { Role } from '../../attributes/role';
import { SessionService } from '../../services/session/session';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  standalone: true,
  imports: [FormsModule, IonContent, IonButton, IonIcon, IonInput],
})
export class LoginPage {
  readonly session = inject(SessionService);
  private readonly nav = inject(NavController);

  email = '';
  password = '';
  signingIn = false;

  signInAs(role: Role) {
    this.session.signIn(role);
    this.nav.navigateRoot(role === 'STUDENT' ? '/student/home' : '/oic/home');
  }

  async signInWithEmail() {
    if (!this.email.trim() || !this.password) return;
    this.signingIn = true;
    try {
      const result = await this.session.signInWithSupabase(this.email.trim(), this.password);
      if (!result.ok) {
        await this.session.notify(result.error ?? 'Sign-in failed.');
        return;
      }
      this.nav.navigateRoot(this.session.homeUrl());
    } finally {
      this.signingIn = false;
    }
  }
}
