import { Injectable } from '@nestjs/common';
import {
  getLibraryDateString,
  type DiscrepancyType,
  type DutyCertificateDto,
  type HourCapDto,
  type HoursSummaryDto,
  type LeaveRequestDto,
  type ScheduleTemplateDto,
  type SectionDto,
  type SemesterDto,
  type ShiftDto,
  type SwapRequestDto,
  type SyncBatchOpSummaryDto,
  type SyncPullChangeDto,
  type TaskDto,
  type TrustPublicKeyDto,
  type UserProfileDto,
  type UserRole,
} from '@vits/shared-types';
import { loadApiConfig, type ApiConfig } from '../common/config';
import { hashPasswordArgon2id } from '../common/password.util';

export interface StoredUserRecord {
  profile: UserProfileDto;
  passwordHash: string;
}

export interface StoredSessionRecord {
  id: string;
  familyId: string;
  userId: string;
  clientId: 'mobile' | 'admin';
  deviceId: string;
  refreshTokenHash: string;
  usedAt: string | null;
  revoked: boolean;
  expiresAt: string;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  oicId: string;
  shiftId: string;
  sectionId: string;
  qrNonce: string;
  action: 'IN' | 'OUT';
  oicTs: string;
  serverReceivedAt: string;
}

export interface SyncBatchRecord {
  id: string;
  deviceId: string;
  userId: string;
  receivedAt: string;
  appliedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  ops?: SyncBatchOpSummaryDto[];
}

export interface DiscrepancyRecord {
  id: string;
  type: DiscrepancyType;
  severity: 'low' | 'medium' | 'high';
  userId: string;
  oicName?: string;
  sectionName?: string;
  shiftId: string | null;
  summary: string;
  occurredAt: string;
  status?: 'open' | 'resolved';
  resolutionNotes?: string | null;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
}

export interface ChangeLedgerEntry extends SyncPullChangeDto {
  targetUserIds: string[] | null;
  targetSectionIds: string[] | null;
}

export const DEMO_API_PASSWORD = 'VitsDemo123!';

@Injectable()
export class InMemoryApiStore {
  readonly config: ApiConfig = loadApiConfig();

  readonly users: StoredUserRecord[] = [];
  readonly sessions = new Map<string, StoredSessionRecord>();
  readonly trustKeys: TrustPublicKeyDto[] = [];
  readonly dutyCertificates: DutyCertificateDto[] = [];
  readonly shifts: ShiftDto[] = [];
  readonly hoursByUserId = new Map<string, HoursSummaryDto>();
  readonly tasks: TaskDto[] = [];
  readonly attendance: AttendanceRecord[] = [];
  readonly processedOpIds = new Set<string>();
  readonly syncBatches: SyncBatchRecord[] = [];
  readonly discrepancies: DiscrepancyRecord[] = [];
  readonly monoTracker = new Map<string, { bootId: string; lastWallMs: number; lastMonoMs: number }>();

  readonly semesters: SemesterDto[] = [];
  readonly sections: SectionDto[] = [];
  readonly scheduleTemplates: ScheduleTemplateDto[] = [];
  hourCap: HourCapDto = {
    semesterId: 'sem-2026-1',
    weeklyMaxHours: 12,
    semesterRequiredHours: 90,
    semesterMaxHours: 120,
    updatedAt: '2026-08-15T00:00:00.000Z',
  };
  readonly swapRequests: SwapRequestDto[] = [];
  readonly leaveRequests: LeaveRequestDto[] = [];

  private changeSeq = 0;
  private readonly changeLedger: ChangeLedgerEntry[] = [];

  constructor() {
    this.seedInitialState();
  }

