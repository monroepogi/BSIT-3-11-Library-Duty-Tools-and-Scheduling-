import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type {
  BulkCsvImportResultDto,
  ComplianceReportDto,
  CreateScheduleTemplateDto,
  CreateSectionDto,
  CreateSemesterDto,
  CreateUserDto,
  CsvImportRowDto,
  DecideRequestDto,
  DiscrepancyDto,
  HourCapDto,
  LeaveRequestDto,
  PublishScheduleResultDto,
  ResolveDiscrepancyDto,
  ScheduleTemplateDto,
  SectionDto,
  SemesterDto,
  SwapRequestDto,
  SyncBatchDto,
  UpdateUserDto,
  UserProfileDto,
  UserRole,
} from '@vits/shared-types';
import { VitsHttpException } from '../../common/api-error';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../../common/auth.guards';
import { hashPasswordArgon2id } from '../../common/password.util';
import { DEMO_API_PASSWORD, InMemoryApiStore } from '../../repositories/in-memory.store';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(@Inject(InMemoryApiStore) private readonly store: InMemoryApiStore) {}

  @Get('users')
  listUsers(): { users: UserProfileDto[] } {
    return { users: this.store.users.map((u) => u.profile) };
  }

  @Post('users')
  createUser(@Body() body: CreateUserDto): UserProfileDto {
    const email = (body.email ?? '').trim().toLowerCase();
    if (!email || !body.fullName?.trim() || !body.universityId?.trim()) {
      throw new VitsHttpException(400, 'VALIDATION_ERROR', 'universityId, fullName, and email are required.');
    }
    if (this.store.findUserByEmail(email)) {
      throw new VitsHttpException(409, 'CONFLICT_DUPLICATE', `User with email ${email} already exists.`);
    }
    const sectionIds = body.sectionIds ?? [];
    const profile: UserProfileDto = {
      id: `usr-${randomUUID().slice(0, 8)}`,
      universityId: body.universityId.trim(),
      email,
      fullName: body.fullName.trim(),
      role: body.role ?? 'student',
      department: body.department?.trim() || 'University Library',
      active: true,
      sectionIds,
      sectionNames: sectionIds.map((id) => this.store.getSectionName(id)),
    };
    this.store.users.push({
      profile,
      passwordHash: hashPasswordArgon2id(DEMO_API_PASSWORD),
    });
    return profile;
  }

  @Patch('users/:id')
  updateUser(@Param('id') id: string, @Body() body: UpdateUserDto): UserProfileDto {
    const record = this.store.findUserById(id);
    if (!record) {
      throw new VitsHttpException(404, 'RESOURCE_NOT_FOUND', 'User not found.');
    }
    if (body.fullName !== undefined) record.profile.fullName = body.fullName.trim();
    if (body.role !== undefined) record.profile.role = body.role;
    if (body.department !== undefined) record.profile.department = body.department.trim();
    if (body.active !== undefined) record.profile.active = body.active;
    if (body.sectionIds !== undefined) {
      record.profile.sectionIds = body.sectionIds;
      record.profile.sectionNames = body.sectionIds.map((s) => this.store.getSectionName(s));
    }
    return record.profile;
  }

  @Post('users/import')
  @HttpCode(200)
  importUsers(@Body() body: { rows?: CsvImportRowDto[] }): BulkCsvImportResultDto {
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    const createdUsers: UserProfileDto[] = [];
    const rowErrors: Array<{ rowNumber: number; error: string }> = [];
    const pwHash = hashPasswordArgon2id(DEMO_API_PASSWORD);

    for (const row of rows) {
      if (row.errors && row.errors.length > 0) {
        rowErrors.push({ rowNumber: row.rowNumber, error: row.errors.join('; ') });
        continue;
      }
      const email = row.email.trim().toLowerCase();
      if (this.store.findUserByEmail(email)) {
        rowErrors.push({ rowNumber: row.rowNumber, error: `Duplicate email: ${email}` });
        continue;
      }
      const role = (row.role.toLowerCase() as UserRole) || 'student';
      const profile: UserProfileDto = {
        id: `usr-${randomUUID().slice(0, 8)}`,
        universityId: row.universityId.trim(),
        email,
        fullName: row.fullName.trim(),
        role,
        department: row.department.trim(),
        active: true,
        sectionIds: ['sec-periodicals'],
        sectionNames: [this.store.getSectionName('sec-periodicals')],
      };
      this.store.users.push({ profile, passwordHash: pwHash });
      createdUsers.push(profile);
    }

    return {
      importedCount: createdUsers.length,
      skippedCount: rowErrors.length,
      createdUsers,
      rowErrors,
    };
  }

  @Get('semesters')
  listSemesters(): { semesters: SemesterDto[] } {
    return { semesters: this.store.semesters };
  }

  @Post('semesters')
  createSemester(@Body() body: CreateSemesterDto): SemesterDto {
    if (!body.name?.trim() || !body.startDate || !body.endDate) {
      throw new VitsHttpException(400, 'VALIDATION_ERROR', 'name, startDate, and endDate are required.');
    }
    if (body.isActive) {
      for (const sem of this.store.semesters) sem.isActive = false;
    }
    const created: SemesterDto = {
      id: `sem-${randomUUID().slice(0, 8)}`,
      name: body.name.trim(),
      startDate: body.startDate,
      endDate: body.endDate,
      isActive: Boolean(body.isActive),
      publishedShiftsCount: 0,
    };
    this.store.semesters.unshift(created);
    return created;
  }

  @Patch('semesters/:id/activate')
  activateSemester(@Param('id') id: string): SemesterDto {
    const target = this.store.semesters.find((s) => s.id === id);
    if (!target) throw new VitsHttpException(404, 'RESOURCE_NOT_FOUND', 'Semester not found.');
    for (const sem of this.store.semesters) sem.isActive = sem.id === id;
    return target;
  }

  @Get('hour-caps')
  getHourCaps(): HourCapDto {
    return this.store.hourCap;
  }

  @Put('hour-caps')
  updateHourCaps(@Body() body: Partial<HourCapDto>): HourCapDto {
    this.store.hourCap = {
      ...this.store.hourCap,
      ...(body.weeklyMaxHours !== undefined ? { weeklyMaxHours: Number(body.weeklyMaxHours) } : {}),
      ...(body.semesterRequiredHours !== undefined
        ? { semesterRequiredHours: Number(body.semesterRequiredHours) }
        : {}),
      ...(body.semesterMaxHours !== undefined ? { semesterMaxHours: Number(body.semesterMaxHours) } : {}),
      updatedAt: new Date().toISOString(),
    };
    return this.store.hourCap;
  }

  @Get('sections')
  listSections(): { sections: SectionDto[] } {
    return { sections: this.store.sections };
  }

  @Post('sections')
  createSection(@Body() body: CreateSectionDto): SectionDto {
    if (!body.code?.trim() || !body.name?.trim()) {
      throw new VitsHttpException(400, 'VALIDATION_ERROR', 'code and name are required.');
    }
    const oic = body.oicUserId ? this.store.findUserById(body.oicUserId)?.profile : undefined;
    const section: SectionDto = {
      id: `sec-${randomUUID().slice(0, 8)}`,
      code: body.code.trim().toUpperCase(),
      name: body.name.trim(),
      location: body.location?.trim() || 'Main Library',
      oicUserId: oic?.id ?? null,
      oicName: oic?.fullName ?? null,
      memberCount: 0,
      active: true,
    };
    this.store.sections.push(section);
    return section;
  }

  @Get('schedule-templates')
  listScheduleTemplates(): { templates: ScheduleTemplateDto[] } {
    return { templates: this.store.scheduleTemplates };
  }

  @Post('schedule-templates')
  createScheduleTemplate(@Body() body: CreateScheduleTemplateDto): ScheduleTemplateDto {
    const sec = this.store.sections.find((s) => s.id === body.sectionId);
    const created: ScheduleTemplateDto = {
      id: `tpl-${randomUUID().slice(0, 8)}`,
      semesterId: body.semesterId || 'sem-2026-1',
      sectionId: body.sectionId,
      sectionName: sec?.name ?? this.store.getSectionName(body.sectionId),
      dayOfWeek: body.dayOfWeek,
      startTime: body.startTime,
      endTime: body.endTime,
      slotsRequired: Number(body.slotsRequired) || 1,
      assignedStudentNames: [],
    };
    this.store.scheduleTemplates.push(created);
    return created;
  }

  @Delete('schedule-templates/:id')
  deleteScheduleTemplate(@Param('id') id: string): { deleted: boolean } {
    const idx = this.store.scheduleTemplates.findIndex((t) => t.id === id);
    if (idx === -1) throw new VitsHttpException(404, 'RESOURCE_NOT_FOUND', 'Schedule template not found.');
    this.store.scheduleTemplates.splice(idx, 1);
    return { deleted: true };
  }

  @Post('schedule/publish')
  @HttpCode(200)
  publishSchedule(@Body() body: { semesterId?: string }): PublishScheduleResultDto {
    const semesterId = body?.semesterId || this.store.semesters.find((s) => s.isActive)?.id || 'sem-2026-1';
    const sem = this.store.semesters.find((s) => s.id === semesterId);
    const generatedShiftsCount = this.store.scheduleTemplates.length * 4;
    if (sem) {
      sem.publishedShiftsCount += generatedShiftsCount;
    }
    return {
      semesterId,
      generatedShiftsCount,
      publishedAt: new Date().toISOString(),
    };
  }

  @Get('requests')
  listRequests(
    @Query('status') status?: string,
  ): { swapRequests: SwapRequestDto[]; leaveRequests: LeaveRequestDto[] } {
    const filter = status && status !== 'all' ? status : null;
    return {
      swapRequests: filter
        ? this.store.swapRequests.filter((r) => r.status === filter)
        : this.store.swapRequests,
      leaveRequests: filter
        ? this.store.leaveRequests.filter((r) => r.status === filter)
        : this.store.leaveRequests,
    };
  }

  @Get('sync-batches')
  listSyncBatches(): { batches: SyncBatchDto[] } {
    const batches: SyncBatchDto[] = this.store.syncBatches.map((b) => {
      const user = this.store.findUserById(b.userId)?.profile;
      return {
        id: b.id,
        deviceId: b.deviceId,
        userId: b.userId,
        userName: user?.fullName ?? b.userId,
        userRole: user?.role ?? 'oic',
        receivedAt: b.receivedAt,
        appliedCount: b.appliedCount,
        duplicateCount: b.duplicateCount,
        rejectedCount: b.rejectedCount,
        ops: b.ops ?? [],
      };
    });
    return { batches };
  }

  @Get('discrepancies')
  listDiscrepancies(): { discrepancies: DiscrepancyDto[] } {
    const discrepancies: DiscrepancyDto[] = this.store.discrepancies.map((d) => {
      const user = this.store.findUserById(d.userId)?.profile;
      const shift = d.shiftId ? this.store.shifts.find((s) => s.id === d.shiftId) : undefined;
      const shiftUser = shift ? this.store.findUserById(shift.userId)?.profile : undefined;
      return {
        id: d.id,
        type: d.type,
        severity: d.severity,
        studentName: shiftUser?.fullName ?? user?.fullName ?? d.userId,
        oicName: d.oicName ?? 'Carlo Reyes',
        sectionName: d.sectionName ?? shift?.sectionName ?? 'Periodicals & Serials',
        occurredAt: d.occurredAt,
        summary: d.summary,
        status: d.status ?? 'open',
        resolutionNotes: d.resolutionNotes ?? null,
        resolvedBy: d.resolvedBy ?? null,
        resolvedAt: d.resolvedAt ?? null,
      };
    });
    return { discrepancies };
  }

  @Patch('discrepancies/:id/resolve')
  resolveDiscrepancy(
    @Param('id') id: string,
    @Body() body: ResolveDiscrepancyDto,
    @CurrentUser() admin: UserProfileDto,
  ): DiscrepancyDto {
    const rec = this.store.discrepancies.find((d) => d.id === id);
    if (!rec) throw new VitsHttpException(404, 'RESOURCE_NOT_FOUND', 'Discrepancy not found.');
    rec.status = 'resolved';
    rec.resolutionNotes = body.resolutionNotes?.trim() || 'Resolved by Admin.';
    rec.resolvedBy = admin.fullName;
    rec.resolvedAt = new Date().toISOString();
    const user = this.store.findUserById(rec.userId)?.profile;
    const shift = rec.shiftId ? this.store.shifts.find((s) => s.id === rec.shiftId) : undefined;
    const shiftUser = shift ? this.store.findUserById(shift.userId)?.profile : undefined;
    return {
      id: rec.id,
      type: rec.type,
      severity: rec.severity,
      studentName: shiftUser?.fullName ?? user?.fullName ?? rec.userId,
      oicName: rec.oicName ?? 'Carlo Reyes',
      sectionName: rec.sectionName ?? shift?.sectionName ?? 'Periodicals & Serials',
      occurredAt: rec.occurredAt,
      summary: rec.summary,
      status: 'resolved',
      resolutionNotes: rec.resolutionNotes,
      resolvedBy: rec.resolvedBy,
      resolvedAt: rec.resolvedAt,
    };
  }

  @Get('reports/compliance')
  getComplianceReport(): ComplianceReportDto {
    const activeSem = this.store.semesters.find((s) => s.isActive) ?? this.store.semesters[0];
    const students = this.store.users.filter((u) => u.profile.role === 'student' && u.profile.active);
    let totalRenderedMinutes = 0;
    for (const s of students) {
      totalRenderedMinutes += this.store.hoursByUserId.get(s.profile.id)?.renderedMinutes ?? 0;
    }
    const totalRenderedHours = Math.round((totalRenderedMinutes / 60) * 10) / 10;
    const targetPerStudent = this.store.hourCap.semesterRequiredHours || 90;
    const averageCompletionPct =
      students.length > 0
        ? Math.min(100, Math.round((totalRenderedHours / (students.length * targetPerStudent)) * 100))
        : 0;

    const openDiscrepancies = this.store.discrepancies.filter((d) => (d.status ?? 'open') === 'open');
    const pendingRequestsCount =
      this.store.swapRequests.filter((r) => r.status === 'endorsed' || r.status === 'pending_endorsement')
        .length +
      this.store.leaveRequests.filter((r) => r.status === 'endorsed' || r.status === 'pending_endorsement')
        .length;

    const sections = this.store.sections.map((sec) => {
      const secStudents = students.filter((u) => u.profile.sectionIds.includes(sec.id));
      const secMinutes = secStudents.reduce(
        (acc, u) => acc + (this.store.hoursByUserId.get(u.profile.id)?.renderedMinutes ?? 0),
        0,
      );
      const renderedHours = Math.round((secMinutes / 60) * 10) / 10;
      const targetHours = Math.max(1, secStudents.length) * targetPerStudent;
      return {
        sectionId: sec.id,
        sectionName: sec.name,
        activeStudents: secStudents.length,
        renderedHours,
        targetHours,
        completionPct: Math.min(100, Math.round((renderedHours / targetHours) * 100)),
        openDiscrepancies: openDiscrepancies.filter((d) => d.sectionName === sec.name).length,
      };
    });

    return {
      semesterId: activeSem?.id ?? 'sem-2026-1',
      semesterName: activeSem?.name ?? '1st Semester AY 2026–2027',
      generatedAt: new Date().toISOString(),
      totalStudents: students.length,
      totalRenderedHours,
      averageCompletionPct,
      pendingRequestsCount,
      openDiscrepanciesCount: openDiscrepancies.length,
      attendanceBreakdown: {
        verified: this.store.shifts.filter((s) => s.attendance.verificationStatus === 'verified').length,
        pending: this.store.shifts.filter(
          (s) =>
            s.attendance.verificationStatus === 'none' ||
            s.attendance.verificationStatus === 'pending_sync',
        ).length,
        missed: this.store.shifts.filter((s) => s.status === 'missed').length,
        flagged: openDiscrepancies.length,
      },
      sections,
    };
  }
}

@ApiTags('requests')
@ApiBearerAuth()
@Controller('requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminRequestDecisionController {
  constructor(@Inject(InMemoryApiStore) private readonly store: InMemoryApiStore) {}

  @Patch(':id/decision')
  @Roles('admin')
  decide(
    @Param('id') id: string,
    @Body() body: DecideRequestDto,
    @CurrentUser() admin: UserProfileDto,
  ): SwapRequestDto | LeaveRequestDto {
    const now = new Date().toISOString();
    const target =
      this.store.swapRequests.find((r) => r.id === id) ??
      this.store.leaveRequests.find((r) => r.id === id);
    if (!target) {
      throw new VitsHttpException(404, 'RESOURCE_NOT_FOUND', 'Request not found.');
    }
    const prev = target.status;
    target.status = body.decision;
    target.decidedBy = admin.fullName;
    target.decidedAt = now;
    target.decisionRemarks = body.remarks?.trim() || null;
    target.version += 1;
    target.events.push({
      id: `ev-${randomUUID().slice(0, 8)}`,
      actorName: admin.fullName,
      actorRole: 'admin',
      fromStatus: prev,
      toStatus: body.decision,
      remarks: target.decisionRemarks,
      createdAt: now,
    });
    return target;
  }
}
