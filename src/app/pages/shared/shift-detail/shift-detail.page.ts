import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton, NavController } from '@ionic/angular';
import { ActivatedRoute } from '@angular/router';
import { Shift } from '../../../attributes/shift';
import { SessionService } from '../../../services/session/session';
import { MockDataService } from '../../../services/mock-data/mock-data';

@Component({
  selector: 'app-shift-detail',
  templateUrl: './shift-detail.page.html',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton],
})
export class ShiftDetailPage implements OnInit {
  shift?: Shift;

  constructor(
    public session: SessionService,
    private route: ActivatedRoute,
    private data: MockDataService,
    private nav: NavController,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() { this.route.params.subscribe(p => this.load(Number(p['id']))); }
  ionViewWillEnter() { this.load(Number(this.route.snapshot.paramMap.get('id'))); }

  async load(id: number) {
    this.shift = await this.data.getShiftById(id);
    this.cdr.detectChanges();
  }

  requestChange() { this.nav.navigateForward('/request-new'); }
}
