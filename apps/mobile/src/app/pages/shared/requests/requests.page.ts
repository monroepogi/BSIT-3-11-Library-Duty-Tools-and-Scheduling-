import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import {
  IonButton,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular';
import { DutyRequest } from '../../../attributes/duty-request';
import { AuthService } from '../../../core/auth.service';
import { MockDataService } from '../../../services/mock-data/mock-data';

@Component({
  selector: 'app-requests',
  templateUrl: './requests.page.html',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonFab, IonFabButton, IonIcon],
})
export class RequestsPage implements OnInit {
  readonly auth = inject(AuthService);
  private readonly data = inject(MockDataService);
  private readonly nav = inject(NavController);
  private readonly cdr = inject(ChangeDetectorRef);

  requests: DutyRequest[] = [];
  steps = ['Submitted', 'OIC', 'Admin'];

  ngOnInit(): void {
    void this.load();
  }

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(): Promise<void> {
    const all = await this.data.getRequests();
    this.requests =
      this.auth.role() === 'OIC' ? all : all.filter((r) => r.requester === this.auth.userName());
    this.cdr.detectChanges();
  }

  chip(status: string): string {
    return status === 'Approved'
      ? 'ok'
      : status === 'Rejected'
        ? 'bad'
        : status === 'Endorsed'
          ? 'info'
          : 'warn';
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

  async endorse(r: DutyRequest): Promise<void> {
    r.status = 'Endorsed';
    await this.auth.notify('Request endorsed');
    this.cdr.detectChanges();
  }

  async decline(r: DutyRequest): Promise<void> {
    r.status = 'Rejected';
    await this.auth.notify('Request declined');
    this.cdr.detectChanges();
  }

  newRequest(): void {
    void this.nav.navigateForward('/request-new');
  }
}
