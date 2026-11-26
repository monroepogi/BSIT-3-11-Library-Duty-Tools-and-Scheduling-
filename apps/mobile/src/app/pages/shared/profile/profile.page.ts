import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToggle,
  IonToolbar,
  NavController,
} from '@ionic/angular';
import { LibraryDatabaseService } from '../../../services/database/library-database.service';
import { SessionService } from '../../../services/session/session';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonIcon,
    IonToggle,
    IonButton,
  ],
})
export class ProfilePage implements OnInit {
  readonly session = inject(SessionService);
  private readonly db = inject(LibraryDatabaseService);
  private readonly nav = inject(NavController);
  private readonly cdr = inject(ChangeDetectorRef);

  dbStatusLabel = 'Local fallback (Supabase not configured)';
  dbChipClass = 'warn';

  ngOnInit() {
    void this.checkDatabase();
  }

  async checkDatabase() {
    if (!this.db.isConfigured) {
      this.dbStatusLabel = 'Local fallback (configure environment.ts)';
      this.dbChipClass = 'warn';
      this.cdr.detectChanges();
      return;
    }

    const health = await this.db.checkConnection();
    if (health.ok) {
      this.dbStatusLabel = `Connected (${health.latencyMs}ms)`;
      this.dbChipClass = 'ok';
    } else {
      this.dbStatusLabel = `Unreachable (${health.error ?? 'error'})`;
      this.dbChipClass = 'bad';
    }
    this.cdr.detectChanges();
  }

  toggleOffline(ev: Event) {
    this.session.setOffline((ev as CustomEvent).detail.checked);
  }

  signOut() {
    this.session.signOut();
    this.nav.navigateRoot('/login');
  }

  expireSession() {
    this.session.signOut();
    this.nav.navigateRoot('/login');
    this.session.notify('Session expired. Please sign in again.');
  }
}
