import { HttpErrorResponse, HttpRequest, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import {
  type ApiErrorCode,
  type ApiErrorEnvelope,
  type AuthTokensResponseDto,
  type BaggageRecordDto,
  type CancelRequestDto,
  type CheckoutVisitorDto,
  type CreateBaggageDto,
  type CreateLeaveRequestDto,
  type CreatePaperLoanDto,
  type CreateSwapRequestDto,
  type CreateTaskDto,
  type CreateVisitorLogDto,
  type EndorseRequestDto,
  getLibraryDateString,
  type LeaveRequestDto,
  type LoginRequestDto,
  type PaperLoanDto,
  type RefreshRequestDto,
  type ReturnBaggageDto,
  type ReturnPaperLoanDto,
  type SoftDeleteEntryDto,
  type SwapRequestDto,
  type SyncOpResultDto,
  type SyncPushRequestDto,
  type SyncPushResponseDto,
  type TaskDto,
  type UpdateTaskStatusDto,
  type UserProfileDto,
  type VisitorLogDto,
  type VisitorLogSummaryDto,
} from '@vits/shared-types';
import { createInitialMockDataset, type MockDataset } from '@vits/shared-types/fixtures';

interface MockSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
  usedRefreshTokens: Set<string>;
  revoked: boolean;
}

@Injectable({ providedIn: 'root' })
export class MockApiStore {
  private data: MockDataset = createInitialMockDataset();
  private sessions = new Map<string, MockSession>();
  private processedOpIds = new Set<string>();
  private tokenSeq = 1;

  resetDataset(): void {
    this.data = createInitialMockDataset();
    this.processedOpIds.clear();
  }

