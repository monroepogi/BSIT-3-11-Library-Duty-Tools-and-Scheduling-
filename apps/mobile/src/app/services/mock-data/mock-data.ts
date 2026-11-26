import { Injectable } from '@angular/core';
import { Shift } from '../../attributes/shift';
import { Task } from '../../attributes/task';
import { DutyRequest } from '../../attributes/duty-request';
import { VisitorEntry } from '../../attributes/visitor-entry';

@Injectable({ providedIn: 'root' })
export class MockDataService {
  readonly hours = { done: 24, required: 60 };

  private students = ['Juan Dela Cruz', 'Maria Santos', 'Paolo Lim'];
  private clockedIn = ['Maria Santos', 'Paolo Lim'];

  private shifts: Shift[] = [
    { id: 1, day: 'Mon', date: 'Oct 26', startTime: '08:00', endTime: '12:00', section: 'Circulation', oic: 'Ms. Reyes', student: 'Juan Dela Cruz', status: 'Completed' },
    { id: 2, day: 'Tue', date: 'Oct 27', startTime: '13:00', endTime: '17:00', section: 'Periodicals', oic: 'Ms. Reyes', student: 'Maria Santos', status: 'Completed' },
    { id: 3, day: 'Wed', date: 'Oct 28', startTime: '09:00', endTime: '13:00', section: 'Circulation', oic: 'Ms. Reyes', student: 'Juan Dela Cruz', status: 'Scheduled' },
    { id: 4, day: 'Wed', date: 'Oct 28', startTime: '13:00', endTime: '17:00', section: 'Reference', oic: 'Ms. Reyes', student: 'Maria Santos', status: 'Scheduled' },
    { id: 5, day: 'Thu', date: 'Oct 29', startTime: '08:00', endTime: '12:00', section: 'Reference', oic: 'Ms. Reyes', student: 'Juan Dela Cruz', status: 'Scheduled' },
    { id: 6, day: 'Fri', date: 'Oct 30', startTime: '10:00', endTime: '14:00', section: 'Circulation', oic: 'Ms. Reyes', student: 'Paolo Lim', status: 'Scheduled' }
  ];

  private tasks: Task[] = [
    { id: 1, title: 'Shelve returned books (300s)', type: 'Shelving', section: 'Circulation', assignedTo: 'Juan Dela Cruz', status: 'In Progress' },
    { id: 2, title: 'Process overdue notices', type: 'Circulation', section: 'Circulation', assignedTo: 'Juan Dela Cruz', status: 'Assigned' },
    { id: 3, title: 'Inventory of periodicals shelf B', type: 'Inventory', section: 'Periodicals', assignedTo: 'Maria Santos', status: 'Done' },
    { id: 4, title: 'Reference desk assistance', type: 'Circulation', section: 'Reference', assignedTo: 'Paolo Lim', status: 'Assigned' }
  ];

  private requests: DutyRequest[] = [
    { id: 1, kind: 'Swap', shiftLabel: 'Thu Oct 29, 08:00-12:00', reason: 'Class conflict', requester: 'Juan Dela Cruz', submittedOn: 'Oct 27', status: 'Pending OIC' },
    { id: 2, kind: 'Leave', shiftLabel: 'Mon Oct 26, 08:00-12:00', reason: 'Medical appointment', requester: 'Juan Dela Cruz', submittedOn: 'Oct 24', status: 'Approved' },
    { id: 3, kind: 'Swap', shiftLabel: 'Wed Oct 28, 13:00-17:00', reason: 'Exam review', requester: 'Maria Santos', submittedOn: 'Oct 27', status: 'Pending OIC' },
    { id: 4, kind: 'Leave', shiftLabel: 'Fri Oct 30, 10:00-14:00', reason: 'Family event', requester: 'Paolo Lim', submittedOn: 'Oct 26', status: 'Endorsed' }
  ];

  private visitors: VisitorEntry[] = [
    { id: 1, name: 'Dr. Alvarez', kind: 'Visitor', detail: 'Faculty, Reference section', time: '09:10' },
    { id: 2, name: 'Kim Dizon', kind: 'Baggage', detail: 'Locker 12, black backpack', time: '09:25' },
    { id: 3, name: 'Ana Cruz', kind: 'Paper', detail: 'Thesis: Coastal Erosion Study (2019), ID 2021-0457', time: '10:05', returned: false },
    { id: 4, name: 'Leo Tan', kind: 'Paper', detail: 'Journal: Marine Ecology Vol. 12, ID 2020-0112', time: '10:40', returned: true }
  ];

  getShifts(): Promise<Shift[]> { return Promise.resolve(this.shifts); }
  getShiftById(id: number): Promise<Shift | undefined> { return Promise.resolve(this.shifts.find(s => s.id === id)); }
  getTasks(): Promise<Task[]> { return Promise.resolve(this.tasks); }
  getRequests(): Promise<DutyRequest[]> { return Promise.resolve(this.requests); }
  getVisitors(): Promise<VisitorEntry[]> { return Promise.resolve(this.visitors); }
  getStudents(): Promise<string[]> { return Promise.resolve(this.students); }
  getClockedIn(): Promise<string[]> { return Promise.resolve([...this.clockedIn]); }
  isClockedIn(student: string): boolean { return this.clockedIn.includes(student); }

  clockIn(student: string): 'ok' | 'already_in' {
    if (this.clockedIn.includes(student)) return 'already_in';
    this.clockedIn.unshift(student);
    return 'ok';
  }

  clockOut(student: string): 'ok' | 'not_in' {
    const idx = this.clockedIn.indexOf(student);
    if (idx === -1) return 'not_in';
    this.clockedIn.splice(idx, 1);
    return 'ok';
  }

  addTask(t: Task) { this.tasks.unshift(t); }
  updateTaskStatus(id: number, status: Task['status']) {
    const target = this.tasks.find(t => t.id === id);
    if (target) target.status = status;
  }

  addRequest(r: DutyRequest) { this.requests.unshift(r); }
  updateRequestStatus(id: number, status: DutyRequest['status']) {
    const target = this.requests.find(r => r.id === id);
    if (target) target.status = status;
  }

  addVisitor(v: VisitorEntry) { this.visitors.unshift(v); }
  markPaperReturned(id: number) {
    const target = this.visitors.find(v => v.id === id);
    if (target) target.returned = true;
  }

  replaceShifts(shifts: Shift[]) { this.shifts = [...shifts]; }
  replaceTasks(tasks: Task[]) { this.tasks = [...tasks]; }
  replaceRequests(requests: DutyRequest[]) { this.requests = [...requests]; }
  replaceVisitors(visitors: VisitorEntry[]) { this.visitors = [...visitors]; }
  replaceStudents(students: string[]) { this.students = [...students]; }
  replaceClockedIn(clockedIn: string[]) { this.clockedIn = [...clockedIn]; }
}
