import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  getLibraryDateString,
  type HoursSummaryDto,
  type ShiftDto,
  type UserProfileDto,
} from '@vits/shared-types';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../../common/auth.guards';
import { InMemoryApiStore } from '../../repositories/in-memory.store';

@ApiTags('roster')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class RosterController {
  constructor(@Inject(InMemoryApiStore) private readonly store: InMemoryApiStore) {}

  @Get('me/shifts')
  getMyShifts(
    @CurrentUser() user: UserProfileDto,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): { shifts: ShiftDto[] } {
    const shifts = this.store.shifts.filter((s) => {
      if (s.userId !== user.id) return false;
      if (from && s.shiftDate < from) return false;
      if (to && s.shiftDate > to) return false;
      return true;
    });
    return { shifts };
  }

  @Get('me/hours-summary')
  getMyHoursSummary(@CurrentUser() user: UserProfileDto): HoursSummaryDto {
    return (
      this.store.hoursByUserId.get(user.id) ?? {
        semesterId: 'sem-2026-1',
        semesterName: '1st Semester AY 2026–2027',
        renderedMinutes: 0,
        weeklyRenderedMinutes: 0,
        approvedLeaveMinutes: 0,
        pendingMinutes: 0,
        semesterCapMinutes: 3600,
        weeklyCapMinutes: 600,
      }
    );
  }

  @Get('oic/section-roster')
  @Roles('oic', 'admin')
  getSectionRoster(
    @CurrentUser() user: UserProfileDto,
    @Query('date') dateParam?: string,
    @Query('section_id') sectionParam?: string,
  ): { date: string; sectionId: string; sectionName: string; shifts: ShiftDto[] } {
    const date = dateParam ?? getLibraryDateString(new Date(), this.store.config.libraryTimezone);
    const sectionId = sectionParam ?? user.sectionIds[0] ?? 'sec-reserve';
    const shifts = this.store.shifts.filter(
      (s) => s.shiftDate === date && (sectionParam ? s.sectionId === sectionId : user.sectionIds.includes(s.sectionId)),
    );
    return {
      date,
      sectionId,
      sectionName: this.store.getSectionName(sectionId),
      shifts,
    };
  }
}
