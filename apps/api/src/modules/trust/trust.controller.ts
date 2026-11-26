import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { signOicDutyCert, signStudentPassCert } from '@vits/shared-crypto';
import type {
  DutyCertificateDto,
  StudentPassCertificateDto,
  TrustPublicKeyDto,
  UserProfileDto,
} from '@vits/shared-types';
import { IsString, MinLength } from 'class-validator';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../../common/auth.guards';
import { VitsHttpException } from '../../common/api-error';
import { InMemoryApiStore } from '../../repositories/in-memory.store';

export class IssueStudentPassDto {
  @IsString()
  @MinLength(2)
  deviceId!: string;

  @IsString()
  @MinLength(20)
  studentDevicePubkey!: string;
}

export class IssueOicDutyCertDto {
  @IsString()
  shiftId!: string;

  @IsString()
  sectionId!: string;

  @IsString()
  @MinLength(2)
  deviceId!: string;

  @IsString()
  @MinLength(20)
  oicDevicePubkey!: string;
}

@ApiTags('trust')
@Controller()
export class TrustController {
  constructor(@Inject(InMemoryApiStore) private readonly store: InMemoryApiStore) {}

  @Get('trust/keys')
  getTrustKeys(): { keys: TrustPublicKeyDto[] } {
    return { keys: this.store.trustKeys };
  }

  @Post('student/pass-certificates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  @ApiBearerAuth()
  issueStudentPass(
    @CurrentUser() user: UserProfileDto,
    @Body() dto: IssueStudentPassDto,
  ): StudentPassCertificateDto {
    const now = Date.now();
    return signStudentPassCert(
      {
        id: `scert-${randomUUID()}`,
        studentId: user.id,
        studentName: user.fullName,
        universityId: user.universityId,
        studentDevicePubkey: dto.studentDevicePubkey,
        validFrom: new Date(now - 60_000).toISOString(),
        validTo: new Date(now + 24 * 3600_000).toISOString(),
        kid: this.store.config.trustKid,
      },
      this.store.config.trustPrivateKeyB64,
    );
  }

  @Post('oic/duty-certificates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('oic')
  @ApiBearerAuth()
  issueOicDutyCert(
    @CurrentUser() user: UserProfileDto,
    @Body() dto: IssueOicDutyCertDto,
  ): DutyCertificateDto {
    if (!user.sectionIds.includes(dto.sectionId)) {
      throw new VitsHttpException(
        403,
        'SECTION_MISMATCH',
        'OIC is not assigned to the requested library section.',
      );
    }

    const now = Date.now();
    const cert = signOicDutyCert(
      {
        id: `ocert-${randomUUID()}`,
        oicId: user.id,
        oicName: user.fullName,
        sectionId: dto.sectionId,
        sectionName: this.store.getSectionName(dto.sectionId),
        shiftId: dto.shiftId,
        oicDevicePubkey: dto.oicDevicePubkey,
        validFrom: new Date(now - 60_000).toISOString(),
        validTo: new Date(now + 12 * 3600_000).toISOString(),
        kid: this.store.config.trustKid,
      },
      this.store.config.trustPrivateKeyB64,
    );
    this.store.dutyCertificates.unshift(cert);
    return cert;
  }
}