  seedInitialState(): void {
    const today = getLibraryDateString(new Date(), this.config.libraryTimezone);
    const tomorrow = getLibraryDateString(new Date(Date.now() + 86_400_000), this.config.libraryTimezone);
    const yesterday = getLibraryDateString(new Date(Date.now() - 86_400_000), this.config.libraryTimezone);
    const pwHash = hashPasswordArgon2id(DEMO_API_PASSWORD);

    const maria: UserProfileDto = {
      id: 'usr-student-maria',
      universityId: '2024-10482',
      email: 'student@university.edu',
      fullName: 'Maria Santos',
      role: 'student',
      department: 'BS Library & Information Science',
      active: true,
      sectionIds: ['sec-periodicals', 'sec-reserve'],
      sectionNames: ['Periodicals & Serials', 'Reserve & Thesis Section'],
    };

    const liam: UserProfileDto = {
      id: 'usr-student-liam',
      universityId: '2024-11904',
      email: 'liam.villanueva@university.edu',
      fullName: 'Liam Villanueva',
      role: 'student',
      department: 'BA History',
      active: true,
      sectionIds: ['sec-periodicals'],
      sectionNames: ['Periodicals & Serials'],
    };

    const carlo: UserProfileDto = {
      id: 'usr-oic-carlo',
      universityId: '2023-08119',
      email: 'oic@university.edu',
      fullName: 'Carlo Reyes',
      role: 'oic',
      department: 'BS Computer Science',
      active: true,
      sectionIds: ['sec-periodicals', 'sec-reserve'],
      sectionNames: ['Periodicals & Serials', 'Reserve & Thesis Section'],
    };

    const elena: UserProfileDto = {
      id: 'usr-admin-elena',
      universityId: 'ADM-00012',
      email: 'admin@university.edu',
      fullName: 'Elena Cruz',
      role: 'admin',
      department: 'University Main Library Administration',
      active: true,
      sectionIds: [],
      sectionNames: [],
    };

    this.users.push(
      { profile: maria, passwordHash: pwHash },
      { profile: liam, passwordHash: pwHash },
      { profile: carlo, passwordHash: pwHash },
      { profile: elena, passwordHash: pwHash },
    );

    this.trustKeys.push({
      kid: this.config.trustKid,
      alg: 'Ed25519',
      publicKey: this.config.trustPublicKeyB64,
      status: 'active',
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: null,
    });

    const iso = (d: string, hhmm: string) => new Date(`${d}T${hhmm}:00+08:00`).toISOString();

    this.shifts.push(
      {
        id: 'shf-past-1',
        semesterId: 'sem-2026-1',
        sectionId: 'sec-periodicals',
        sectionCode: 'PER-2F',
        sectionName: 'Periodicals & Serials',
        location: 'Main Library 2F — East Wing',
        userId: maria.id,
        userFullName: maria.fullName,
        oicName: carlo.fullName,
        shiftDate: yesterday,
        startsAt: iso(yesterday, '09:00'),
        endsAt: iso(yesterday, '12:00'),
        durationMinutes: 180,
        roleInShift: 'student',
        status: 'completed',
        attendance: {
          checkInAt: iso(yesterday, '08:58'),
          checkOutAt: iso(yesterday, '12:01'),
          verificationStatus: 'verified',
        },
        signedOffBy: carlo.fullName,
        signedOffAt: iso(yesterday, '12:10'),
        signoffRemarks: 'All serials shelved and desks cleared.',
        version: 2,
      },
      {
        id: 'shf-today-maria',
        semesterId: 'sem-2026-1',
        sectionId: 'sec-reserve',
        sectionCode: 'RES-3F',
        sectionName: 'Reserve & Thesis Section',
        location: 'Main Library 3F — North Reading Room',
        userId: maria.id,
        userFullName: maria.fullName,
        oicName: carlo.fullName,
        shiftDate: today,
        startsAt: iso(today, '08:00'),
        endsAt: iso(today, '20:00'),
        durationMinutes: 240,
        roleInShift: 'student',
        status: 'scheduled',
        attendance: { checkInAt: null, checkOutAt: null, verificationStatus: 'none' },
        signedOffBy: null,
        signedOffAt: null,
        signoffRemarks: null,
        version: 1,
      },
      {
        id: 'shf-today-liam',
        semesterId: 'sem-2026-1',
        sectionId: 'sec-periodicals',
        sectionCode: 'PER-2F',
        sectionName: 'Periodicals & Serials',
        location: 'Main Library 2F — East Wing',
        userId: liam.id,
        userFullName: liam.fullName,
        oicName: carlo.fullName,
        shiftDate: today,
        startsAt: iso(today, '09:00'),
        endsAt: iso(today, '21:00'),
        durationMinutes: 240,
        roleInShift: 'student',
        status: 'scheduled',
        attendance: { checkInAt: null, checkOutAt: null, verificationStatus: 'none' },
        signedOffBy: null,
        signedOffAt: null,
        signoffRemarks: null,
        version: 1,
      },
      {
        id: 'shf-tomorrow-maria',
        semesterId: 'sem-2026-1',
        sectionId: 'sec-periodicals',
        sectionCode: 'PER-2F',
        sectionName: 'Periodicals & Serials',
        location: 'Main Library 2F — East Wing',
        userId: maria.id,
        userFullName: maria.fullName,
        oicName: carlo.fullName,
        shiftDate: tomorrow,
        startsAt: iso(tomorrow, '13:00'),
        endsAt: iso(tomorrow, '17:00'),
        durationMinutes: 240,
        roleInShift: 'student',
        status: 'scheduled',
        attendance: { checkInAt: null, checkOutAt: null, verificationStatus: 'none' },
        signedOffBy: null,
        signedOffAt: null,
        signoffRemarks: null,
        version: 1,
      },
    );

    this.hoursByUserId.set(maria.id, {
      semesterId: 'sem-2026-1',
      semesterName: '1st Semester AY 2026–2027',
      renderedMinutes: 1440,
      weeklyRenderedMinutes: 360,
      approvedLeaveMinutes: 120,
      pendingMinutes: 0,
      semesterCapMinutes: 3600,
      weeklyCapMinutes: 600,
    });

    this.hoursByUserId.set(liam.id, {
      semesterId: 'sem-2026-1',
      semesterName: '1st Semester AY 2026–2027',
      renderedMinutes: 960,
      weeklyRenderedMinutes: 240,
      approvedLeaveMinutes: 0,
      pendingMinutes: 0,
      semesterCapMinutes: 3600,
      weeklyCapMinutes: 600,
    });

    this.hoursByUserId.set(carlo.id, {
      semesterId: 'sem-2026-1',
      semesterName: '1st Semester AY 2026–2027',
      renderedMinutes: 2400,
      weeklyRenderedMinutes: 480,
      approvedLeaveMinutes: 0,
      pendingMinutes: 0,
      semesterCapMinutes: 4500,
      weeklyCapMinutes: 720,
    });

    this.tasks.push(
      {
        id: 'tsk-1',
        shiftId: 'shf-today-maria',
        sectionId: 'sec-reserve',
        sectionName: 'Reserve & Thesis Section',
        category: 'shelving',
        assignedToUserId: maria.id,
        assignedToName: maria.fullName,
        createdByUserId: carlo.id,
        createdByName: carlo.fullName,
        title: 'Shelve returned thesis binders (2022–2025)',
        description: 'Sort by department code along shelves R-01 to R-04.',
        status: 'in_progress',
        completedAt: null,
        version: 1,
      },
      {
        id: 'tsk-2',
        shiftId: 'shf-today-maria',
        sectionId: 'sec-reserve',
        sectionName: 'Reserve & Thesis Section',
        category: 'circulation',
        assignedToUserId: maria.id,
        assignedToName: maria.fullName,
        createdByUserId: carlo.id,
        createdByName: carlo.fullName,
        title: 'Process morning reserve recall notices',
        description: 'Verify borrower IDs on overdue 2-hour reserve items.',
        status: 'todo',
        completedAt: null,
        version: 1,
      },
      {
        id: 'tsk-3',
        shiftId: 'shf-today-liam',
        sectionId: 'sec-periodicals',
        sectionName: 'Periodicals & Serials',
        category: 'inventory',
        assignedToUserId: liam.id,
        assignedToName: liam.fullName,
        createdByUserId: carlo.id,
        createdByName: carlo.fullName,
        title: 'Audit bound journal rack B',
        description: 'Check volume labels against catalog sheet.',
        status: 'todo',
        completedAt: null,
        version: 1,
      },
    );

    // Record initial baseline entries in sync ledger
    for (const shift of this.shifts) {
      this.recordChange(
        'shifts',
        shift.id,
        'upsert',
        shift as unknown as Record<string, unknown>,
        shift.version,
        [shift.userId],
        [shift.sectionId],
      );
    }
    for (const task of this.tasks) {
      this.recordChange(
        'tasks',
        task.id,
        'upsert',
        task as unknown as Record<string, unknown>,
        task.version,
        task.assignedToUserId ? [task.assignedToUserId] : null,
        [task.sectionId],
      );
    }

    this.semesters.push(
      {
        id: 'sem-2026-1',
        name: '1st Semester AY 2026–2027',
        startDate: '2026-08-17',
        endDate: '2026-12-18',
        isActive: true,
        publishedShiftsCount: this.shifts.length,
      },
      {
        id: 'sem-2026-2',
        name: '2nd Semester AY 2026–2027',
        startDate: '2027-01-18',
        endDate: '2027-05-21',
        isActive: false,
        publishedShiftsCount: 0,
      },
    );

    this.sections.push(
      {
        id: 'sec-periodicals',
        code: 'PER',
        name: 'Periodicals & Serials',
        location: '2F East Wing',
        oicUserId: 'usr-oic-carlo',
        oicName: 'Carlo Reyes',
        memberCount: 2,
        active: true,
      },
      {
        id: 'sec-reserve',
        code: 'RES',
        name: 'Reserve & Thesis Section',
        location: '3F North Wing',
        oicUserId: 'usr-oic-carlo',
        oicName: 'Carlo Reyes',
        memberCount: 1,
        active: true,
      },
      {
        id: 'sec-circulation',
        code: 'CIR',
        name: 'Circulation & Baggage Desk',
        location: '1F Main Lobby',
        oicUserId: null,
        oicName: null,
        memberCount: 0,
        active: true,
      },
    );

    this.scheduleTemplates.push(
      {
        id: 'tpl-1',
        semesterId: 'sem-2026-1',
        sectionId: 'sec-periodicals',
        sectionName: 'Periodicals & Serials',
        dayOfWeek: 'Mon',
        startTime: '08:00',
        endTime: '12:00',
        slotsRequired: 2,
        assignedStudentNames: ['Maria Santos', 'Liam Villanueva'],
      },
      {
        id: 'tpl-2',
        semesterId: 'sem-2026-1',
        sectionId: 'sec-reserve',
        sectionName: 'Reserve & Thesis Section',
        dayOfWeek: 'Wed',
        startTime: '13:00',
        endTime: '17:00',
        slotsRequired: 1,
        assignedStudentNames: ['Maria Santos'],
      },
    );

    this.swapRequests.push({
      id: 'req-swap-1',
      kind: 'swap',
      semesterId: 'sem-2026-1',
      sectionId: 'sec-periodicals',
      sectionName: 'Periodicals & Serials',
      requesterUserId: 'usr-student-maria',
      requesterName: 'Maria Santos',
      requesterShiftId: 'shf-today-1',
      requesterShiftLabel: `${today} 08:00–12:00`,
      targetUserId: 'usr-student-liam',
      targetUserName: 'Liam Villanueva',
      targetShiftId: 'shf-tomorrow-1',
      targetShiftLabel: `${tomorrow} 13:00–17:00`,
      reason: 'Departmental lab exam conflict',
      status: 'endorsed',
      endorsedBy: 'Carlo Reyes',
      endorsedAt: new Date(Date.now() - 3_600_000).toISOString(),
      decidedBy: null,
      decidedAt: null,
      decisionRemarks: null,
      createdAt: new Date(Date.now() - 7_200_000).toISOString(),
      events: [
        {
          id: 'ev-swap-1',
          actorName: 'Carlo Reyes',
          actorRole: 'oic',
          fromStatus: 'pending_endorsement',
          toStatus: 'endorsed',
          remarks: 'Verified coverage with Liam.',
          createdAt: new Date(Date.now() - 3_600_000).toISOString(),
        },
      ],
      version: 2,
    });

    this.leaveRequests.push({
      id: 'req-leave-1',
      kind: 'leave',
      semesterId: 'sem-2026-1',
      sectionId: 'sec-periodicals',
      sectionName: 'Periodicals & Serials',
      requesterUserId: 'usr-student-liam',
      requesterName: 'Liam Villanueva',
      shiftId: 'shf-today-2',
      shiftLabel: `${today} 13:00–17:00`,
      leaveType: 'academic',
      reason: 'Thesis defense presentation',
      attachments: [],
      status: 'endorsed',
      endorsedBy: 'Carlo Reyes',
      endorsedAt: new Date(Date.now() - 1_800_000).toISOString(),
      decidedBy: null,
      decidedAt: null,
      decisionRemarks: null,
      createdAt: new Date(Date.now() - 5_400_000).toISOString(),
      events: [],
      version: 1,
    });
  }

