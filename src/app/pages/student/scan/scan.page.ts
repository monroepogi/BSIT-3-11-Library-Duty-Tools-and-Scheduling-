import { Component } from '@angular/core';
import { IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton, IonIcon, NavController } from '@ionic/angular';
import { SessionService } from '../../../services/session/session';

@Component({
  selector: 'app-scan',
  templateUrl: './scan.page.html',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton, IonIcon],
})
export class ScanPage {
  constructor(public session: SessionService, private nav: NavController) {}

  // mock scanner: pretend the OIC's QR was read
  async simulateScan() {
    const wasOnDuty = this.session.onDuty;
    this.session.onDuty = !wasOnDuty;
    await this.session.record(wasOnDuty ? 'Time-Out recorded' : 'Time-In recorded');
    this.nav.navigateBack('/student/home');
  }
}
