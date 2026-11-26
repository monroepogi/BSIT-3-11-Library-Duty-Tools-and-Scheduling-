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
import { SessionService } from '../../../services/session/session';
import { MockDataService } from '../../../services/mock-data/mock-data';

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
  private readonly data = inject(MockDataService);
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
    const all = await this.data.getTasks();
    this.tasks =
      this.session.role === 'OIC' ? all : all.filter((t) => t.assignedTo === this.session.userName);
    this.clockedIn = await this.data.getClockedIn();
    this.cdr.detectChanges();
  }

  chip(status: string): string {
    return status === 'Verified' ? 'ok' : status === 'Done' ? 'info' : status === 'In Progress' ? 'warn' : '';
  }

  async markDone(t: Task) {
    t.status = 'Done';
    await this.session.record('Task marked as done');
    this.cdr.detectChanges();
  }

  async verify(t: Task) {
    t.status = 'Verified';
    await this.session.record('Task verified');
    this.cdr.detectChanges();
  }

  assign() {
    this.nav.navigateForward('/task-assign');
  }
}
