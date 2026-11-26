import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { ShiftDto, TaskCategory, TaskDto, TaskStatus, UserProfileDto } from '@vits/shared-types';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../../common/auth.guards';
import { VitsHttpException } from '../../common/api-error';
import { InMemoryApiStore } from '../../repositories/in-memory.store';

export class CreateTaskInputDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  shiftId!: string;

  @IsIn(['shelving', 'circulation', 'inventory'])
  category!: TaskCategory;

  @IsOptional()
  @IsString()
  assignedToUserId?: string | null;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}

export class UpdateTaskStatusInputDto {
  @IsIn(['todo', 'in_progress', 'done', 'verified'])
  status!: TaskStatus;
}

export class SignoffShiftInputDto {
  @IsOptional()
  @IsString()
  remarks?: string;
}

@ApiTags('tasks')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class TasksController {
  constructor(@Inject(InMemoryApiStore) private readonly store: InMemoryApiStore) {}

  @Get('tasks')
  listTasks(
    @CurrentUser() user: UserProfileDto,
    @Query('shift_id') shiftId?: string,
  ): { tasks: TaskDto[] } {
    const tasks = this.store.tasks.filter((t) => {
      if (shiftId && t.shiftId !== shiftId) return false;
      if (user.role === 'admin' || user.role === 'oic') {
        return user.role === 'admin' || user.sectionIds.includes(t.sectionId);
      }
      return t.assignedToUserId === user.id;
    });
    return { tasks };
  }

  @Post('tasks')
  @Roles('oic')
  createTask(
    @CurrentUser() user: UserProfileDto,
    @Body() dto: CreateTaskInputDto,
  ): TaskDto {
    const shift = this.store.shifts.find((s) => s.id === dto.shiftId);
    const sectionId = shift?.sectionId ?? user.sectionIds[0] ?? 'sec-reserve';
    if (!user.sectionIds.includes(sectionId)) {
      throw new VitsHttpException(403, 'SECTION_MISMATCH', 'OIC cannot assign tasks outside their sections.');
    }

    const assignee = dto.assignedToUserId ? this.store.findUserById(dto.assignedToUserId)?.profile : undefined;
    const task: TaskDto = {
      id: dto.id ?? `tsk-${randomUUID()}`,
      shiftId: dto.shiftId,
      sectionId,
      sectionName: this.store.getSectionName(sectionId),
      category: dto.category,
      assignedToUserId: assignee?.id ?? shift?.userId ?? null,
      assignedToName: assignee?.fullName ?? shift?.userFullName ?? null,
      createdByUserId: user.id,
      createdByName: user.fullName,
      title: dto.title.trim(),
      description: dto.description ?? null,
      status: 'todo',
      completedAt: null,
      version: 1,
    };
    this.store.tasks.unshift(task);
    this.store.recordChange(
      'tasks',
      task.id,
      'upsert',
      task as unknown as Record<string, unknown>,
      task.version,
      task.assignedToUserId ? [task.assignedToUserId] : null,
      [task.sectionId],
    );
    return task;
  }

  @Patch('tasks/:id/status')
  updateTaskStatus(
    @CurrentUser() user: UserProfileDto,
    @Param('id') id: string,
    @Body() dto: UpdateTaskStatusInputDto,
  ): TaskDto {
    const task = this.store.tasks.find((t) => t.id === id);
    if (!task) {
      throw new VitsHttpException(404, 'RESOURCE_NOT_FOUND', 'Task not found.');
    }
    if (dto.status === 'verified' && user.role !== 'oic') {
      throw new VitsHttpException(403, 'AUTH_INSUFFICIENT_ROLE', 'Only OICs can verify completed tasks.');
    }
    if (user.role === 'student' && task.assignedToUserId !== user.id) {
      throw new VitsHttpException(403, 'AUTH_INSUFFICIENT_ROLE', 'You can only update your own tasks.');
    }

    task.status = dto.status;
    task.completedAt =
      dto.status === 'done' || dto.status === 'verified' ? new Date().toISOString() : null;
    task.version += 1;
    this.store.recordChange(
      'tasks',
      task.id,
      'upsert',
      task as unknown as Record<string, unknown>,
      task.version,
      task.assignedToUserId ? [task.assignedToUserId] : null,
      [task.sectionId],
    );
    return task;
  }

  @Post('shifts/:id/signoff')
  @HttpCode(200)
  @Roles('oic')
  signoffShift(
    @CurrentUser() user: UserProfileDto,
    @Param('id') id: string,
    @Body() dto: SignoffShiftInputDto,
  ): ShiftDto {
    const shift = this.store.shifts.find((s) => s.id === id);
    if (!shift) {
      throw new VitsHttpException(404, 'RESOURCE_NOT_FOUND', 'Shift not found.');
    }
    if (!user.sectionIds.includes(shift.sectionId)) {
      throw new VitsHttpException(403, 'SECTION_MISMATCH', 'Shift belongs to another section.');
    }
    if (shift.signedOffAt) {
      throw new VitsHttpException(409, 'SHIFT_ALREADY_SIGNED_OFF', 'Shift has already been signed off.');
    }

    shift.status = 'completed';
    shift.signedOffBy = user.fullName;
    shift.signedOffAt = new Date().toISOString();
    shift.signoffRemarks = dto.remarks ?? null;
    shift.version += 1;
    this.store.recordChange(
      'shifts',
      shift.id,
      'upsert',
      shift as unknown as Record<string, unknown>,
      shift.version,
      [shift.userId],
      [shift.sectionId],
    );
    return shift;
  }
}
