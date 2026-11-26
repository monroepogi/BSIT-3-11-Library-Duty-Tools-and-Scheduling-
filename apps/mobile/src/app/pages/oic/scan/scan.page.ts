import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { signOicAttendanceReceipt, verifyStudentQrPayload } from '@vits/shared-crypto';
import type { StudentQrPayloadDto } from '@vits/shared-types';
import { AuthService } from '../../../core/auth.service';
import {
  OutboxRepository,
  ShiftsRepository,
  TrustCacheRepository,
} from '../../../core/db/repositories';
import { QrScannerService } from '../../../core/qr-scanner.service';
import { SecureVaultService } from '../../../core/secure-vault.service';
import { SyncService } from '../../../core/sync/sync.service';

@Component({
  selector: 'app-scan',
  templateUrl: './scan.page.html',
  standalone: true,
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonTextarea,
    IonButton,
    IonIcon,
  ],
})
export class ScanPage {
  readonly auth = inject(AuthService);
  readonly scanner = inject(QrScannerService);
  private readonly vault = inject(SecureVaultService);
  private readonly trustRepo = inject(TrustCacheRepository);
  private readonly shiftsRepo = inject(ShiftsRepository);
  private readonly outboxRepo = inject(OutboxRepository);
  private readonly sync = inject(SyncService);

  mode: 'IN' | 'OUT' = 'IN';
  pastedPayload = '';
  readonly error = signal<string | null>(null);
  readonly statusMessage = signal<string | null>(null);

  async openCamera(): Promise<void> {
    this.error.set(null);
    const raw = await this.scanner.scanRawText();
    if (!raw) {
      this.error.set('Native camera plugin unavailable in browser; paste the copied Student QR payload below.');
      return;
    }
    this.pastedPayload = raw;
    await this.verifyAndRecord();
  }

  async verifyAndRecord(): Promise<void> {
    this.error.set(null);
    this.statusMessage.set(null);

    const oicUser = this.auth.currentUser();
    if (!oicUser) {
      this.error.set('Not signed in.');
      return;
    }

    let parsed: StudentQrPayloadDto;
    try {
      parsed = JSON.parse(this.pastedPayload.trim()) as StudentQrPayloadDto;
    } catch {
      this.error.set('Invalid QR JSON format.');
      return;
    }

    const trustKeys = await this.trustRepo.getKeys();
    const nowMs = Date.now();
    const qrCheck = verifyStudentQrPayload(parsed, trustKeys, nowMs, 90_000);
    if (!qrCheck.valid) {
      this.error.set(`${qrCheck.code}: ${qrCheck.reason}`);
      return;
    }

    if (parsed.cert.studentId === oicUser.id) {
      this.error.set('SELF_ACTION_FORBIDDEN: An OIC cannot scan their own student QR.');
      return;
    }

    const studentId = parsed.cert.studentId;
    const studentName = parsed.cert.studentName;
    const existingShift = this.shiftsRepo.shifts().find((s) => s.userId === studentId);
    if (this.mode === 'IN' && existingShift?.status === 'in_progress') {
      await this.auth.notify(`${studentName} is already clocked in`);
      this.statusMessage.set(`${studentName} is already on duty (blocked duplicate Time-In).`);
      return;
    }
    if (this.mode === 'OUT' && existingShift?.status !== 'in_progress') {
      await this.auth.notify(`${studentName} is not currently clocked in`);
      this.statusMessage.set(`${studentName} is not on duty (blocked invalid Time-Out).`);
      return;
    }

    const oicCert = await this.vault.getOicDutyCert(oicUser.id);
    if (!oicCert) {
      this.error.set('No cached OIC Duty Certificate. Connect once while online to download your duty certificate.');
      return;
    }

    const oicKeypair = await this.vault.getOrCreateDeviceKeypair(oicUser.id);
    const bootId = await this.vault.getBootId();
    const oicMonoMs = this.vault.getMonotonicMs();

    const receipt = signOicAttendanceReceipt(oicCert, parsed, this.mode, oicKeypair.privateKeyB64, {
      oicTs: nowMs,
      oicMonoMs,
      bootId,
    });

    const entityId =
      (await this.shiftsRepo.applyLocalAttendance(
        studentId,
        oicCert.sectionId,
        this.mode,
        new Date(nowMs).toISOString(),
      )) ?? existingShift?.id ?? oicCert.shiftId;

    const actionLabel = this.mode === 'IN' ? 'Time-In' : 'Time-Out';
    await this.outboxRepo.enqueue({
      entityType: 'shift',
      entityId,
      type: 'attendance.scan',
      label: `${studentName} — ${actionLabel}`,
      payload: { receipt },
    });

    this.pastedPayload = '';
    this.statusMessage.set(
      this.auth.isOffline()
        ? `${studentName} — ${actionLabel} verified offline and queued in outbox.`
        : `${studentName} — ${actionLabel} verified and queued for sync.`,
    );
    await this.auth.notify(`${studentName} — ${actionLabel} recorded`);
    this.sync.scheduleDebouncedSync(100);
  }
}