  findUserByEmail(email: string): StoredUserRecord | undefined {
    const clean = email.trim().toLowerCase();
    return this.users.find((u) => u.profile.email.toLowerCase() === clean);
  }

  findUserById(id: string): StoredUserRecord | undefined {
    return this.users.find((u) => u.profile.id === id);
  }

  findSessionById(id: string): StoredSessionRecord | undefined {
    return this.sessions.get(id);
  }

  findSessionByRefreshHash(hash: string): StoredSessionRecord | undefined {
    for (const sess of this.sessions.values()) {
      if (sess.refreshTokenHash === hash) return sess;
    }
    return undefined;
  }

  revokeSessionFamily(familyId: string): void {
    for (const sess of this.sessions.values()) {
      if (sess.familyId === familyId) {
        sess.revoked = true;
      }
    }
  }

  recordChange(
    table: SyncPullChangeDto['table'],
    id: string,
    op: SyncPullChangeDto['op'],
    data: Record<string, unknown>,
    version: number,
    targetUserIds: string[] | null,
    targetSectionIds: string[] | null,
  ): number {
    this.changeSeq += 1;
    this.changeLedger.push({
      changeSeq: this.changeSeq,
      table,
      id,
      op,
      data,
      version,
      targetUserIds,
      targetSectionIds,
    });
    return this.changeSeq;
  }

