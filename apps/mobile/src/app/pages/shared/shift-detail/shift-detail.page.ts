import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonContent,
  IonButton,
  NavController,
} from '@ionic/angular';
import { ActivatedRoute } from '@angular/router';
import { Shift } from '../../../attributes/shift';
import { LibraryDatabaseService } from '../../../services/database/library-database.service';
import { SessionService } from '../../../services/session/session';

@Component({
  selector: 'app-shift-detail',
  templateUrl: './shift-detail.page.html',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton],
})
export class ShiftDetailPage implements OnInit {
  readonly session = inject(SessionService);
  private readonly route = inject(ActivatedRoute);
  private readonly db = inject(LibraryDatabaseService);
  private readonly nav = inject(NavController);
  private readonly cdr = inject(ChangeDetectorRef);

  shift?: Shift;

  ngOnInit() {
    this.route.params.subscribe((p) => this.load(Number(p['id'])));
  }
  ionViewWillEnter() {
    this.load(Number(this.route.snapshot.paramMap.get('id')));
  }

  async load(id: number) {
    this.shift = await this.db.getShiftById(id);
    this.cdr.detectChanges();
  }

  requestChange() {
    this.nav.navigateForward('/request-new');
  }
}