  dispatch(req: HttpRequest<unknown>, rejectSyncOp = false): HttpResponse<unknown> {
    const correlationId = req.headers.get('X-Correlation-Id') ?? 'mock-corr-id';
    const clientId = req.headers.get('X-Client-Id') ?? 'mobile';
    const url = new URL(req.urlWithParams, 'http://localhost');
    const path = url.pathname.replace(/^.*\/v1/, '') || '/';
    const method = req.method.toUpperCase();

    if (method === 'GET' && path === '/health') {
      return this.ok({ status: 'ok', serverTime: new Date().toISOString() });
    }

    if (method === 'POST' && path === '/auth/login') {
      return this.handleLogin(req.body as LoginRequestDto, clientId, correlationId);
    }

    if (method === 'POST' && path === '/auth/refresh') {
      return this.handleRefresh(req.body as RefreshRequestDto, correlationId);
    }

    if (method === 'POST' && path === '/auth/logout') {
      const user = this.resolveAuthUser(req, correlationId, false);
      if (user) {
        for (const sess of this.sessions.values()) {
          if (sess.userId === user.id) sess.revoked = true;
        }
      }
      return this.ok({ revoked: true });
    }

    // Authenticated endpoints below
    const user = this.resolveAuthUser(req, correlationId, true);
    if (!user) {
      throw this.fail(401, 'AUTH_TOKEN_EXPIRED', 'Access token is missing or expired.', correlationId);
    }

    if (method === 'GET' && path === '/auth/me') {
      return this.ok(user);
    }

    if (method === 'GET' && path === '/trust/keys') {
      return this.ok({ keys: this.data.trustKeys });
    }

    if (method === 'POST' && path === '/sync/push') {
      return this.handleSyncPush(req.body as SyncPushRequestDto, user, rejectSyncOp);
    }

    if (method === 'GET' && path === '/me/shifts') {
      const own = this.data.shifts.filter((s) => s.userId === user.id);
      return this.ok({ shifts: own });
    }

    if (method === 'GET' && path === '/me/hours-summary') {
      const summary = this.data.hoursByUserId[user.id] ?? {
        semesterId: 'sem-2026-1',
        semesterName: '1st Semester AY 2026–2027',
        renderedMinutes: 0,
        weeklyRenderedMinutes: 0,
        approvedLeaveMinutes: 0,
        pendingMinutes: 0,
        semesterCapMinutes: 3600,
        weeklyCapMinutes: 600,
      };
      return this.ok(summary);
    }

    if (method === 'GET' && path === '/oic/section-roster') {
      if (user.role !== 'oic' && user.role !== 'admin') {
        throw this.fail(403, 'AUTH_INSUFFICIENT_ROLE', 'OIC role required for section roster.', correlationId);
      }
      const date = url.searchParams.get('date') ?? getLibraryDateString();
      const sectionId = url.searchParams.get('section_id') ?? user.sectionIds[0] ?? 'sec-reserve';
      const shifts = this.data.shifts
        .filter((s) => s.shiftDate === date && s.sectionId === sectionId)
        .map((s) => {
          const shiftTasks = this.data.tasks.filter((t) => t.shiftId === s.id);
          return {
            ...s,
            universityId: '2024-10482',
            tasksCompleted: shiftTasks.filter((t) => t.status === 'done').length,
            tasksTotal: shiftTasks.length,
          };
        });
      return this.ok({ date, sectionId, sectionName: 'Reserve & Thesis Section', shifts });
    }

    if (method === 'GET' && path === '/tasks') {
      const shiftId = url.searchParams.get('shift_id');
      const tasks = shiftId
        ? this.data.tasks.filter((t) => t.shiftId === shiftId)
        : this.data.tasks.filter((t) => t.assignedToUserId === user.id || user.role === 'oic');
      return this.ok({ tasks });
    }

    if (method === 'POST' && path === '/tasks') {
      if (user.role !== 'oic') {
        throw this.fail(403, 'AUTH_INSUFFICIENT_ROLE', 'Only OICs may create shift tasks.', correlationId);
      }
      const dto = req.body as CreateTaskDto;
      const created: TaskDto = {
        id: dto.id ?? `tsk-${Date.now()}`,
        shiftId: dto.shiftId,
        sectionId: 'sec-reserve',
        sectionName: 'Reserve & Thesis Section',
        category: dto.category,
        assignedToUserId: dto.assignedToUserId ?? null,
        assignedToName: dto.assignedToUserId ? 'Maria Santos' : null,
        createdByUserId: user.id,
        createdByName: user.fullName,
        title: dto.title,
        description: dto.description ?? null,
        status: 'todo',
        completedAt: null,
        version: 1,
      };
      this.data.tasks.unshift(created);
      return this.ok(created, 201);
    }

    const taskStatusMatch = path.match(/^\/tasks\/([^/]+)\/status$/);
    if (method === 'PATCH' && taskStatusMatch) {
      const task = this.data.tasks.find((t) => t.id === taskStatusMatch[1]);
      if (!task) throw this.fail(404, 'RESOURCE_NOT_FOUND', 'Task not found.', correlationId);
      const dto = req.body as UpdateTaskStatusDto;
      task.status = dto.status;
      task.completedAt = dto.status === 'done' ? new Date().toISOString() : null;
      task.version += 1;
      return this.ok(task);
    }

    if (method === 'GET' && path === '/requests/mine') {
      const swapRequests = this.data.swapRequests.filter(
        (r) => r.requesterUserId === user.id || r.targetUserId === user.id || user.role === 'oic',
      );
      const leaveRequests = this.data.leaveRequests.filter(
        (r) => r.requesterUserId === user.id || user.role === 'oic',
      );
      return this.ok({ swapRequests, leaveRequests });
    }

    if (method === 'POST' && path === '/swap-requests') {
      const dto = req.body as CreateSwapRequestDto;
      const shift = this.data.shifts.find((s) => s.id === dto.requesterShiftId);
      const targetAcct = this.data.accounts.find((a) => a.profile.id === dto.targetUserId)?.profile;
      const status = dto.submitNow ? 'pending_endorsement' : 'draft';
      const created: SwapRequestDto = {
        id: dto.id ?? `req-swap-${Date.now()}`,
        kind: 'swap',
        semesterId: 'sem-2026-1',
        sectionId: shift?.sectionId ?? 'sec-periodicals',
        sectionName: shift?.sectionName ?? 'Periodicals & Serials',
        requesterUserId: user.id,
        requesterName: user.fullName,
        requesterShiftId: dto.requesterShiftId,
        requesterShiftLabel: shift ? `${shift.shiftDate} • ${shift.sectionName}` : dto.requesterShiftId,
        targetUserId: dto.targetUserId,
        targetUserName: targetAcct?.fullName ?? 'Liam Villanueva',
        targetShiftId: dto.targetShiftId ?? null,
        targetShiftLabel: null,
        reason: dto.reason,
        status,
        endorsedBy: null,
        endorsedAt: null,
        decidedBy: null,
        decidedAt: null,
        decisionRemarks: null,
        createdAt: new Date().toISOString(),
        events: [
          {
            id: `evt-${Date.now()}`,
            actorName: user.fullName,
            actorRole: user.role,
            fromStatus: null,
            toStatus: status,
            remarks: dto.submitNow ? 'Submitted swap request.' : 'Saved swap draft.',
            createdAt: new Date().toISOString(),
          },
        ],
        version: 1,
      };
      this.data.swapRequests.unshift(created);
      return this.ok(created, 201);
    }

    if (method === 'POST' && path === '/leave-requests') {
      const dto = req.body as CreateLeaveRequestDto;
      const shift = this.data.shifts.find((s) => s.id === dto.shiftId);
      const status = dto.submitNow ? 'pending_endorsement' : 'draft';
      const created: LeaveRequestDto = {
        id: dto.id ?? `req-leave-${Date.now()}`,
        kind: 'leave',
        semesterId: 'sem-2026-1',
        sectionId: shift?.sectionId ?? 'sec-reserve',
        sectionName: shift?.sectionName ?? 'Reserve & Thesis Section',
        requesterUserId: user.id,
        requesterName: user.fullName,
        shiftId: dto.shiftId,
        shiftLabel: shift ? `${shift.shiftDate} • ${shift.sectionName}` : dto.shiftId,
        leaveType: dto.leaveType,
        reason: dto.reason,
        attachments: dto.attachments ?? [],
        status,
        endorsedBy: null,
        endorsedAt: null,
        decidedBy: null,
        decidedAt: null,
        decisionRemarks: null,
        createdAt: new Date().toISOString(),
        events: [
          {
            id: `evt-${Date.now()}`,
            actorName: user.fullName,
            actorRole: user.role,
            fromStatus: null,
            toStatus: status,
            remarks: dto.submitNow ? 'Submitted leave request.' : 'Saved leave draft.',
            createdAt: new Date().toISOString(),
          },
        ],
        version: 1,
      };
      this.data.leaveRequests.unshift(created);
      return this.ok(created, 201);
    }

    const cancelReqMatch = path.match(/^\/requests\/([^/]+)\/cancel$/);
    if (method === 'PATCH' && cancelReqMatch) {
      const dto = req.body as CancelRequestDto;
      const target =
        dto.requestKind === 'swap'
          ? this.data.swapRequests.find((r) => r.id === cancelReqMatch[1])
          : this.data.leaveRequests.find((r) => r.id === cancelReqMatch[1]);
      if (!target) throw this.fail(404, 'RESOURCE_NOT_FOUND', 'Request not found.', correlationId);
      if (target.status === 'approved' || target.status === 'rejected') {
        throw this.fail(
          409,
          'CONFLICT_STATE_TRANSITION',
          'Decided requests cannot be cancelled.',
          correlationId,
        );
      }
      const prev = target.status;
      target.status = 'cancelled';
      target.version += 1;
      target.events.push({
        id: `evt-${Date.now()}`,
        actorName: user.fullName,
        actorRole: user.role,
        fromStatus: prev,
        toStatus: 'cancelled',
        remarks: dto.reason ?? 'Cancelled by requester.',
        createdAt: new Date().toISOString(),
      });
      return this.ok(target);
    }

    const endorseReqMatch = path.match(/^\/requests\/([^/]+)\/endorse$/);
    if (method === 'PATCH' && endorseReqMatch) {
      if (user.role !== 'oic') {
        throw this.fail(403, 'AUTH_INSUFFICIENT_ROLE', 'Only OICs may endorse requests.', correlationId);
      }
      const dto = req.body as EndorseRequestDto;
      const target =
        dto.requestKind === 'swap'
          ? this.data.swapRequests.find((r) => r.id === endorseReqMatch[1])
          : this.data.leaveRequests.find((r) => r.id === endorseReqMatch[1]);
      if (!target) throw this.fail(404, 'RESOURCE_NOT_FOUND', 'Request not found.', correlationId);
      if (target.requesterUserId === user.id) {
        throw this.fail(403, 'SELF_ACTION_FORBIDDEN', 'An OIC cannot endorse their own request.', correlationId);
      }
      const nextStatus = dto.action === 'endorse' ? 'endorsed' : 'rejected';
      const prev = target.status;
      target.status = nextStatus;
      target.endorsedBy = user.fullName;
      target.endorsedAt = new Date().toISOString();
      target.version += 1;
      target.events.push({
        id: `evt-${Date.now()}`,
        actorName: user.fullName,
        actorRole: 'oic',
        fromStatus: prev,
        toStatus: nextStatus,
        remarks: dto.remarks ?? null,
        createdAt: new Date().toISOString(),
      });
      return this.ok(target);
    }

    // Module 5: Visitor's Log (enforces D-003 Student vs OIC/Admin history & soft-delete rules)
    if (path.startsWith('/visitors') || path.startsWith('/baggage') || path.startsWith('/papers-borrowed') || path === '/visitor-log/summary') {
      return this.handleVisitorLogRoutes(method, path, url, req.body, user, correlationId);
    }

    throw this.fail(404, 'RESOURCE_NOT_FOUND', `Unhandled mock route: ${method} ${path}`, correlationId);
  }

