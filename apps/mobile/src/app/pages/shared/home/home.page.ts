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
import { LibraryDatabaseService } from '../../../services/database/library-database.service';
import { SessionService } from '../../../services/session/session';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonIcon],
})
export class HomePage implements OnInit {
  readonly session = inject(SessionService);
  private readonly db = inject(LibraryDatabaseService);
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
    const [shifts, hours, clockedIn] = await Promise.all([
      this.db.getShifts(),
      this.db.getStudentHours(this.session.userName),
      this.db.getClockedIn(),
    ]);
    this.nextShift = shifts.find((s) => s.student === this.session.userName && s.status === 'Scheduled');
    this.hours = hours;
    this.clockedIn = clockedIn;
    if (this.session.role === 'STUDENT') {
      this.session.onDuty = clockedIn.includes(this.session.userName);
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
