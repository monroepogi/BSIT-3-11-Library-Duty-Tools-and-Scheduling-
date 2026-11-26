import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular';
import { AuthService } from '../../../core/auth.service';
import { ShiftsRepository } from '../../../core/db/repositories';
import { MockDataService } from '../../../services/mock-data/mock-data';

@Component({
  selector: 'app-request-new',
  templateUrl: './request-new.page.html',
  standalone: true,
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonSelect,
    IonSelectOption,
    IonTextarea,
    IonButton,
    IonIcon,
  ],
})
export class RequestNewPage {
  private readonly auth = inject(AuthService);
  private readonly shiftsRepo = inject(ShiftsRepository);
  private readonly data = inject(MockDataService);
  private readonly nav = inject(NavController);

  readonly shifts = computed(() => {
    const uid = this.auth.currentUser()?.id;
    return this.shiftsRepo.shifts().filter((s) => s.userId === uid && s.status !== 'completed');
  });

  kind: 'Swap' | 'Leave' = 'Swap';
  selectedShift = '';
  reason = '';
  fileName = '';

  onFile(ev: Event): void {
    const f = (ev.target as HTMLInputElement).files?.[0];
    this.fileName = f ? f.name : '';
  }

  async submit(): Promise<void> {
    const s = this.shifts().find((x) => x.id === this.selectedShift);
    this.data.addRequest({
      id: Date.now(),
      kind: this.kind,
      shiftLabel: s ? `${s.shiftDate} • ${s.sectionName}` : 'Unspecified shift',
      reason: this.reason,
      requester: this.auth.userName(),
      submittedOn: 'Today',
      status: 'Pending OIC',
    });
    await this.auth.notify(`${this.kind} request submitted (Phase 6 mock)`);
    await this.nav.navigateBack('/student/requests');
  }
}