  private handleLogin(
    dto: LoginRequestDto,
    clientId: string,
    correlationId: string,
  ): HttpResponse<AuthTokensResponseDto> {
    const match = this.data.accounts.find(
      (a) => a.profile.email.toLowerCase() === dto?.email?.trim().toLowerCase() && a.password === dto?.password,
    );
    if (!match) {
      throw this.fail(401, 'AUTH_INVALID_CREDENTIALS', 'Invalid email or password.', correlationId);
    }
    if (!match.profile.active) {
      throw this.fail(403, 'AUTH_ACCOUNT_INACTIVE', 'Account has been deactivated.', correlationId);
    }
    if (clientId === 'mobile' && match.profile.role === 'admin') {
      throw this.fail(
        403,
        'AUTH_FORBIDDEN_CLIENT',
        'Administrator accounts can only sign in from the Admin web portal.',
        correlationId,
      );
    }
    if (clientId === 'admin' && match.profile.role !== 'admin') {
      throw this.fail(
        403,
        'AUTH_FORBIDDEN_CLIENT',
        'Student and OIC accounts must use the VITS mobile app.',
        correlationId,
      );
    }

    const access = `mock-at-${match.profile.id}-${this.tokenSeq++}`;
    const refresh = `mock-rt-${match.profile.id}-${this.tokenSeq++}`;
    const familyId = `fam-${this.tokenSeq}`;
    this.sessions.set(familyId, {
      userId: match.profile.id,
      accessToken: access,
      refreshToken: refresh,
      usedRefreshTokens: new Set(),
      revoked: false,
    });

    return this.ok({
      accessToken: access,
      refreshToken: refresh,
      expiresInSec: 900,
      user: match.profile,
    });
  }

