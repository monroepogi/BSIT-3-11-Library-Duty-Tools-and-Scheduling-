import { inject, Injectable } from '@angular/core';
import {
  type DutyRequestRow,
  type ShiftRow,
  SupabaseService,
  type TaskRow,
  type VisitorEntryRow,
} from '@vits/shared-network';
import { DutyRequest } from '../../attributes/duty-request';
import { Shift } from '../../attributes/shift';
import { Task } from '../../attributes/task';
import { VisitorEntry } from '../../attributes/visitor-entry';
import { MockDataService } from '../mock-data/mock-data';

type PendingMutation = () => Promise<void>;

function mapShiftRow(row: ShiftRow): Shift {
  return {
    id: row.id,
    day: row.day_label,
    date: row.shift_date,
    startTime: row.start_time,
    endTime: row.end_time,
    section: row.section,
    oic: row.oic_name,
    student: row.student_name,
    status: row.status,
  };
}

function mapTaskRow(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    section: row.section,
    assignedTo: row.assigned_to,
    status: row.status,
  };
}

function mapRequestRow(row: DutyRequestRow): DutyRequest {
  return {
    id: row.id,
    kind: row.kind,
    shiftLabel: row.shift_label,
    reason: row.reason,
    requester: row.requester,
    submittedOn: row.submitted_on,
    status: row.status,
  };
}

function mapVisitorRow(row: VisitorEntryRow): VisitorEntry {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    detail: row.detail,
    time: row.entry_time,
    returned: row.returned ?? undefined,
  };
}

@Injectable({ providedIn: 'root' })
export class LibraryDatabaseService {
  private readonly supabase = inject(SupabaseService);
  private readonly fallback = inject(MockDataService);

  private offline = false;
  private pendingMutations: PendingMutation[] = [];

  get isRemoteActive(): boolean {
    return this.supabase.isConfigured && !this.offline;
  }

  get isConfigured(): boolean {
    return this.supabase.isConfigured;
  }

  get pendingCount(): number {
    return this.pendingMutations.length;
  }

  setOffline(offline: boolean): void {
    this.offline = offline;
  }

  async flushPendingOperations(): Promise<number> {
    if (!this.isRemoteActive || this.pendingMutations.length === 0) {
      return 0;
    }
    const queue = [...this.pendingMutations];
    this.pendingMutations = [];
    let flushed = 0;

    for (let i = 0; i < queue.length; i++) {
      try {
        await queue[i]!();
        flushed++;
      } catch {
        this.pendingMutations.push(...queue.slice(i));
        break;
      }
    }
    return flushed;
  }

  async checkConnection() {
    return this.supabase.checkHealth();
  }

  async getShifts(): Promise<Shift[]> {
    if (!this.isRemoteActive) {
      return this.fallback.getShifts();
    }
    try {
      const { data, error } = await this.supabase
        .from('shifts')
        .select('*')
        .order('id', { ascending: true });
      if (error || !data) throw error ?? new Error('Failed to load shifts');
      const mapped = data.map(mapShiftRow);
      this.fallback.replaceShifts(mapped);
      return mapped;
    } catch {
      return this.fallback.getShifts();
    }
  }

  async getShiftById(id: number): Promise<Shift | undefined> {
    if (!this.isRemoteActive) {
      return this.fallback.getShiftById(id);
    }
    try {
      const { data, error } = await this.supabase
        .from('shifts')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data ? mapShiftRow(data) : undefined;
    } catch {
      return this.fallback.getShiftById(id);
    }
  }

  async getTasks(): Promise<Task[]> {
    if (!this.isRemoteActive) {
      return this.fallback.getTasks();
    }
    try {
      const { data, error } = await this.supabase
        .from('tasks')
        .select('*')
        .order('id', { ascending: false });
      if (error || !data) throw error ?? new Error('Failed to load tasks');
      const mapped = data.map(mapTaskRow);
      this.fallback.replaceTasks(mapped);
      return mapped;
    } catch {
      return this.fallback.getTasks();
    }
  }

