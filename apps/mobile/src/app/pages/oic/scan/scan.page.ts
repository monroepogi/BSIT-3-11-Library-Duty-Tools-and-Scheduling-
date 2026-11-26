import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
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
  IonSelect,
  IonSelectOption,
  IonButton,
  IonIcon,
} from '@ionic/angular';
import { SessionService } from '../../../services/session/session';
import { MockDataService } from '../../../services/mock-data/mock-data';

@Component({
  selector: 'app-scan',
  templateUrl: './scan.page.html',
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
    IonSelect,
    IonSelectOption,
    IonButton,
    IonIcon,
  ],
})
export class ScanPage implements OnInit {
  readonly session = inject(SessionService);
  private readonly data = inject(MockDataService);
  private readonly cdr = inject(ChangeDetectorRef);

  mode: 'IN' | 'OUT' = 'IN';
  students: string[] = [];
  selectedStudent = '';

  ngOnInit() {
    this.load();
  }

  ionViewWillEnter() {
    this.load();
  }

  async load() {
    this.students = await this.data.getStudents();
    if (!this.selectedStudent && this.students.length > 0) {
      this.selectedStudent = this.students[0];
    }
    this.cdr.detectChanges();
  }

  // mock scanner: pretend the selected student's rotating QR was read in the selected mode
  async simulateScan() {
    if (!this.selectedStudent) return;

    if (this.mode === 'IN') {
      const result = this.data.clockIn(this.selectedStudent);
      if (result === 'already_in') {
        await this.session.notify(`${this.selectedStudent} is already clocked in`);
        return;
      }
      await this.session.record(`${this.selectedStudent} — Time-In recorded`);
      return;
    }

    const result = this.data.clockOut(this.selectedStudent);
    if (result === 'not_in') {
      await this.session.notify(`${this.selectedStudent} is not clocked in`);
      return;
    }
    await this.session.record(`${this.selectedStudent} — Time-Out recorded`);
  }
}
