import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  homeOutline, calendarOutline, clipboardOutline, mailOutline, personOutline, bookOutline,
  qrCodeOutline, scanOutline, add, checkmarkCircleOutline, cloudOfflineOutline, syncOutline,
  attachOutline, logOutOutline, timeOutline, schoolOutline, shieldCheckmarkOutline, chevronForward
} from 'ionicons/icons';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor() {
    addIcons({
      homeOutline, calendarOutline, clipboardOutline, mailOutline, personOutline, bookOutline,
      qrCodeOutline, scanOutline, add, checkmarkCircleOutline, cloudOfflineOutline, syncOutline,
      attachOutline, logOutOutline, timeOutline, schoolOutline, shieldCheckmarkOutline, chevronForward
    });
  }
}
