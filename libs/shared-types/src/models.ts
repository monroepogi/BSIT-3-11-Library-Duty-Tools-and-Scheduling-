import type { ApiErrorCode } from './errors';

export type UserRole = 'student' | 'oic' | 'admin';

export type EndpointGroup =
  | 'health'
  | 'identity'
  | 'roster'
  | 'tasks'
  | 'requests'
  | 'visitors'
  | 'admin'
  | 'audit';

export interface EnvironmentConfig {
  production: boolean;
  clientId: 'mobile' | 'admin';
  apiBaseUrl: string;
  requestTimeoutMs: number;
  libraryTimezone: string;
  useMockApi: boolean;
  mockEndpoints: Record<EndpointGroup, boolean>;
  enableDevPanel: boolean;
}

export interface PaginatedDto<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface HealthStatusDto {
  status: 'ok';
  serverTime: string;
}

export interface UserProfileDto {
  id: string;
  universityId: string;
  email: string;
  fullName: string;
  role: UserRole;
  department: string;
  active: boolean;
  sectionIds: string[];
  sectionNames: string[];
}

export interface LoginRequestDto {
  email: string;
  password: string;
  deviceId?: string;
  deviceName?: string;
}

export interface RefreshRequestDto {
  refreshToken: string;
  deviceId?: string;
}

export interface LogoutRequestDto {
  refreshToken?: string;
}

export interface AuthTokensResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
  user: UserProfileDto;
}

export interface TrustPublicKeyDto {
  kid: string;
  alg: 'Ed25519';
  publicKey: string;
  status: 'active' | 'verify_only';
  validFrom: string;
  validUntil: string | null;
}

export interface DutyCertificateDto {
  id: string;
  oicId: string;
  oicName: string;
  sectionId: string;
  sectionName: string;
  shiftId: string;
  oicDevicePubkey: string;
  validFrom: string;
  validTo: string;
  kid: string;
  signature: string;
}

export interface IssueDutyCertRequestDto {
  shiftId: string;
  sectionId: string;
  deviceId: string;
  oicDevicePubkey: string;
}

export interface RotatingQrPayloadDto {
  version: 1;
  cert: DutyCertificateDto;
  ts: number;
  nonce: string;
  sig: string;
}

export type ShiftStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'missed'
  | 'excused'
  | 'swapped'
  | 'cancelled';

export interface AttendanceSummaryDto {
  checkInAt: string | null;
  checkOutAt: string | null;
  verificationStatus: 'none' | 'verified' | 'flagged' | 'pending_sync';
}

export interface ShiftDto {
  id: string;
  semesterId: string;
  sectionId: string;
  sectionCode: string;
  sectionName: string;
  location: string;
  userId: string;
  userFullName: string;
  oicName: string;
  shiftDate: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  roleInShift: 'student' | 'oic';
  status: ShiftStatus;
  attendance: AttendanceSummaryDto;
  signedOffBy: string | null;
  signedOffAt: string | null;
  signoffRemarks: string | null;
  version: number;
}

export interface HoursSummaryDto {
  semesterId: string;
  semesterName: string;
  renderedMinutes: number;
  weeklyRenderedMinutes: number;
  approvedLeaveMinutes: number;
  pendingMinutes: number;
  semesterCapMinutes: number;
  weeklyCapMinutes: number;
}

export interface RosterShiftWithAttendanceDto extends ShiftDto {
  universityId: string;
  tasksCompleted: number;
  tasksTotal: number;
}

export interface SectionRosterDto {
  date: string;
  sectionId: string;
  sectionName: string;
  shifts: RosterShiftWithAttendanceDto[];
}

export type TaskCategory = 'shelving' | 'circulation' | 'inventory' | 'desk_support';
export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface TaskDto {
  id: string;
  shiftId: string;
  sectionId: string;
  sectionName: string;
  category: TaskCategory;
  assignedToUserId: string | null;
  assignedToName: string | null;
  createdByUserId: string;
  createdByName: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  completedAt: string | null;
  version: number;
}

export interface CreateTaskDto {
  id?: string;
  shiftId: string;
  category: TaskCategory;
  assignedToUserId?: string;
  title: string;
  description?: string;
}

