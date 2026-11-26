import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
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
  NavController,
} from '@ionic/angular';
import { LibraryDatabaseService } from '../../../services/database/library-database.service';
import { SessionService } from '../../../services/session/session';

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
  private readonly session = inject(SessionService);
  private readonly db = inject(LibraryDatabaseService);
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

  async save() {
    const now = new Date();
    await this.db.addVisitor(
      {
        name: this.name,
        kind: this.kind,
        detail: this.detail,
        time:
          now.getHours().toString().padStart(2, '0') +
          ':' +
          now.getMinutes().toString().padStart(2, '0'),
        returned: this.kind === 'Paper' ? false : undefined,
      },
      this.session.userName,
    );
    await this.session.record('Entry saved');
    this.nav.back();
  }
}
