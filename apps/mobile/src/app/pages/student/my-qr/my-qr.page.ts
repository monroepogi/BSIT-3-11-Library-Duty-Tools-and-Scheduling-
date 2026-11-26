import { Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { generateNonceHex, signStudentQrPayload } from '@vits/shared-crypto';
import QRCode from 'qrcode';
import { AuthService } from '../../../core/auth.service';
import { SecureVaultService } from '../../../core/secure-vault.service';

@Component({
  selector: 'app-my-qr',
  templateUrl: './my-qr.page.html',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton],
})
export class MyQrPage implements OnDestroy {
  readonly auth = inject(AuthService);
  private readonly vault = inject(SecureVaultService);

  @ViewChild('qrCanvas') qrCanvas?: ElementRef<HTMLCanvasElement>;

  readonly seconds = signal(30);
  readonly qrJson = signal('');
  readonly error = signal<string | null>(null);
  private timer?: ReturnType<typeof setInterval>;

  ionViewWillEnter(): void {
    void this.regenerate();
    this.start();
  }

  ionViewWillLeave(): void {
    this.stop();
  }

  ngOnDestroy(): void {
    this.stop();
  }

  async regenerate(): Promise<void> {
    const user = this.auth.currentUser();
    if (!user) {
      this.error.set('Not signed in.');
      return;
    }

    const cert = await this.vault.getStudentPassCert(user.id);
    if (!cert) {
      this.error.set('No cached Student Pass Certificate. Connect once while online to download your duty pass.');
      return;
    }

    const keypair = await this.vault.getOrCreateDeviceKeypair(user.id);
    const payload = signStudentQrPayload(cert, keypair.privateKeyB64, Date.now(), generateNonceHex(12));
    const serialized = JSON.stringify(payload);

    this.error.set(null);
    this.qrJson.set(serialized);
    this.seconds.set(30);

    const canvas = this.qrCanvas?.nativeElement;
    if (canvas) {
      await QRCode.toCanvas(canvas, serialized, {
        width: 240,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
    }
  }

  async copyPayload(): Promise<void> {
    const text = this.qrJson();
    if (!text) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }
    await this.auth.notify('Signed QR payload copied');
  }

  private start(): void {
    this.stop();
    this.timer = setInterval(() => {
      const next = this.seconds() - 1;
      if (next <= 0) {
        void this.regenerate();
      } else {
        this.seconds.set(next);
      }
    }, 1000);
  }

  private stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
