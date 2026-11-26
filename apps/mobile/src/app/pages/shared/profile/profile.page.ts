import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular';
import { MockChaosService } from '@vits/shared-network';
import { AuthService } from '../../../core/auth.service';
import { OutboxRepository } from '../../../core/db/repositories';
import { SyncService } from '../../../core/sync/sync.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  standalone: true,
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonIcon,
    IonInput,
    IonToggle,
    IonButton,
  ],
})
export class ProfilePage {
  readonly auth = inject(AuthService);
  readonly sync = inject(SyncService);
  readonly outbox = inject(OutboxRepository);
  readonly chaos = inject(MockChaosService);

  pinInput = '';

  toggleOffline(ev: Event): void {
    const offline = Boolean((ev as CustomEvent).detail.checked);
    this.chaos.forcedOffline.set(offline);
    if (!offline) {
      void this.sync.syncNow().catch(() => undefined);
    }
  }

  async savePin(): Promise<void> {
    if (this.pinInput.trim().length < 4) return;
    await this.auth.setupOfflinePin(this.pinInput);
    this.pinInput = '';
  }

  lockNow(): void {
    this.auth.lockSession();
  }

  async syncNow(): Promise<void> {
    await this.sync.syncNow().catch(() => undefined);
  }

  async signOut(): Promise<void> {
    await this.auth.logout();
  }
}
