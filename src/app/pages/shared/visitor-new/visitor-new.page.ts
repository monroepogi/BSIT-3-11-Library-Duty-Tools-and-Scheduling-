import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonSegment, IonSegmentButton, IonLabel, IonInput, IonButton, NavController } from '@ionic/angular';
import { SessionService } from '../../../services/session/session';
import { MockDataService } from '../../../services/mock-data/mock-data';

@Component({
  selector: 'app-visitor-new',
  templateUrl: './visitor-new.page.html',
  standalone: true,
  imports: [FormsModule, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonSegment, IonSegmentButton, IonLabel, IonInput, IonButton],
})
export class VisitorNewPage {
  kind: 'Visitor' | 'Baggage' | 'Paper' = 'Visitor';
  name = '';
  detail = '';

  constructor(private session: SessionService, private data: MockDataService, private nav: NavController) {}

  get detailLabel(): string {
    return this.kind === 'Paper' ? 'Paper title and borrower ID'
         : this.kind === 'Baggage' ? 'Locker / description'
         : 'Purpose of visit';
  }

  async save() {
    const now = new Date();
    this.data.addVisitor({
      id: Date.now(),
      name: this.name,
      kind: this.kind,
      detail: this.detail,
      time: now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0'),
      returned: this.kind === 'Paper' ? false : undefined
    });
    await this.session.record('Entry saved');
    this.nav.back();
  }
}
