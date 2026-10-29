import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonSegment, IonSegmentButton, IonLabel, IonSelect, IonSelectOption, IonTextarea, IonButton, IonIcon, NavController } from '@ionic/angular';
import { Shift } from '../../../attributes/shift';
import { SessionService } from '../../../services/session/session';
import { MockDataService } from '../../../services/mock-data/mock-data';

@Component({
  selector: 'app-request-new',
  templateUrl: './request-new.page.html',
  standalone: true,
  imports: [FormsModule, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonSegment, IonSegmentButton, IonLabel, IonSelect, IonSelectOption, IonTextarea, IonButton, IonIcon],
})
export class RequestNewPage implements OnInit {
  kind: 'Swap' | 'Leave' = 'Swap';
  shifts: Shift[] = [];
  selectedShift?: number;
  reason = '';
  fileName = '';

  constructor(
    private session: SessionService,
    private data: MockDataService,
    private nav: NavController,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() { this.load(); }
  ionViewWillEnter() { this.load(); }

  async load() {
    const all = await this.data.getShifts();
    this.shifts = all.filter(s => s.student === this.session.userName && s.status === 'Scheduled');
    this.cdr.detectChanges();
  }

  onFile(ev: Event) {
    const f = (ev.target as HTMLInputElement).files?.[0];
    this.fileName = f ? f.name : '';
    this.cdr.detectChanges();
  }

  async submit() {
    const s = this.shifts.find(x => x.id === this.selectedShift);
    this.data.addRequest({
      id: Date.now(),
      kind: this.kind,
      shiftLabel: s ? `${s.day} ${s.date}, ${s.startTime}-${s.endTime}` : 'Unspecified shift',
      reason: this.reason,
      requester: this.session.userName,
      submittedOn: 'Today',
      status: 'Pending OIC'
    });
    await this.session.record(this.kind + ' request submitted');
    this.nav.navigateBack('/student/requests');
  }
}
