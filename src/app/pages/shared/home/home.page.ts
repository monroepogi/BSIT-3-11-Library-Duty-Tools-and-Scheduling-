import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonIcon, NavController } from '@ionic/angular';
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
  nextShift?: Shift;
  hours = { done: 0, required: 0 };
  clockedIn: string[] = [];

  constructor(
    public session: SessionService,
    private data: MockDataService,
    private nav: NavController,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() { this.load(); }
  ionViewWillEnter() { this.load(); }

  async load() {
    const shifts = await this.data.getShifts();
    this.nextShift = shifts.find(s => s.student === this.session.userName && s.status === 'Scheduled');
    this.hours = this.data.hours;
    this.clockedIn = await this.data.getClockedIn();
    this.cdr.detectChanges();
  }

  get percent(): number {
    return this.hours.required ? Math.round((this.hours.done / this.hours.required) * 100) : 0;
  }

  go(url: string) { this.nav.navigateForward(url); }
}
