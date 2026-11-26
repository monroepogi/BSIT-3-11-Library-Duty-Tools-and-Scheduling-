import { inject, Injectable } from '@angular/core';
import {
  type DutyRequestRow,
  type ShiftRow,
  SupabaseService,
  type TaskRow,
  type VisitorEntryRow,
} from '@vits/shared-network';
import { DutyRequest } from '../../attributes/duty-request';
import { VisitorEntry } from '../../attributes/visitor-entry';

export interface Shift {
  id: number;
  day: string;
  date: string;
  startTime: string;
  endTime: string;
  section: string;
  oic: string;
  student: string;
  status: 'Scheduled' | 'Completed' | 'Missed';
}

export interface Task {
  id: number;
  title: string;
  type: 'Shelving' | 'Circulation' | 'Inventory';
  section: string;
  assignedTo: string;
  status: 'Assigned' | 'In Progress' | 'Done' | 'Verified';
}

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

  private offline = false;
  private pendingMutations: PendingMutation[] = [];

  private localShifts: Shift[] = [
    { id: 1, day: 'Mon', date: 'Oct 26', startTime: '08:00', endTime: '12:00', section: 'Circulation', oic: 'Ms. Reyes', student: 'Juan Dela Cruz', status: 'Completed' },
    { id: 2, day: 'Tue', date: 'Oct 27', startTime: '13:00', endTime: '17:00', section: 'Periodicals', oic: 'Ms. Reyes', student: 'Maria Santos', status: 'Completed' },
    { id: 3, day: 'Wed', date: 'Oct 28', startTime: '09:00', endTime: '13:00', section: 'Circulation', oic: 'Ms. Reyes', student: 'Juan Dela Cruz', status: 'Scheduled' },
    { id: 4, day: 'Wed', date: 'Oct 28', startTime: '13:00', endTime: '17:00', section: 'Reference', oic: 'Ms. Reyes', student: 'Maria Santos', status: 'Scheduled' },
    { id: 5, day: 'Thu', date: 'Oct 29', startTime: '08:00', endTime: '12:00', section: 'Reference', oic: 'Ms. Reyes', student: 'Juan Dela Cruz', status: 'Scheduled' },
    { id: 6, day: 'Fri', date: 'Oct 30', startTime: '10:00', endTime: '14:00', section: 'Circulation', oic: 'Ms. Reyes', student: 'Paolo Lim', status: 'Scheduled' },
  ];

  private localTasks: Task[] = [
    { id: 1, title: 'Shelve returned books (300s)', type: 'Shelving', section: 'Circulation', assignedTo: 'Juan Dela Cruz', status: 'In Progress' },
    { id: 2, title: 'Process overdue notices', type: 'Circulation', section: 'Circulation', assignedTo: 'Juan Dela Cruz', status: 'Assigned' },
    { id: 3, title: 'Inventory of periodicals shelf B', type: 'Inventory', section: 'Periodicals', assignedTo: 'Maria Santos', status: 'Done' },
    { id: 4, title: 'Reference desk assistance', type: 'Circulation', section: 'Reference', assignedTo: 'Paolo Lim', status: 'Assigned' },
  ];

  private localRequests: DutyRequest[] = [
    { id: 1, kind: 'Swap', shiftLabel: 'Thu Oct 29, 08:00-12:00', reason: 'Class conflict', requester: 'Juan Dela Cruz', submittedOn: 'Oct 27', status: 'Pending OIC' },
    { id: 2, kind: 'Leave', shiftLabel: 'Mon Oct 26, 08:00-12:00', reason: 'Medical appointment', requester: 'Juan Dela Cruz', submittedOn: 'Oct 24', status: 'Approved' },
    { id: 3, kind: 'Swap', shiftLabel: 'Wed Oct 28, 13:00-17:00', reason: 'Exam review', requester: 'Maria Santos', submittedOn: 'Oct 27', status: 'Pending OIC' },
    { id: 4, kind: 'Leave', shiftLabel: 'Fri Oct 30, 10:00-14:00', reason: 'Family event', requester: 'Paolo Lim', submittedOn: 'Oct 26', status: 'Endorsed' },
  ];

  private localVisitors: VisitorEntry[] = [
    { id: 1, name: 'Dr. Alvarez', kind: 'Visitor', detail: 'Faculty, Reference section', time: '09:10' },
    { id: 2, name: 'Kim Dizon', kind: 'Baggage', detail: 'Locker 12, black backpack', time: '09:25' },
    { id: 3, name: 'Ana Cruz', kind: 'Paper', detail: 'Thesis: Coastal Erosion Study (2019), ID 2021-0457', time: '10:05', returned: false },
    { id: 4, name: 'Leo Tan', kind: 'Paper', detail: 'Journal: Marine Ecology Vol. 12, ID 2020-0112', time: '10:40', returned: true },
  ];

  private localStudents = ['Juan Dela Cruz', 'Maria Santos', 'Paolo Lim'];
  private localClockedIn = new Set<string>(['Maria Santos', 'Paolo Lim']);
  private readonly defaultHours = { done: 24, required: 60 };

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
      return [...this.localShifts];
    }
    try {
      const { data, error } = await this.supabase
        .from('shifts')
        .select('*')
        .order('id', { ascending: true });
      if (error || !data) throw error ?? new Error('Failed to load shifts');
      const mapped = data.map(mapShiftRow);
      this.localShifts = mapped;
      return mapped;
    } catch {
      return [...this.localShifts];
    }
  }

  async getShiftById(id: number): Promise<Shift | undefined> {
    if (!this.isRemoteActive) {
      return this.localShifts.find((s) => s.id === id);
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
      return this.localShifts.find((s) => s.id === id);
    }
  }

  async getTasks(): Promise<Task[]> {
    if (!this.isRemoteActive) {
      return [...this.localTasks];
    }
    try {
      const { data, error } = await this.supabase
        .from('tasks')
        .select('*')
        .order('id', { ascending: false });
      if (error || !data) throw error ?? new Error('Failed to load tasks');
      const mapped = data.map(mapTaskRow);
      this.localTasks = mapped;
      return mapped;
    } catch {
      return [...this.localTasks];
    }
  }

  async addTask(input: Omit<Task, 'id'>, createdBy?: string): Promise<Task> {
    const localTask: Task = { id: Date.now(), ...input };
    this.localTasks = [localTask, ...this.localTasks];

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
    this.localTasks = this.localTasks.map((t) => (t.id === id ? { ...t, status } : t));

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
      return [...this.localRequests];
    }
    try {
      const { data, error } = await this.supabase
        .from('duty_requests')
        .select('*')
        .order('id', { ascending: false });
      if (error || !data) throw error ?? new Error('Failed to load duty requests');
      const mapped = data.map(mapRequestRow);
      this.localRequests = mapped;
      return mapped;
    } catch {
      return [...this.localRequests];
    }
  }

  async addRequest(
    input: Omit<DutyRequest, 'id'>,
    options?: { shiftId?: number; attachmentName?: string },
  ): Promise<DutyRequest> {
    const localRequest: DutyRequest = { id: Date.now(), ...input };
    this.localRequests = [localRequest, ...this.localRequests];

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
    this.localRequests = this.localRequests.map((r) => (r.id === id ? { ...r, status } : r));

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
      return [...this.localVisitors];
    }
    try {
      const { data, error } = await this.supabase
        .from('visitor_entries')
        .select('*')
        .is('deleted_at', null)
        .order('id', { ascending: false });
      if (error || !data) throw error ?? new Error('Failed to load visitor entries');
      const mapped = data.map(mapVisitorRow);
      this.localVisitors = mapped;
      return mapped;
    } catch {
      return [...this.localVisitors];
    }
  }

  async addVisitor(
    input: Omit<VisitorEntry, 'id'>,
    recordedBy?: string,
  ): Promise<VisitorEntry> {
    const localEntry: VisitorEntry = { id: Date.now(), ...input };
    this.localVisitors = [localEntry, ...this.localVisitors];

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
    this.localVisitors = this.localVisitors.map((v) =>
      v.id === id ? { ...v, returned: true } : v,
    );

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
      return [...this.localStudents];
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
      this.localStudents = names;
      return names;
    } catch {
      return [...this.localStudents];
    }
  }

  async getStudentHours(studentName: string): Promise<{ done: number; required: number }> {
    if (!this.isRemoteActive) {
      return this.defaultHours;
    }
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('done_hours, required_hours')
        .eq('full_name', studentName)
        .maybeSingle();
      if (error || !data) return this.defaultHours;
      return {
        done: Number(data.done_hours),
        required: data.required_hours,
      };
    } catch {
      return this.defaultHours;
    }
  }

  async getClockedIn(): Promise<string[]> {
    if (!this.isRemoteActive) {
      return Array.from(this.localClockedIn);
    }
    try {
      const { data, error } = await this.supabase
        .from('attendance_logs')
        .select('student_name')
        .eq('is_active', true)
        .order('clocked_in_at', { ascending: false });
      if (error || !data) throw error ?? new Error('Failed to load active attendance');
      const names = data.map((row) => row.student_name);
      this.localClockedIn = new Set(names);
      return names;
    } catch {
      return Array.from(this.localClockedIn);
    }
  }

  async isClockedIn(student: string): Promise<boolean> {
    if (!this.isRemoteActive) {
      return this.localClockedIn.has(student);
    }
    const active = await this.getClockedIn();
    return active.includes(student);
  }

  async clockIn(student: string, scannedBy?: string): Promise<'ok' | 'already_in'> {
    const localClockIn = (): 'ok' | 'already_in' => {
      if (this.localClockedIn.has(student)) return 'already_in';
      this.localClockedIn.add(student);
      return 'ok';
    };

    if (!this.isRemoteActive) {
      const result = localClockIn();
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
        this.localClockedIn.add(student);
      }
      return result;
    } catch {
      const result = localClockIn();
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
    const localClockOut = (): 'ok' | 'not_in' => {
      if (!this.localClockedIn.has(student)) return 'not_in';
      this.localClockedIn.delete(student);
      return 'ok';
    };

    if (!this.isRemoteActive) {
      const result = localClockOut();
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
        this.localClockedIn.delete(student);
      }
      return result;
    } catch {
      const result = localClockOut();
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