  async addTask(input: Omit<Task, 'id'>, createdBy?: string): Promise<Task> {
    const localTask: Task = { id: Date.now(), ...input };
    this.fallback.addTask(localTask);

    const persist = async () => {
      const { data, error } = await this.supabase
        .from('tasks')
        .insert({
          title: input.title,
          type: input.type,
          section: input.section,
          assigned_to: input.assignedTo,
          status: input.status,
          created_by: createdBy ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      if (data) {
        localTask.id = data.id;
      }
    };

    await this.runOrQueue(persist);
    return localTask;
  }

  async updateTaskStatus(id: number, status: Task['status']): Promise<void> {
    this.fallback.updateTaskStatus(id, status);

    const persist = async () => {
      const nowIso = new Date().toISOString();
      const { error } = await this.supabase
        .from('tasks')
        .update({
          status,
          ...(status === 'Done' ? { completed_at: nowIso } : {}),
          ...(status === 'Verified' ? { verified_at: nowIso } : {}),
        })
        .eq('id', id);
      if (error) throw error;
    };

    await this.runOrQueue(persist);
  }

  async getRequests(): Promise<DutyRequest[]> {
    if (!this.isRemoteActive) {
      return this.fallback.getRequests();
    }
    try {
      const { data, error } = await this.supabase
        .from('duty_requests')
        .select('*')
        .order('id', { ascending: false });
      if (error || !data) throw error ?? new Error('Failed to load duty requests');
      const mapped = data.map(mapRequestRow);
      this.fallback.replaceRequests(mapped);
      return mapped;
    } catch {
      return this.fallback.getRequests();
    }
  }

  async addRequest(
    input: Omit<DutyRequest, 'id'>,
    options?: { shiftId?: number; attachmentName?: string },
  ): Promise<DutyRequest> {
    const localRequest: DutyRequest = { id: Date.now(), ...input };
    this.fallback.addRequest(localRequest);

    const persist = async () => {
      const { data, error } = await this.supabase
        .from('duty_requests')
        .insert({
          kind: input.kind,
          shift_id: options?.shiftId ?? null,
          shift_label: input.shiftLabel,
          reason: input.reason,
          requester: input.requester,
          submitted_on: input.submittedOn,
          attachment_name: options?.attachmentName ?? null,
          status: input.status,
        })
        .select()
        .single();
      if (error) throw error;
      if (data) {
        localRequest.id = data.id;
      }
    };

    await this.runOrQueue(persist);
    return localRequest;
  }

  async updateRequestStatus(
    id: number,
    status: DutyRequest['status'],
    endorsedBy?: string,
  ): Promise<void> {
    this.fallback.updateRequestStatus(id, status);

    const persist = async () => {
      const { error } = await this.supabase
        .from('duty_requests')
        .update({
          status,
          ...(status === 'Endorsed' || status === 'Rejected'
            ? {
                endorsed_by: endorsedBy ?? null,
                endorsed_at: new Date().toISOString(),
              }
            : {}),
        })
        .eq('id', id);
      if (error) throw error;
    };

    await this.runOrQueue(persist);
  }

  async getVisitors(): Promise<VisitorEntry[]> {
    if (!this.isRemoteActive) {
      return this.fallback.getVisitors();
    }
    try {
      const { data, error } = await this.supabase
        .from('visitor_entries')
        .select('*')
        .is('deleted_at', null)
        .order('id', { ascending: false });
      if (error || !data) throw error ?? new Error('Failed to load visitor entries');
      const mapped = data.map(mapVisitorRow);
      this.fallback.replaceVisitors(mapped);
      return mapped;
    } catch {
      return this.fallback.getVisitors();
    }
  }

  async addVisitor(
    input: Omit<VisitorEntry, 'id'>,
    recordedBy?: string,
  ): Promise<VisitorEntry> {
    const localEntry: VisitorEntry = { id: Date.now(), ...input };
    this.fallback.addVisitor(localEntry);

    const persist = async () => {
      const { data, error } = await this.supabase
        .from('visitor_entries')
        .insert({
          name: input.name,
          kind: input.kind,
          detail: input.detail,
          entry_time: input.time,
          returned: input.returned ?? null,
          recorded_by: recordedBy ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      if (data) {
        localEntry.id = data.id;
      }
    };

    await this.runOrQueue(persist);
    return localEntry;
  }

  async markPaperReturned(id: number): Promise<void> {
    this.fallback.markPaperReturned(id);

    const persist = async () => {
      const { error } = await this.supabase
        .from('visitor_entries')
        .update({ returned: true })
        .eq('id', id);
      if (error) throw error;
    };

    await this.runOrQueue(persist);
  }

  async getStudents(): Promise<string[]> {
    if (!this.isRemoteActive) {
      return this.fallback.getStudents();
    }
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('full_name')
        .eq('role', 'STUDENT')
        .eq('active', true)
        .order('full_name', { ascending: true });
      if (error || !data) throw error ?? new Error('Failed to load students');
      const names = data.map((row) => row.full_name);
      this.fallback.replaceStudents(names);
      return names;
    } catch {
      return this.fallback.getStudents();
    }
  }

  async getStudentHours(studentName: string): Promise<{ done: number; required: number }> {
    if (!this.isRemoteActive) {
      return this.fallback.hours;
    }
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('done_hours, required_hours')
        .eq('full_name', studentName)
        .maybeSingle();
      if (error || !data) return this.fallback.hours;
      return {
        done: Number(data.done_hours),
        required: data.required_hours,
      };
    } catch {
      return this.fallback.hours;
    }
  }

  async getClockedIn(): Promise<string[]> {
    if (!this.isRemoteActive) {
      return this.fallback.getClockedIn();
    }
    try {
      const { data, error } = await this.supabase
        .from('attendance_logs')
        .select('student_name')
        .eq('is_active', true)
        .order('clocked_in_at', { ascending: false });
      if (error || !data) throw error ?? new Error('Failed to load active attendance');
      const names = data.map((row) => row.student_name);
      this.fallback.replaceClockedIn(names);
      return names;
    } catch {
      return this.fallback.getClockedIn();
    }
  }

  async isClockedIn(student: string): Promise<boolean> {
    if (!this.isRemoteActive) {
      return this.fallback.isClockedIn(student);
    }
    const active = await this.getClockedIn();
    return active.includes(student);
  }

  async clockIn(student: string, scannedBy?: string): Promise<'ok' | 'already_in'> {
    if (!this.isRemoteActive) {
      const result = this.fallback.clockIn(student);
      if (result === 'ok' && this.supabase.isConfigured) {
        this.pendingMutations.push(async () => {
          await this.supabase.rpc('clock_in_student', {
            p_student_name: student,
            p_scanned_by: scannedBy ?? null,
          });
        });
      }
      return result;
    }

    try {
      const { data, error } = await this.supabase.rpc('clock_in_student', {
        p_student_name: student,
        p_scanned_by: scannedBy ?? null,
      });
      if (error) throw error;
      const result = data === 'already_in' ? 'already_in' : 'ok';
      if (result === 'ok') {
        this.fallback.clockIn(student);
      }
      return result;
    } catch {
      const result = this.fallback.clockIn(student);
      if (result === 'ok') {
        this.pendingMutations.push(async () => {
          await this.supabase.rpc('clock_in_student', {
            p_student_name: student,
            p_scanned_by: scannedBy ?? null,
          });
        });
      }
      return result;
    }
  }

  async clockOut(student: string): Promise<'ok' | 'not_in'> {
    if (!this.isRemoteActive) {
      const result = this.fallback.clockOut(student);
      if (result === 'ok' && this.supabase.isConfigured) {
        this.pendingMutations.push(async () => {
          await this.supabase.rpc('clock_out_student', { p_student_name: student });
        });
      }
      return result;
    }

    try {
      const { data, error } = await this.supabase.rpc('clock_out_student', {
        p_student_name: student,
      });
      if (error) throw error;
      const result = data === 'not_in' ? 'not_in' : 'ok';
      if (result === 'ok') {
        this.fallback.clockOut(student);
      }
      return result;
    } catch {
      const result = this.fallback.clockOut(student);
      if (result === 'ok') {
        this.pendingMutations.push(async () => {
          await this.supabase.rpc('clock_out_student', { p_student_name: student });
        });
      }
      return result;
    }
  }

  private async runOrQueue(op: PendingMutation): Promise<void> {
    if (!this.supabase.isConfigured) {
      return;
    }
    if (this.offline) {
      this.pendingMutations.push(op);
      return;
    }
    try {
      await op();
    } catch {
      this.pendingMutations.push(op);
    }
  }
}
