import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonFab, IonFabButton, IonIcon, NavController } from '@ionic/angular';
import { DutyRequest } from '../../../attributes/duty-request';
import { SessionService } from '../../../services/session/session';
import { MockDataService } from '../../../services/mock-data/mock-data';

@Component({
  selector: 'app-requests',
  templateUrl: './requests.page.html',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonFab, IonFabButton, IonIcon],
})
export class RequestsPage implements OnInit {
  requests: DutyRequest[] = [];
  steps = ['Submitted', 'OIC', 'Admin'];

  constructor(
    public session: SessionService,
    private data: MockDataService,
    private nav: NavController,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() { this.load(); }
  ionViewWillEnter() { this.load(); }

  async load() {
    const all = await this.data.getRequests();
    this.requests = this.session.role === 'OIC' ? all : all.filter(r => r.requester === this.session.userName);
    this.cdr.detectChanges();
  }

  chip(status: string): string {
    return status === 'Approved' ? 'ok' : status === 'Rejected' ? 'bad' : status === 'Endorsed' ? 'info' : 'warn';
  }

  private stepCount(r: DutyRequest): number {
    return r.status === 'Pending OIC' ? 1 : r.status === 'Endorsed' ? 2 : 3;
  }

  stepClass(i: number, r: DutyRequest): string {
    const count = this.stepCount(r);
    const done = i < count ? 'done' : '';
    const bad = r.status === 'Rejected' && i === count - 1 ? ' bad' : '';
    return done + bad;
  }

  async endorse(r: DutyRequest) {
    r.status = 'Endorsed';
    await this.session.record('Request endorsed');
    this.cdr.detectChanges();
  }

  async decline(r: DutyRequest) {
    r.status = 'Rejected';
    await this.session.record('Request declined');
    this.cdr.detectChanges();
  }

  newRequest() { this.nav.navigateForward('/request-new'); }
}
