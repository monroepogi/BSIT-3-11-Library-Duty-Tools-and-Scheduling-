import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular';
import { AuthService } from '../../../core/auth.service';
import { MockDataService } from '../../../services/mock-data/mock-data';

@Component({
  selector: 'app-visitor-new',
  templateUrl: './visitor-new.page.html',
  standalone: true,
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonInput,
    IonButton,
  ],
})
export class VisitorNewPage {
  private readonly auth = inject(AuthService);
  private readonly data = inject(MockDataService);
  private readonly nav = inject(NavController);

  kind: 'Visitor' | 'Baggage' | 'Paper' = 'Visitor';
  name = '';
  detail = '';

  get detailLabel(): string {
    return this.kind === 'Paper'
      ? 'Paper title and borrower ID'
      : this.kind === 'Baggage'
        ? 'Locker / description'
        : 'Purpose of visit';
  }

  async save(): Promise<void> {
    const now = new Date();
    this.data.addVisitor({
      id: Date.now(),
      name: this.name,
      kind: this.kind,
      detail: this.detail,
      time:
        now.getHours().toString().padStart(2, '0') +
        ':' +
        now.getMinutes().toString().padStart(2, '0'),
      returned: this.kind === 'Paper' ? false : undefined,
    });
    await this.auth.notify('Entry saved (Phase 6 mock)');
    this.nav.back();
  }
}