export interface UpdateTaskStatusDto {
  status: TaskStatus;
  note?: string;
}

export interface SignoffShiftDto {
  remarks?: string;
}

export type RequestKind = 'swap' | 'leave';
export type RequestStatus =
  | 'draft'
  | 'pending_endorsement'
  | 'endorsed'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type LeaveType = 'sick' | 'academic' | 'emergency' | 'official';

export interface RequestEventDto {
  id: string;
  actorName: string;
  actorRole: UserRole;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  remarks: string | null;
  createdAt: string;
}

export interface AttachmentMetaDto {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface SwapRequestDto {
  id: string;
  kind: 'swap';
  semesterId: string;
  sectionId: string;
  sectionName: string;
  requesterUserId: string;
  requesterName: string;
  requesterShiftId: string;
  requesterShiftLabel: string;
  targetUserId: string;
  targetUserName: string;
  targetShiftId: string | null;
  targetShiftLabel: string | null;
  reason: string;
  status: RequestStatus;
  endorsedBy: string | null;
  endorsedAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionRemarks: string | null;
  createdAt: string;
  events: RequestEventDto[];
  version: number;
}

export interface LeaveRequestDto {
  id: string;
  kind: 'leave';
  semesterId: string;
  sectionId: string;
  sectionName: string;
  requesterUserId: string;
  requesterName: string;
  shiftId: string;
  shiftLabel: string;
  leaveType: LeaveType;
  reason: string;
  attachments: AttachmentMetaDto[];
  status: RequestStatus;
  endorsedBy: string | null;
  endorsedAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionRemarks: string | null;
  createdAt: string;
  events: RequestEventDto[];
  version: number;
}

export interface CreateSwapRequestDto {
  id?: string;
  requesterShiftId: string;
  targetUserId: string;
  targetShiftId?: string;
  reason: string;
  submitNow: boolean;
}

export interface CreateLeaveRequestDto {
  id?: string;
  shiftId: string;
  leaveType: LeaveType;
  reason: string;
  attachments?: AttachmentMetaDto[];
  submitNow: boolean;
}

export interface CancelRequestDto {
  requestKind: RequestKind;
  reason?: string;
}

export interface EndorseRequestDto {
  requestKind: RequestKind;
  action: 'endorse' | 'reject';
  remarks?: string;
}

export type VisitorAffiliation =
  | 'university_student'
  | 'faculty_staff'
  | 'alumni'
  | 'external_guest';

export interface SoftDeleteAuditMeta {
  deletedAt: string | null;
  deletedByUserId: string | null;
  deletedByName: string | null;
  deleteReason: string | null;
}

export interface VisitorLogDto extends SoftDeleteAuditMeta {
  id: string;
  sectionId: string;
  sectionName: string;
  recordedByUserId: string;
  recordedByName: string;
  visitorName: string;
  visitorIdNumber: string | null;
  affiliation: VisitorAffiliation;
  collegeOrOrg: string | null;
  purpose: string;
  logDate: string;
  checkedInAt: string;
  checkedOutAt: string | null;
  notes: string | null;
  version: number;
}

export interface CreateVisitorLogDto {
  id?: string;
  sectionId: string;
  visitorName: string;
  visitorIdNumber?: string;
  affiliation: VisitorAffiliation;
  collegeOrOrg?: string;
  purpose: string;
  notes?: string;
}

export interface CheckoutVisitorDto {
  checkedOutAt?: string;
  notes?: string;
}

export type BaggageStatus = 'deposited' | 'returned' | 'unclaimed_flagged';

export interface BaggageRecordDto extends SoftDeleteAuditMeta {
  id: string;
  sectionId: string;
  sectionName: string;
  visitorLogId: string | null;
  ownerName: string;
  ownerIdNumber: string;
  lockerOrClaimTag: string;
  itemDescription: string | null;
  status: BaggageStatus;
  logDate: string;
  depositedAt: string;
  receivedByName: string;
  returnedAt: string | null;
  notes: string | null;
  version: number;
}

export interface CreateBaggageDto {
  id?: string;
  sectionId: string;
  ownerName: string;
  ownerIdNumber: string;
  lockerOrClaimTag: string;
  itemDescription?: string;
  notes?: string;
}

export interface ReturnBaggageDto {
  returnedAt?: string;
  notes?: string;
}

export type PaperType =
  | 'thesis'
  | 'dissertation'
  | 'capstone'
  | 'journal_issue'
  | 'archival_paper'
  | 'other';

export type PaperLoanStatus = 'borrowed' | 'returned' | 'overdue_in_room';

export interface PaperLoanDto extends SoftDeleteAuditMeta {
  id: string;
  sectionId: string;
  sectionName: string;
  paperCode: string;
  paperTitle: string;
  paperAuthors: string | null;
  paperType: PaperType;
  borrowerName: string;
  borrowerIdNumber: string;
  borrowerDepartment: string | null;
  collateralIdType: string | null;
  status: PaperLoanStatus;
  logDate: string;
  borrowedAt: string;
  issuedByName: string;
  returnedAt: string | null;
  returnConditionNotes: string | null;
  version: number;
}

export interface CreatePaperLoanDto {
  id?: string;
  sectionId: string;
  paperCode: string;
  paperTitle: string;
  paperAuthors?: string;
  paperType: PaperType;
  borrowerName: string;
  borrowerIdNumber: string;
  borrowerDepartment?: string;
  collateralIdType?: string;
}

export interface ReturnPaperLoanDto {
  returnedAt?: string;
  returnConditionNotes?: string;
}

export interface SoftDeleteEntryDto {
  reason: string;
}

export interface VisitorLogSummaryDto {
  date: string;
  sectionId: string;
  visitorsTotal: number;
  visitorsCurrentlyInside: number;
  baggageDepositedActive: number;
  baggageReturned: number;
  papersBorrowedActive: number;
  papersReturned: number;
}

export type SyncOpType =
  | 'attendance.scan'
  | 'task.create'
  | 'task.update_status'
  | 'shift.signoff'
  | 'swap_request.submit'
  | 'leave_request.submit'
  | 'request.cancel'
  | 'request.endorse'
  | 'visitor.checkin'
  | 'visitor.checkout'
  | 'visitor.update'
  | 'visitor.remove'
  | 'baggage.deposit'
  | 'baggage.return'
  | 'baggage.update'
  | 'baggage.remove'
  | 'paper_loan.borrow'
  | 'paper_loan.return'
  | 'paper_loan.update'
  | 'paper_loan.remove';

export type OutboxStatus = 'pending' | 'sending' | 'failed' | 'done';

export interface OutboxEntry {
  opId: string;
  entityType: 'shift' | 'task' | 'request' | 'visitor' | 'baggage' | 'paper_loan';
  entityId: string;
  type: SyncOpType;
  label: string;
  payload: Record<string, unknown>;
  createdWallTs: string;
  createdMonoMs: number;
  bootId: string;
  status: OutboxStatus;
  permanentFailure: boolean;
  attempts: number;
  lastError: string | null;
}

export interface SyncMeta {
  pendingSync: boolean;
  syncFailed: boolean;
  syncError: string | null;
  outboxOpId: string | null;
}

export type WithSyncMeta<T> = T & {
  syncMeta: SyncMeta;
};

export interface SyncPushOpDto {
  opId: string;
  type: SyncOpType;
  entityId: string;
  payload: Record<string, unknown>;
  createdWallTs: string;
  createdMonoMs: number;
  bootId: string;
}

export interface SyncPushRequestDto {
  batchId: string;
  deviceId: string;
  clientSentWallTs: string;
  clientSentMonoMs: number;
  bootId: string;
  ops: SyncPushOpDto[];
}

export interface SyncOpResultDto {
  opId: string;
  status: 'applied' | 'duplicate' | 'rejected';
  code?: ApiErrorCode;
  reason?: string;
}

export interface SyncPushResponseDto {
  batchId: string;
  serverTime: string;
  results: SyncOpResultDto[];
}

export function getLibraryDateString(
  date: Date = new Date(),
  timeZone = 'Asia/Manila',
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}