  pullChangesForUser(
    user: UserProfileDto,
    cursor: number,
    limit: number,
  ): { changes: SyncPullChangeDto[]; nextCursor: number; hasMore: boolean } {
    const eligible = this.changeLedger.filter((entry) => {
      if (entry.changeSeq <= cursor) return false;
      if (user.role === 'admin') return true;
      if (user.role === 'oic') {
        const inSection =
          entry.targetSectionIds?.some((sec) => user.sectionIds.includes(sec)) ?? false;
        const ownUser = entry.targetUserIds?.includes(user.id) ?? false;
        return inSection || ownUser;
      }
      // student
      return entry.targetUserIds?.includes(user.id) ?? false;
    });

    const page = eligible.slice(0, limit);
    const hasMore = eligible.length > limit;
    const nextCursor = page.length > 0 ? page[page.length - 1].changeSeq : cursor;

    const changes: SyncPullChangeDto[] = page.map(
      ({ targetUserIds: _u, targetSectionIds: _s, ...dto }) => dto,
    );
    return { changes, nextCursor, hasMore };
  }

  hasDuplicateQrNonce(studentId: string, qrNonce: string): boolean {
    return this.attendance.some((a) => a.studentId === studentId && a.qrNonce === qrNonce);
  }

  getSectionName(sectionId: string): string {
    if (sectionId === 'sec-periodicals') return 'Periodicals & Serials';
    if (sectionId === 'sec-reserve') return 'Reserve & Thesis Section';
    if (sectionId === 'sec-circulation') return 'Circulation & Baggage Desk';
    return 'Library Section';
  }

  canManageRole(_role: UserRole): boolean {
    return true;
  }
}
