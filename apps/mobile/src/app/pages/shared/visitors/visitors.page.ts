import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular';
import { VisitorEntry } from '../../../attributes/visitor-entry';
import { AuthService } from '../../../core/auth.service';
import { MockDataService } from '../../../services/mock-data/mock-data';

@Component({
  selector: 'app-visitors',
  templateUrl: './visitors.page.html',
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
    IonButton,
    IonFab,
    IonFabButton,
    IonIcon,
  ],
})
export class VisitorsPage implements OnInit {
  readonly auth = inject(AuthService);
  private readonly data = inject(MockDataService);
  private readonly nav = inject(NavController);
  private readonly cdr = inject(ChangeDetectorRef);

  entries: VisitorEntry[] = [];
  filter = 'All';

  ngOnInit(): void {
    void this.load();
  }

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.entries = await this.data.getVisitors();
    this.cdr.detectChanges();
  }

  get filtered(): VisitorEntry[] {
    return this.filter === 'All' ? this.entries : this.entries.filter((e) => e.kind === this.filter);
  }

  count(kind: string): number {
    return this.entries.filter((e) => e.kind === kind).length;
  }

  async markReturned(e: VisitorEntry): Promise<void> {
    e.returned = true;
    await this.auth.notify('Paper marked as returned (Phase 6 mock)');
    this.cdr.detectChanges();
  }

  add(): void {
    void this.nav.navigateForward('/visitor-new');
  }
}
