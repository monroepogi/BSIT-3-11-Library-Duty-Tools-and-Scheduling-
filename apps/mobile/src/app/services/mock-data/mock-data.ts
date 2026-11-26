import { Injectable } from '@angular/core';
import { DutyRequest } from '../../attributes/duty-request';
import { VisitorEntry } from '../../attributes/visitor-entry';

/**
 * Temporary in-memory mock store ONLY for Modules 4 & 5 (Requests & Visitor's Log).
 * Shifts, Attendance, Hours, and Floor Tasks now run against real /v1 API + local SQLite/Outbox.
 * This service is removed in Phase 6.
 */
@Injectable({ providedIn: 'root' })
export class MockDataService {
  private requests: DutyRequest[] = [
    { id: 1, kind: 'Swap', shiftLabel: 'Thu Oct 29, 08:00-12:00', reason: 'Class conflict', requester: 'Maria Santos', submittedOn: 'Oct 27', status: 'Pending OIC' },
    { id: 2, kind: 'Leave', shiftLabel: 'Mon Oct 26, 08:00-12:00', reason: 'Medical appointment', requester: 'Maria Santos', submittedOn: 'Oct 24', status: 'Approved' },
    { id: 3, kind: 'Swap', shiftLabel: 'Wed Oct 28, 13:00-17:00', reason: 'Exam review', requester: 'Liam Villanueva', submittedOn: 'Oct 27', status: 'Pending OIC' },
    { id: 4, kind: 'Leave', shiftLabel: 'Fri Oct 30, 10:00-14:00', reason: 'Family event', requester: 'Liam Villanueva', submittedOn: 'Oct 26', status: 'Endorsed' },
  ];

  private visitors: VisitorEntry[] = [
    { id: 1, name: 'Dr. Alvarez', kind: 'Visitor', detail: 'Faculty, Reference section', time: '09:10' },
    { id: 2, name: 'Kim Dizon', kind: 'Baggage', detail: 'Locker 12, black backpack', time: '09:25' },
    { id: 3, name: 'Ana Cruz', kind: 'Paper', detail: 'Thesis: Coastal Erosion Study (2019), ID 2021-0457', time: '10:05', returned: false },
    { id: 4, name: 'Leo Tan', kind: 'Paper', detail: 'Journal: Marine Ecology Vol. 12, ID 2020-0112', time: '10:40', returned: true },
  ];

  getRequests(): Promise<DutyRequest[]> {
    return Promise.resolve(this.requests);
  }

  getVisitors(): Promise<VisitorEntry[]> {
    return Promise.resolve(this.visitors);
  }

  addRequest(r: DutyRequest): void {
    this.requests.unshift(r);
  }

  addVisitor(v: VisitorEntry): void {
    this.visitors.unshift(v);
  }
}
