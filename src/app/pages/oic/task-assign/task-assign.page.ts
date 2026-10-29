import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonSelect, IonSelectOption, IonInput, IonButton, NavController } from '@ionic/angular';
import { Task } from '../../../attributes/task';
import { SessionService } from '../../../services/session/session';
import { MockDataService } from '../../../services/mock-data/mock-data';

@Component({
  selector: 'app-task-assign',
  templateUrl: './task-assign.page.html',
  standalone: true,
  imports: [FormsModule, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonSelect, IonSelectOption, IonInput, IonButton],
})
export class TaskAssignPage implements OnInit {
  students: string[] = [];
  student = '';
  type: Task['type'] = 'Shelving';
  title = '';

  constructor(
    private session: SessionService,
    private data: MockDataService,
    private nav: NavController,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() { this.load(); }

  async load() {
    this.students = await this.data.getStudents();
    this.cdr.detectChanges();
  }

  async assign() {
    this.data.addTask({
      id: Date.now(),
      title: this.title,
      type: this.type,
      section: 'Circulation',
      assignedTo: this.student,
      status: 'Assigned'
    });
    await this.session.record('Task assigned to ' + this.student);
    this.nav.navigateBack('/oic/tasks');
  }
}
