import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '@vits/shared-network';
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
} from '@vits/shared-types';

const VALID_ROLES = new Set(['student', 'oic', 'admin']);

export function parseUsersCsv(csvText: string): CsvImportRowDto[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const startIdx = lines[0].toLowerCase().includes('email') ? 1 : 0;
  const seenEmails = new Set<string>();
  const rows: CsvImportRowDto[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    const [universityId = '', fullName = '', email = '', role = '', department = ''] = cols;
    const errors: string[] = [];

    if (!universityId) errors.push('Missing university ID');
    if (!fullName) errors.push('Missing full name');
    if (!email || !email.includes('@')) errors.push('Invalid email address');
    if (!VALID_ROLES.has(role.toLowerCase())) {
      errors.push(`Invalid role "${role || '(empty)'}" (use student, oic, or admin)`);
    }
    if (!department) errors.push('Missing department');

    const normalizedEmail = email.toLowerCase();
    if (normalizedEmail && seenEmails.has(normalizedEmail)) {
      errors.push('Duplicate email within CSV');
    }
    if (normalizedEmail) seenEmails.add(normalizedEmail);

    rows.push({
      rowNumber: i + 1,
      universityId,
      fullName,
      email,
      role: role.toLowerCase(),
      department,
      errors,
    });
  }
  return rows;
}

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly api = inject(ApiClient);

  getComplianceReport(): Promise<ComplianceReportDto> {
    return firstValueFrom(
      this.api.get<ComplianceReportDto>('/admin/reports/compliance', { endpointGroup: 'audit' }),
    );
  }

  getUsers(): Promise<{ users: UserProfileDto[] }> {
    return firstValueFrom(
      this.api.get<{ users: UserProfileDto[] }>('/admin/users', { endpointGroup: 'admin' }),
    );
  }

  createUser(dto: CreateUserDto): Promise<UserProfileDto> {
    return firstValueFrom(
      this.api.post<CreateUserDto, UserProfileDto>('/admin/users', dto, { endpointGroup: 'admin' }),
    );
  }

  updateUser(id: string, dto: UpdateUserDto): Promise<UserProfileDto> {
    return firstValueFrom(
      this.api.patch<UpdateUserDto, UserProfileDto>(`/admin/users/${id}`, dto, {
        endpointGroup: 'admin',
      }),
    );
  }

  importUsersCsv(rows: CsvImportRowDto[]): Promise<BulkCsvImportResultDto> {
    return firstValueFrom(
      this.api.post<{ rows: CsvImportRowDto[] }, BulkCsvImportResultDto>(
        '/admin/users/import',
        { rows },
        { endpointGroup: 'admin' },
      ),
    );
  }

  getSemesters(): Promise<{ semesters: SemesterDto[] }> {
    return firstValueFrom(
      this.api.get<{ semesters: SemesterDto[] }>('/admin/semesters', { endpointGroup: 'admin' }),
    );
  }

  createSemester(dto: CreateSemesterDto): Promise<SemesterDto> {
    return firstValueFrom(
      this.api.post<CreateSemesterDto, SemesterDto>('/admin/semesters', dto, {
        endpointGroup: 'admin',
      }),
    );
  }

  activateSemester(id: string): Promise<SemesterDto> {
    return firstValueFrom(
      this.api.patch<Record<string, never>, SemesterDto>(
        `/admin/semesters/${id}/activate`,
        {},
        { endpointGroup: 'admin' },
      ),
    );
  }

  getHourCaps(): Promise<HourCapDto> {
    return firstValueFrom(this.api.get<HourCapDto>('/admin/hour-caps', { endpointGroup: 'admin' }));
  }

  updateHourCaps(dto: Partial<HourCapDto>): Promise<HourCapDto> {
    return firstValueFrom(
      this.api.put<Partial<HourCapDto>, HourCapDto>('/admin/hour-caps', dto, {
        endpointGroup: 'admin',
      }),
    );
  }

  getSections(): Promise<{ sections: SectionDto[] }> {
    return firstValueFrom(
      this.api.get<{ sections: SectionDto[] }>('/admin/sections', { endpointGroup: 'admin' }),
    );
  }

  createSection(dto: CreateSectionDto): Promise<SectionDto> {
    return firstValueFrom(
      this.api.post<CreateSectionDto, SectionDto>('/admin/sections', dto, {
        endpointGroup: 'admin',
      }),
    );
  }

  getScheduleTemplates(): Promise<{ templates: ScheduleTemplateDto[] }> {
    return firstValueFrom(
      this.api.get<{ templates: ScheduleTemplateDto[] }>('/admin/schedule-templates', {
        endpointGroup: 'admin',
      }),
    );
  }

  createScheduleTemplate(dto: CreateScheduleTemplateDto): Promise<ScheduleTemplateDto> {
    return firstValueFrom(
      this.api.post<CreateScheduleTemplateDto, ScheduleTemplateDto>(
        '/admin/schedule-templates',
        dto,
        { endpointGroup: 'admin' },
      ),
    );
  }

  deleteScheduleTemplate(id: string): Promise<{ deleted: boolean }> {
    return firstValueFrom(
      this.api.delete<{ deleted: boolean }>(`/admin/schedule-templates/${id}`, {
        endpointGroup: 'admin',
      }),
    );
  }

  publishSchedule(semesterId: string): Promise<PublishScheduleResultDto> {
    return firstValueFrom(
      this.api.post<{ semesterId: string }, PublishScheduleResultDto>(
        '/admin/schedule/publish',
        { semesterId },
        { endpointGroup: 'admin' },
      ),
    );
  }

  getRequests(
    status?: string,
  ): Promise<{ swapRequests: SwapRequestDto[]; leaveRequests: LeaveRequestDto[] }> {
    return firstValueFrom(
      this.api.get<{ swapRequests: SwapRequestDto[]; leaveRequests: LeaveRequestDto[] }>(
        '/admin/requests',
        { endpointGroup: 'admin', params: status ? { status } : undefined },
      ),
    );
  }

  decideRequest(id: string, dto: DecideRequestDto): Promise<SwapRequestDto | LeaveRequestDto> {
    return firstValueFrom(
      this.api.patch<DecideRequestDto, SwapRequestDto | LeaveRequestDto>(
        `/requests/${id}/decision`,
        dto,
        { endpointGroup: 'admin' },
      ),
    );
  }

  getSyncBatches(): Promise<{ batches: SyncBatchDto[] }> {
    return firstValueFrom(
      this.api.get<{ batches: SyncBatchDto[] }>('/admin/sync-batches', { endpointGroup: 'audit' }),
    );
  }

  getDiscrepancies(): Promise<{ discrepancies: DiscrepancyDto[] }> {
    return firstValueFrom(
      this.api.get<{ discrepancies: DiscrepancyDto[] }>('/admin/discrepancies', {
        endpointGroup: 'audit',
      }),
    );
  }

  resolveDiscrepancy(id: string, dto: ResolveDiscrepancyDto): Promise<DiscrepancyDto> {
    return firstValueFrom(
      this.api.patch<ResolveDiscrepancyDto, DiscrepancyDto>(
        `/admin/discrepancies/${id}/resolve`,
        dto,
        { endpointGroup: 'audit' },
      ),
    );
  }
}
