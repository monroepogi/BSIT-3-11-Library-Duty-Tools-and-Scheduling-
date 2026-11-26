import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
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
  NavController,
} from '@ionic/angular';
import { Shift } from '../../../attributes/shift';
import { LibraryDatabaseService } from '../../../services/database/library-database.service';
import { SessionService } from '../../../services/session/session';

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
export class RequestNewPage implements OnInit {
  private readonly session = inject(SessionService);
  private readonly db = inject(LibraryDatabaseService);
  private readonly nav = inject(NavController);
  private readonly cdr = inject(ChangeDetectorRef);

  kind: 'Swap' | 'Leave' = 'Swap';
  shifts: Shift[] = [];
  selectedShift?: number;
  reason = '';
  fileName = '';

  ngOnInit() {
    this.load();
  }
  ionViewWillEnter() {
    this.load();
  }

  async load() {
    const all = await this.db.getShifts();
    this.shifts = all.filter((s) => s.student === this.session.userName && s.status === 'Scheduled');
    this.cdr.detectChanges();
  }

  onFile(ev: Event) {
    const f = (ev.target as HTMLInputElement).files?.[0];
    this.fileName = f ? f.name : '';
    this.cdr.detectChanges();
  }

  async submit() {
    const s = this.shifts.find((x) => x.id === this.selectedShift);
    await this.db.addRequest(
      {
        kind: this.kind,
        shiftLabel: s ? `${s.day} ${s.date}, ${s.startTime}-${s.endTime}` : 'Unspecified shift',
        reason: this.reason,
        requester: this.session.userName,
        submittedOn: 'Today',
        status: 'Pending OIC',
      },
      { shiftId: s?.id, attachmentName: this.fileName || undefined },
    );
    await this.session.record(this.kind + ' request submitted');
    this.nav.navigateBack('/student/requests');
  }
}