  private handleRefresh(
    dto: RefreshRequestDto,
    correlationId: string,
  ): HttpResponse<AuthTokensResponseDto> {
    for (const sess of this.sessions.values()) {
      if (sess.usedRefreshTokens.has(dto?.refreshToken)) {
        sess.revoked = true;
        throw this.fail(
          401,
          'AUTH_REFRESH_REUSED',
          'Refresh token reuse detected; session family revoked.',
          correlationId,
        );
      }
      if (sess.refreshToken === dto?.refreshToken) {
        if (sess.revoked) {
          throw this.fail(401, 'AUTH_REFRESH_REVOKED', 'Session has been revoked.', correlationId);
        }
        const user = this.data.accounts.find((a) => a.profile.id === sess.userId)?.profile;
        if (!user) {
          throw this.fail(401, 'AUTH_REFRESH_EXPIRED', 'User not found.', correlationId);
        }
        sess.usedRefreshTokens.add(sess.refreshToken);
        sess.accessToken = `mock-at-${user.id}-${this.tokenSeq++}`;
        sess.refreshToken = `mock-rt-${user.id}-${this.tokenSeq++}`;
        return this.ok({
          accessToken: sess.accessToken,
          refreshToken: sess.refreshToken,
          expiresInSec: 900,
          user,
        });
      }
    }
    throw this.fail(401, 'AUTH_REFRESH_EXPIRED', 'Refresh token is invalid or expired.', correlationId);
  }

  private handleSyncPush(
    dto: SyncPushRequestDto,
    user: UserProfileDto,
    rejectSyncOp: boolean,
  ): HttpResponse<SyncPushResponseDto> {
    const oicOnlyOps = new Set([
      'task.create',
      'shift.signoff',
      'request.endorse',
      'visitor.update',
      'visitor.remove',
      'baggage.update',
      'baggage.remove',
      'paper_loan.update',
      'paper_loan.remove',
    ]);

    const results: SyncOpResultDto[] = dto.ops.map((op) => {
      if (this.processedOpIds.has(op.opId)) {
        return { opId: op.opId, status: 'duplicate' };
      }
      if (oicOnlyOps.has(op.type) && user.role === 'student') {
        return {
          opId: op.opId,
          status: 'rejected',
          code: 'AUTH_INSUFFICIENT_ROLE',
          reason: 'Students cannot modify or delete historical desk records or perform OIC actions.',
        };
      }
      if (rejectSyncOp) {
        return {
          opId: op.opId,
          status: 'rejected',
          code: 'CONFLICT_STATE_TRANSITION',
          reason: 'Simulated server rejection: shift already signed off by OIC.',
        };
      }
      this.processedOpIds.add(op.opId);
      this.applySyncOpToStore(op.type, op.entityId, op.payload, user);
      return { opId: op.opId, status: 'applied' };
    });

    return this.ok({
      batchId: dto.batchId,
      serverTime: new Date().toISOString(),
      results,
    });
  }

