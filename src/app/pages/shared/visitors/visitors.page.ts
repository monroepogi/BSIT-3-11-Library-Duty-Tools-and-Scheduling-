import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonSegment, IonSegmentButton, IonLabel, IonButton, IonFab, IonFabButton, IonIcon, NavController } from '@ionic/angular';
import { VisitorEntry } from '../../../attributes/visitor-entry';
import { SessionService } from '../../../services/session/session';
import { MockDataService } from '../../../services/mock-data/mock-data';

@Component({
  selector: 'app-visitors',
  templateUrl: './visitors.page.html',
  standalone: true,
  imports: [FormsModule, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonSegment, IonSegmentButton, IonLabel, IonButton, IonFab, IonFabButton, IonIcon],
})
export class VisitorsPage implements OnInit {
  entries: VisitorEntry[] = [];
  filter = 'All';

  constructor(
    public session: SessionService,
    private data: MockDataService,
    private nav: NavController,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() { this.load(); }
  ionViewWillEnter() { this.load(); }

  async load() {
    this.entries = await this.data.getVisitors();
    this.cdr.detectChanges();
  }

  get filtered(): VisitorEntry[] {
    return this.filter === 'All' ? this.entries : this.entries.filter(e => e.kind === this.filter);
  }

  count(kind: string): number { return this.entries.filter(e => e.kind === kind).length; }

  async markReturned(e: VisitorEntry) {
    e.returned = true;
    await this.session.record('Paper marked as returned');
    this.cdr.detectChanges();
  }

  add() { this.nav.navigateForward('/visitor-new'); }
}
