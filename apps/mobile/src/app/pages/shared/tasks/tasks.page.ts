import { Component, OnInit, computed, inject } from '@angular/core';
import {
  IonButton,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular';
import type { TaskDto } from '@vits/shared-types';
import { AuthService } from '../../../core/auth.service';
import { OutboxRepository, ShiftsRepository, TasksRepository } from '../../../core/db/repositories';
import { SyncService } from '../../../core/sync/sync.service';

@Component({
  selector: 'app-tasks',
  templateUrl: './tasks.page.html',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonFab, IonFabButton, IonIcon],
})
export class TasksPage implements OnInit {
  readonly auth = inject(AuthService);
  private readonly tasksRepo = inject(TasksRepository);
  private readonly shiftsRepo = inject(ShiftsRepository);
  private readonly outbox = inject(OutboxRepository);
  private readonly sync = inject(SyncService);
  private readonly nav = inject(NavController);

  readonly tasks = computed(() => {
    const uid = this.auth.currentUser()?.id;
    const all = this.tasksRepo.tasks();
    return this.auth.role() === 'OIC' ? all : all.filter((t) => t.assignedToUserId === uid);
  });

  readonly clockedIn = computed(() =>
    this.shiftsRepo
      .shifts()
      .filter((s) => s.status === 'in_progress')
      .map((s) => s.userFullName),
  );

  ngOnInit(): void {
    void this.auth.ensureInitialized();
  }

  ionViewWillEnter(): void {
    void this.sync.syncNow().catch(() => undefined);
  }

  chip(status: TaskDto['status']): string {
    return status === 'verified'
      ? 'ok'
      : status === 'done'
        ? 'info'
        : status === 'in_progress'
          ? 'warn'
          : '';
  }

  async markDone(t: TaskDto): Promise<void> {
    await this.tasksRepo.updateLocalTaskStatus(t.id, 'done');
    await this.outbox.enqueue({
      entityType: 'task',
      entityId: t.id,
      type: 'task.update_status',
      label: `Task done: ${t.title}`,
      payload: { status: 'done' },
    });
    await this.auth.notify(this.auth.isOffline() ? 'Task saved offline, will sync' : 'Task marked as done');
    this.sync.scheduleDebouncedSync(100);
  }

  async verify(t: TaskDto): Promise<void> {
    await this.tasksRepo.updateLocalTaskStatus(t.id, 'verified');
    await this.outbox.enqueue({
      entityType: 'task',
      entityId: t.id,
      type: 'task.update_status',
      label: `Task verified: ${t.title}`,
      payload: { status: 'verified' },
    });
    await this.auth.notify(this.auth.isOffline() ? 'Verification queued offline' : 'Task verified');
    this.sync.scheduleDebouncedSync(100);
  }

  assign(): void {
    void this.nav.navigateForward('/task-assign');
  }
}