  private applySyncOpToStore(
    type: string,
    entityId: string,
    payload: Record<string, unknown>,
    user: UserProfileDto,
  ): void {
    const nowIso = new Date().toISOString();
    const today = getLibraryDateString();

    if (type === 'attendance.scan') {
      const shift = this.data.shifts.find((s) => s.id === entityId);
      if (shift) {
        if (!shift.attendance.checkInAt) {
          shift.attendance.checkInAt = (payload['scannedAt'] as string | undefined) ?? nowIso;
          shift.status = 'in_progress';
        } else {
          shift.attendance.checkOutAt = (payload['scannedAt'] as string | undefined) ?? nowIso;
          shift.status = 'completed';
        }
        shift.attendance.verificationStatus = 'verified';
        shift.version += 1;
      }
      return;
    }

    if (type === 'task.update_status') {
      const task = this.data.tasks.find((t) => t.id === entityId);
      if (task && typeof payload['status'] === 'string') {
        task.status = payload['status'] as TaskDto['status'];
        task.completedAt = task.status === 'done' ? nowIso : null;
        task.version += 1;
      }
      return;
    }

    if (type === 'swap_request.submit' && !this.data.swapRequests.some((r) => r.id === entityId)) {
      const dto = payload as unknown as CreateSwapRequestDto;
      const shift = this.data.shifts.find((s) => s.id === dto.requesterShiftId);
      const targetAcct = this.data.accounts.find((a) => a.profile.id === dto.targetUserId)?.profile;
      const status = dto.submitNow ? 'pending_endorsement' : 'draft';
      this.data.swapRequests.unshift({
        id: entityId,
        kind: 'swap',
        semesterId: 'sem-2026-1',
        sectionId: shift?.sectionId ?? 'sec-periodicals',
        sectionName: shift?.sectionName ?? 'Periodicals & Serials',
        requesterUserId: user.id,
        requesterName: user.fullName,
        requesterShiftId: dto.requesterShiftId,
        requesterShiftLabel: shift ? `${shift.shiftDate} • ${shift.sectionName}` : dto.requesterShiftId,
        targetUserId: dto.targetUserId,
        targetUserName: targetAcct?.fullName ?? 'Liam Villanueva',
        targetShiftId: dto.targetShiftId ?? null,
        targetShiftLabel: null,
        reason: dto.reason,
        status,
        endorsedBy: null,
        endorsedAt: null,
        decidedBy: null,
        decidedAt: null,
        decisionRemarks: null,
        createdAt: nowIso,
        events: [
          {
            id: `evt-${Date.now()}`,
            actorName: user.fullName,
            actorRole: user.role,
            fromStatus: null,
            toStatus: status,
            remarks: 'Synced from mobile outbox.',
            createdAt: nowIso,
          },
        ],
        version: 1,
      });
      return;
    }

    if (type === 'leave_request.submit' && !this.data.leaveRequests.some((r) => r.id === entityId)) {
      const dto = payload as unknown as CreateLeaveRequestDto;
      const shift = this.data.shifts.find((s) => s.id === dto.shiftId);
      const status = dto.submitNow ? 'pending_endorsement' : 'draft';
      this.data.leaveRequests.unshift({
        id: entityId,
        kind: 'leave',
        semesterId: 'sem-2026-1',
        sectionId: shift?.sectionId ?? 'sec-reserve',
        sectionName: shift?.sectionName ?? 'Reserve & Thesis Section',
        requesterUserId: user.id,
        requesterName: user.fullName,
        shiftId: dto.shiftId,
        shiftLabel: shift ? `${shift.shiftDate} • ${shift.sectionName}` : dto.shiftId,
        leaveType: dto.leaveType,
        reason: dto.reason,
        attachments: dto.attachments ?? [],
        status,
        endorsedBy: null,
        endorsedAt: null,
        decidedBy: null,
        decidedAt: null,
        decisionRemarks: null,
        createdAt: nowIso,
        events: [
          {
            id: `evt-${Date.now()}`,
            actorName: user.fullName,
            actorRole: user.role,
            fromStatus: null,
            toStatus: status,
            remarks: 'Synced from mobile outbox.',
            createdAt: nowIso,
          },
        ],
        version: 1,
      });
      return;
    }

    if (type === 'request.cancel') {
      const kind = payload['requestKind'] as 'swap' | 'leave';
      const target =
        kind === 'swap'
          ? this.data.swapRequests.find((r) => r.id === entityId)
          : this.data.leaveRequests.find((r) => r.id === entityId);
      if (target && target.status !== 'approved' && target.status !== 'rejected') {
        const prev = target.status;
        target.status = 'cancelled';
        target.version += 1;
        target.events.push({
          id: `evt-${Date.now()}`,
          actorName: user.fullName,
          actorRole: user.role,
          fromStatus: prev,
          toStatus: 'cancelled',
          remarks: 'Cancelled by requester.',
          createdAt: nowIso,
        });
      }
      return;
    }

    if (type === 'visitor.checkin' && !this.data.visitors.some((v) => v.id === entityId)) {
      const dto = payload as unknown as CreateVisitorLogDto;
      this.data.visitors.unshift({
        id: entityId,
        sectionId: dto.sectionId,
        sectionName: 'Reserve & Thesis Section',
        recordedByUserId: user.id,
        recordedByName: user.fullName,
        visitorName: dto.visitorName,
        visitorIdNumber: dto.visitorIdNumber ?? null,
        affiliation: dto.affiliation,
        collegeOrOrg: dto.collegeOrOrg ?? null,
        purpose: dto.purpose,
        logDate: today,
        checkedInAt: nowIso,
        checkedOutAt: null,
        notes: dto.notes ?? null,
        deletedAt: null,
        deletedByUserId: null,
        deletedByName: null,
        deleteReason: null,
        version: 1,
      });
      return;
    }

    if (type === 'visitor.checkout') {
      const vis = this.data.visitors.find((v) => v.id === entityId);
      if (vis) {
        vis.checkedOutAt = (payload['checkedOutAt'] as string | undefined) ?? nowIso;
        vis.version += 1;
      }
      return;
    }

    if (type === 'baggage.deposit' && !this.data.baggage.some((b) => b.id === entityId)) {
      const dto = payload as unknown as CreateBaggageDto;
      this.data.baggage.unshift({
        id: entityId,
        sectionId: dto.sectionId,
        sectionName: 'Reserve & Thesis Section',
        visitorLogId: null,
        ownerName: dto.ownerName,
        ownerIdNumber: dto.ownerIdNumber,
        lockerOrClaimTag: dto.lockerOrClaimTag,
        itemDescription: dto.itemDescription ?? null,
        status: 'deposited',
        logDate: today,
        depositedAt: nowIso,
        receivedByName: user.fullName,
        returnedAt: null,
        notes: dto.notes ?? null,
        deletedAt: null,
        deletedByUserId: null,
        deletedByName: null,
        deleteReason: null,
        version: 1,
      });
      return;
    }

    if (type === 'baggage.return') {
      const bag = this.data.baggage.find((b) => b.id === entityId);
      if (bag) {
        bag.status = 'returned';
        bag.returnedAt = (payload['returnedAt'] as string | undefined) ?? nowIso;
        bag.version += 1;
      }
      return;
    }

    if (type === 'paper_loan.borrow' && !this.data.papers.some((p) => p.id === entityId)) {
      const dto = payload as unknown as CreatePaperLoanDto;
      this.data.papers.unshift({
        id: entityId,
        sectionId: dto.sectionId,
        sectionName: 'Reserve & Thesis Section',
        paperCode: dto.paperCode,
        paperTitle: dto.paperTitle,
        paperAuthors: dto.paperAuthors ?? null,
        paperType: dto.paperType,
        borrowerName: dto.borrowerName,
        borrowerIdNumber: dto.borrowerIdNumber,
        borrowerDepartment: dto.borrowerDepartment ?? null,
        collateralIdType: dto.collateralIdType ?? null,
        status: 'borrowed',
        logDate: today,
        borrowedAt: nowIso,
        issuedByName: user.fullName,
        returnedAt: null,
        returnConditionNotes: null,
        deletedAt: null,
        deletedByUserId: null,
        deletedByName: null,
        deleteReason: null,
        version: 1,
      });
      return;
    }

    if (type === 'paper_loan.return') {
      const pap = this.data.papers.find((p) => p.id === entityId);
      if (pap) {
        pap.status = 'returned';
        pap.returnedAt = (payload['returnedAt'] as string | undefined) ?? nowIso;
        if (typeof payload['returnConditionNotes'] === 'string') {
          pap.returnConditionNotes = payload['returnConditionNotes'];
        }
        pap.version += 1;
      }
    }
  }

