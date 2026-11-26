import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonContent, IonIcon, IonInput, NavController } from '@ionic/angular';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-unlock',
  templateUrl: './unlock.page.html',
  standalone: true,
  imports: [FormsModule, IonContent, IonButton, IonIcon, IonInput],
})
export class UnlockPage implements OnInit {
  readonly auth = inject(AuthService);
  private readonly nav = inject(NavController);

  pin = '';
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.auth.ensureInitialized();
    if (!this.auth.currentUser()) {
      await this.nav.navigateRoot('/login');
    } else if (!this.auth.locked()) {
      await this.nav.navigateRoot(this.auth.homeUrl());
    }
  }

  async unlock(): Promise<void> {
    if (!this.auth.hasPinConfigured()) {
      if (this.pin.trim().length < 4) {
        this.error.set('Choose a 4–6 digit offline PIN first.');
        return;
      }
      await this.auth.setupOfflinePin(this.pin);
      const ok = await this.auth.unlockWithPin(this.pin);
      if (ok) await this.nav.navigateRoot(this.auth.homeUrl());
      return;
    }

    const ok = await this.auth.unlockWithPin(this.pin);
    if (!ok) {
      this.error.set('Incorrect offline PIN.');
      return;
    }
    this.error.set(null);
    await this.nav.navigateRoot(this.auth.homeUrl());
  }

  async signOut(): Promise<void> {
    await this.auth.logout();
  }
}
