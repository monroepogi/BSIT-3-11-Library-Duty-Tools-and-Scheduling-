import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular';
import { AuthService } from '../../../core/auth.service';
import { OutboxRepository, ShiftsRepository } from '../../../core/db/repositories';
import { SyncService } from '../../../core/sync/sync.service';

@Component({
  selector: 'app-shift-detail',
  templateUrl: './shift-detail.page.html',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton],
})
export class ShiftDetailPage {
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly shiftsRepo = inject(ShiftsRepository);
  private readonly outbox = inject(OutboxRepository);
  private readonly sync = inject(SyncService);
  private readonly nav = inject(NavController);

  private readonly shiftId = signal('');
  readonly shift = computed(() => this.shiftsRepo.getById(this.shiftId()));

  constructor() {
    this.route.paramMap.subscribe((p) => this.shiftId.set(p.get('id') ?? ''));
  }

  requestChange(): void {
    void this.nav.navigateForward('/request-new');
  }

  async signoffShift(): Promise<void> {
    const s = this.shift();
    const user = this.auth.currentUser();
    if (!s || !user) return;
    await this.shiftsRepo.applyLocalSignoff(s.id, user.fullName, 'Signed off by OIC.');
    await this.outbox.enqueue({
      entityType: 'shift',
      entityId: s.id,
      type: 'shift.signoff',
      label: `Sign off shift (${s.userFullName})`,
      payload: { remarks: 'Signed off by OIC.' },
    });
    await this.auth.notify(this.auth.isOffline() ? 'Sign-off queued offline' : 'Shift signed off');
    this.sync.scheduleDebouncedSync(100);
  }
}
