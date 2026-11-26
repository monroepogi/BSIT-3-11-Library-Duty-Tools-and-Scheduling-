import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular';
import type { TaskCategory, TaskDto } from '@vits/shared-types';
import { AuthService } from '../../../core/auth.service';
import { OutboxRepository, ShiftsRepository, TasksRepository } from '../../../core/db/repositories';
import { SyncService } from '../../../core/sync/sync.service';

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
export class TaskAssignPage {
  private readonly auth = inject(AuthService);
  private readonly shiftsRepo = inject(ShiftsRepository);
  private readonly tasksRepo = inject(TasksRepository);
  private readonly outbox = inject(OutboxRepository);
  private readonly sync = inject(SyncService);
  private readonly nav = inject(NavController);

  readonly rosteredShifts = computed(() =>
    this.shiftsRepo.shifts().filter((s) => s.status !== 'cancelled'),
  );

  selectedShiftId = '';
  category: TaskCategory = 'shelving';
  title = '';

  async assign(): Promise<void> {
    const oicUser = this.auth.currentUser();
    const shift = this.rosteredShifts().find((s) => s.id === this.selectedShiftId);
    if (!oicUser || !shift || !this.title.trim()) return;

    const taskId = `tsk-${crypto.randomUUID()}`;
    const newTask: TaskDto = {
      id: taskId,
      shiftId: shift.id,
      sectionId: shift.sectionId,
      sectionName: shift.sectionName,
      category: this.category,
      assignedToUserId: shift.userId,
      assignedToName: shift.userFullName,
      createdByUserId: oicUser.id,
      createdByName: oicUser.fullName,
      title: this.title.trim(),
      description: null,
      status: 'todo',
      completedAt: null,
      version: 1,
    };

    await this.tasksRepo.upsertLocalTask(newTask);
    await this.outbox.enqueue({
      entityType: 'task',
      entityId: taskId,
      type: 'task.create',
      label: `Assign "${newTask.title}" to ${shift.userFullName}`,
      payload: {
        id: taskId,
        shiftId: shift.id,
        category: this.category,
        assignedToUserId: shift.userId,
        title: newTask.title,
      },
    });
    await this.auth.notify(`Task assigned to ${shift.userFullName}`);
    this.sync.scheduleDebouncedSync(100);
    await this.nav.navigateBack('/oic/tasks');
  }
}