  private handleVisitorLogRoutes(
    method: string,
    path: string,
    url: URL,
    body: unknown,
    user: UserProfileDto,
    correlationId: string,
  ): HttpResponse<unknown> {
    const today = getLibraryDateString();
    const requestedDate = url.searchParams.get('date') ?? today;
    const includeDeleted = url.searchParams.get('include_deleted') === 'true';

    // Enforce D-003: students cannot query historical dates or view soft-deleted entries
    if (user.role === 'student') {
      if (requestedDate !== today || url.searchParams.has('from_date') || includeDeleted) {
        throw this.fail(
          403,
          'AUTH_INSUFFICIENT_ROLE',
          'Students can only view active current-day desk entries.',
          correlationId,
        );
      }
    }

    if (method === 'GET' && path === '/visitors') {
      const visitors = this.data.visitors.filter((v) => {
        if (user.role === 'student') return v.logDate === today && v.deletedAt === null;
        if (!includeDeleted && v.deletedAt !== null) return false;
        return url.searchParams.has('date') ? v.logDate === requestedDate : true;
      });
      return this.ok({ visitors });
    }

    if (method === 'POST' && path === '/visitors') {
      const dto = body as CreateVisitorLogDto;
      const created: VisitorLogDto = {
        id: dto.id ?? `vis-${Date.now()}`,
        sectionId: dto.sectionId,
        sectionName: 'Reserve & Thesis Section',
        recordedByUserId: user.id,
        recordedByName: user.fullName,
        visitorName: dto.visitorName,
        visitorIdNumber: dto.visitorIdNumber ?? null,
        affiliation: dto.affiliation,
        collegeOrOrg: dto.collegeOrOrg ?? null,
        purpose: dto.purpose,
        logDate: today,
        checkedInAt: new Date().toISOString(),
        checkedOutAt: null,
        notes: dto.notes ?? null,
        deletedAt: null,
        deletedByUserId: null,
        deletedByName: null,
        deleteReason: null,
        version: 1,
      };
      this.data.visitors.unshift(created);
      return this.ok(created, 201);
    }

    const visCheckoutMatch = path.match(/^\/visitors\/([^/]+)\/checkout$/);
    if (method === 'PATCH' && visCheckoutMatch) {
      const item = this.data.visitors.find((v) => v.id === visCheckoutMatch[1]);
      if (!item || (user.role === 'student' && (item.deletedAt !== null || item.logDate !== today))) {
        throw this.fail(404, 'RESOURCE_NOT_FOUND', 'Active visitor entry not found.', correlationId);
      }
      const dto = (body ?? {}) as CheckoutVisitorDto;
      item.checkedOutAt = dto.checkedOutAt ?? new Date().toISOString();
      if (dto.notes) item.notes = dto.notes;
      item.version += 1;
      return this.ok(item);
    }

    const visDeleteMatch = path.match(/^\/visitors\/([^/]+)$/);
    if (method === 'DELETE' && visDeleteMatch) {
      if (user.role === 'student') {
        throw this.fail(403, 'AUTH_INSUFFICIENT_ROLE', 'Students cannot delete visitor history.', correlationId);
      }
      const item = this.data.visitors.find((v) => v.id === visDeleteMatch[1]);
      if (!item) throw this.fail(404, 'RESOURCE_NOT_FOUND', 'Visitor entry not found.', correlationId);
      const dto = (body ?? { reason: 'Removed by OIC/Admin' }) as SoftDeleteEntryDto;
      item.deletedAt = new Date().toISOString();
      item.deletedByUserId = user.id;
      item.deletedByName = user.fullName;
      item.deleteReason = dto.reason;
      item.version += 1;
      return this.ok(item);
    }

    if (method === 'GET' && path === '/baggage') {
      const baggage = this.data.baggage.filter((b) => {
        if (user.role === 'student') return b.logDate === today && b.deletedAt === null;
        if (!includeDeleted && b.deletedAt !== null) return false;
        return url.searchParams.has('date') ? b.logDate === requestedDate : true;
      });
      return this.ok({ baggage });
    }

    if (method === 'POST' && path === '/baggage') {
      const dto = body as CreateBaggageDto;
      const created: BaggageRecordDto = {
        id: dto.id ?? `bag-${Date.now()}`,
        sectionId: dto.sectionId,
        sectionName: 'Reserve & Thesis Section',
        visitorLogId: null,
        ownerName: dto.ownerName,
        ownerIdNumber: dto.ownerIdNumber,
        lockerOrClaimTag: dto.lockerOrClaimTag,
        itemDescription: dto.itemDescription ?? null,
        status: 'deposited',
        logDate: today,
        depositedAt: new Date().toISOString(),
        receivedByName: user.fullName,
        returnedAt: null,
        notes: dto.notes ?? null,
        deletedAt: null,
        deletedByUserId: null,
        deletedByName: null,
        deleteReason: null,
        version: 1,
      };
      this.data.baggage.unshift(created);
      return this.ok(created, 201);
    }

    const bagReturnMatch = path.match(/^\/baggage\/([^/]+)\/return$/);
    if (method === 'PATCH' && bagReturnMatch) {
      const item = this.data.baggage.find((b) => b.id === bagReturnMatch[1]);
      if (!item || (user.role === 'student' && (item.deletedAt !== null || item.logDate !== today))) {
        throw this.fail(404, 'RESOURCE_NOT_FOUND', 'Active baggage record not found.', correlationId);
      }
      const dto = (body ?? {}) as ReturnBaggageDto;
      item.status = 'returned';
      item.returnedAt = dto.returnedAt ?? new Date().toISOString();
      if (dto.notes) item.notes = dto.notes;
      item.version += 1;
      return this.ok(item);
    }

    if (method === 'GET' && path === '/papers-borrowed') {
      const papers = this.data.papers.filter((p) => {
        if (user.role === 'student') return p.logDate === today && p.deletedAt === null;
        if (!includeDeleted && p.deletedAt !== null) return false;
        return url.searchParams.has('date') ? p.logDate === requestedDate : true;
      });
      return this.ok({ papers });
    }

    if (method === 'POST' && path === '/papers-borrowed') {
      const dto = body as CreatePaperLoanDto;
      const created: PaperLoanDto = {
        id: dto.id ?? `pap-${Date.now()}`,
        sectionId: dto.sectionId,
        sectionName: 'Reserve & Thesis Section',
        paperCode: dto.paperCode,
        paperTitle: dto.paperTitle,
        paperAuthors: dto.paperAuthors ?? null,
        paperType: dto.paperType,
        borrowerName: dto.borrowerName,
        borrowerIdNumber: dto.borrowerIdNumber,
        borrowerDepartment: dto.borrowerDepartment ?? null,
        collateralIdType: dto.collateralIdType ?? null,
        status: 'borrowed',
        logDate: today,
        borrowedAt: new Date().toISOString(),
        issuedByName: user.fullName,
        returnedAt: null,
        returnConditionNotes: null,
        deletedAt: null,
        deletedByUserId: null,
        deletedByName: null,
        deleteReason: null,
        version: 1,
      };
      this.data.papers.unshift(created);
      return this.ok(created, 201);
    }

    const paperReturnMatch = path.match(/^\/papers-borrowed\/([^/]+)\/return$/);
    if (method === 'PATCH' && paperReturnMatch) {
      const item = this.data.papers.find((p) => p.id === paperReturnMatch[1]);
      if (!item || (user.role === 'student' && (item.deletedAt !== null || item.logDate !== today))) {
        throw this.fail(404, 'RESOURCE_NOT_FOUND', 'Active borrowed paper not found.', correlationId);
      }
      const dto = (body ?? {}) as ReturnPaperLoanDto;
      item.status = 'returned';
      item.returnedAt = dto.returnedAt ?? new Date().toISOString();
      if (dto.returnConditionNotes) item.returnConditionNotes = dto.returnConditionNotes;
      item.version += 1;
      return this.ok(item);
    }

    if (method === 'GET' && path === '/visitor-log/summary') {
      const targetDate = user.role === 'student' ? today : requestedDate;
      const dayVisitors = this.data.visitors.filter((v) => v.logDate === targetDate && v.deletedAt === null);
      const dayBaggage = this.data.baggage.filter((b) => b.logDate === targetDate && b.deletedAt === null);
      const dayPapers = this.data.papers.filter((p) => p.logDate === targetDate && p.deletedAt === null);
      const summary: VisitorLogSummaryDto = {
        date: targetDate,
        sectionId: url.searchParams.get('section_id') ?? 'sec-reserve',
        visitorsTotal: dayVisitors.length,
        visitorsCurrentlyInside: dayVisitors.filter((v) => v.checkedOutAt === null).length,
        baggageDepositedActive: dayBaggage.filter((b) => b.status === 'deposited').length,
        baggageReturned: dayBaggage.filter((b) => b.status === 'returned').length,
        papersBorrowedActive: dayPapers.filter((p) => p.status === 'borrowed').length,
        papersReturned: dayPapers.filter((p) => p.status === 'returned').length,
      };
      return this.ok(summary);
    }

    throw this.fail(404, 'RESOURCE_NOT_FOUND', `Unhandled visitor route: ${method} ${path}`, correlationId);
  }

  private resolveAuthUser(
    req: HttpRequest<unknown>,
    correlationId: string,
    strict: boolean,
  ): UserProfileDto | null {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }
    const token = authHeader.slice('Bearer '.length).trim();
    for (const sess of this.sessions.values()) {
      if (sess.accessToken === token && !sess.revoked) {
        return this.data.accounts.find((a) => a.profile.id === sess.userId)?.profile ?? null;
      }
    }
    if (strict) {
      throw this.fail(401, 'AUTH_TOKEN_EXPIRED', 'Access token expired or invalid.', correlationId);
    }
    return null;
  }

  private ok<T>(body: T, status = 200): HttpResponse<T> {
    return new HttpResponse<T>({ status, body });
  }

  private fail(status: number, code: ApiErrorCode, message: string, correlationId: string): HttpErrorResponse {
    const envelope: ApiErrorEnvelope = {
      error: {
        code,
        message,
        correlationId,
        timestamp: new Date().toISOString(),
      },
    };
    return new HttpErrorResponse({ status, error: envelope, statusText: code });
  }
}
