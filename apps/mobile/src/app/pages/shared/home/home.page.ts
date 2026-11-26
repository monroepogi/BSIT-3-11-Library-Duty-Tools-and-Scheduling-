import { Component, OnInit, computed, inject } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular';
import { AuthService } from '../../../core/auth.service';
import { ShiftsRepository } from '../../../core/db/repositories';
import { SyncService } from '../../../core/sync/sync.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonIcon],
})
export class HomePage implements OnInit {
  readonly auth = inject(AuthService);
  readonly sync = inject(SyncService);
  private readonly shiftsRepo = inject(ShiftsRepository);
  private readonly nav = inject(NavController);

  readonly nextShift = computed(() => {
    const uid = this.auth.currentUser()?.id;
    return this.shiftsRepo
      .shifts()
      .find((s) => s.userId === uid && (s.status === 'scheduled' || s.status === 'in_progress'));
  });

  readonly clockedIn = computed(() =>
    this.shiftsRepo
      .shifts()
      .filter((s) => s.status === 'in_progress')
      .map((s) => ({ name: s.userFullName, pendingSync: s.pendingSync })),
  );

  readonly hoursDone = computed(() =>
    Math.round((this.shiftsRepo.hoursSummary()?.renderedMinutes ?? 0) / 60),
  );
  readonly hoursRequired = computed(() =>
    Math.round((this.shiftsRepo.hoursSummary()?.semesterCapMinutes ?? 3600) / 60),
  );
  readonly percent = computed(() => {
    const req = this.hoursRequired();
    return req ? Math.round((this.hoursDone() / req) * 100) : 0;
  });

  ngOnInit(): void {
    void this.auth.ensureInitialized();
  }

  ionViewWillEnter(): void {
    void this.sync.syncNow().catch(() => undefined);
  }

  go(url: string): void {
    void this.nav.navigateForward(url);
  }
}
