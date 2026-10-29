import { Component } from '@angular/core';
import { IonContent, IonButton, IonIcon, NavController } from '@ionic/angular';
import { Role } from '../../attributes/role';
import { SessionService } from '../../services/session/session';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  standalone: true,
  imports: [IonContent, IonButton, IonIcon],
})
export class LoginPage {
  constructor(private session: SessionService, private nav: NavController) {}

  signInAs(role: Role) {
    this.session.signIn(role);
    this.nav.navigateRoot(role === 'STUDENT' ? '/student/home' : '/oic/home');
  }
}
