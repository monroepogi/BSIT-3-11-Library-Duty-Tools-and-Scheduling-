import { Component } from '@angular/core';
import { IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonIcon, IonToggle, IonButton, NavController } from '@ionic/angular';
import { SessionService } from '../../../services/session/session';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonIcon, IonToggle, IonButton],
})
export class ProfilePage {
  constructor(public session: SessionService, private nav: NavController) {}

  toggleOffline(ev: Event) {
    this.session.setOffline((ev as CustomEvent).detail.checked);
  }

  signOut() {
    this.session.signOut();
    this.nav.navigateRoot('/login');
  }

  expireSession() {
    this.session.signOut();
    this.nav.navigateRoot('/login');
    this.session.notify('Session expired. Please sign in again.');
  }
}
