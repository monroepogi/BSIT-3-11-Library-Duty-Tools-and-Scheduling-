import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonFab,
  IonFabButton,
  IonIcon,
  NavController,
} from '@ionic/angular';
import { Task } from '../../../attributes/task';
import { LibraryDatabaseService } from '../../../services/database/library-database.service';
import { SessionService } from '../../../services/session/session';

@Component({
  selector: 'app-tasks',
  templateUrl: './tasks.page.html',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButton,
    IonFab,
    IonFabButton,
    IonIcon,
  ],
})
export class TasksPage implements OnInit {
  readonly session = inject(SessionService);
  private readonly db = inject(LibraryDatabaseService);
  private readonly nav = inject(NavController);
  private readonly cdr = inject(ChangeDetectorRef);

  tasks: Task[] = [];
  clockedIn: string[] = [];

  ngOnInit() {
    this.load();
  }
  ionViewWillEnter() {
    this.load();
  }

  async load() {
    const [all, clockedIn] = await Promise.all([this.db.getTasks(), this.db.getClockedIn()]);
    this.tasks =
      this.session.role === 'OIC' ? all : all.filter((t) => t.assignedTo === this.session.userName);
    this.clockedIn = clockedIn;
    this.cdr.detectChanges();
  }

  chip(status: string): string {
    return status === 'Verified' ? 'ok' : status === 'Done' ? 'info' : status === 'In Progress' ? 'warn' : '';
  }

  async markDone(t: Task) {
    t.status = 'Done';
    await this.db.updateTaskStatus(t.id, 'Done');
    await this.session.record('Task marked as done');
    this.cdr.detectChanges();
  }

  async verify(t: Task) {
    t.status = 'Verified';
    await this.db.updateTaskStatus(t.id, 'Verified');
    await this.session.record('Task verified');
    this.cdr.detectChanges();
  }

  assign() {
    this.nav.navigateForward('/task-assign');
  }
}
