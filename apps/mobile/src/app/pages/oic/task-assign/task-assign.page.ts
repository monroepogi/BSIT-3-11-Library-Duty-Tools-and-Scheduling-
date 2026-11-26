import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonContent,
  IonSelect,
  IonSelectOption,
  IonInput,
  IonButton,
  NavController,
} from '@ionic/angular';
import { Task } from '../../../attributes/task';
import { LibraryDatabaseService } from '../../../services/database/library-database.service';
import { SessionService } from '../../../services/session/session';

@Component({
  selector: 'app-task-assign',
  templateUrl: './task-assign.page.html',
  standalone: true,
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonSelect,
    IonSelectOption,
    IonInput,
    IonButton,
  ],
})
export class TaskAssignPage implements OnInit {
  private readonly session = inject(SessionService);
  private readonly db = inject(LibraryDatabaseService);
  private readonly nav = inject(NavController);
  private readonly cdr = inject(ChangeDetectorRef);

  students: string[] = [];
  student = '';
  type: Task['type'] = 'Shelving';
  title = '';

  ngOnInit() {
    this.load();
  }

  async load() {
    this.students = await this.db.getStudents();
    this.cdr.detectChanges();
  }

  async assign() {
    await this.db.addTask(
      {
        title: this.title,
        type: this.type,
        section: 'Circulation',
        assignedTo: this.student,
        status: 'Assigned',
      },
      this.session.userName,
    );
    await this.session.record('Task assigned to ' + this.student);
    this.nav.navigateBack('/oic/tasks');
  }
}
