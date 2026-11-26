import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonIcon,
  NavController,
} from '@ionic/angular';
import { Shift } from '../../../attributes/shift';
import { SessionService } from '../../../services/session/session';
import { MockDataService } from '../../../services/mock-data/mock-data';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonIcon],
})
export class HomePage implements OnInit {
  readonly session = inject(SessionService);
  private readonly data = inject(MockDataService);
  private readonly nav = inject(NavController);
  private readonly cdr = inject(ChangeDetectorRef);

  nextShift?: Shift;
  hours = { done: 0, required: 0 };
  clockedIn: string[] = [];

  ngOnInit() {
    this.load();
  }
  ionViewWillEnter() {
    this.load();
  }

  async load() {
    const shifts = await this.data.getShifts();
    this.nextShift = shifts.find((s) => s.student === this.session.userName && s.status === 'Scheduled');
    this.hours = this.data.hours;
    this.clockedIn = await this.data.getClockedIn();
    if (this.session.role === 'STUDENT') {
      this.session.onDuty = this.data.isClockedIn(this.session.userName);
    }
    this.cdr.detectChanges();
  }

  get percent(): number {
    return this.hours.required ? Math.round((this.hours.done / this.hours.required) * 100) : 0;
  }

  go(url: string) {
    this.nav.navigateForward(url);
  }
}
