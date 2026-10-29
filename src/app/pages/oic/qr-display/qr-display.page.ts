import { Component, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonSegment, IonSegmentButton, IonLabel } from '@ionic/angular';

@Component({
  selector: 'app-qr-display',
  templateUrl: './qr-display.page.html',
  standalone: true,
  imports: [FormsModule, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonSegment, IonSegmentButton, IonLabel],
})
export class QrDisplayPage implements OnDestroy {
  kind: 'IN' | 'OUT' = 'IN';
  size = 21;
  cells: boolean[] = [];
  seconds = 30;
  private timer?: ReturnType<typeof setInterval>;

  constructor(private cdr: ChangeDetectorRef) {}

  ionViewWillEnter() { this.regenerate(); this.start(); }
  ionViewWillLeave() { this.stop(); }
  ngOnDestroy() { this.stop(); }

  // mock rotating QR: pseudo-random grid + three finder squares
  regenerate() {
    let s = (Date.now() % 2147483646) + 1;
    const out: boolean[] = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        s = (s * 48271) % 2147483647;
        const f = this.finder(r, c);
        out.push(f === null ? s % 2 === 0 : f);
      }
    }
    this.cells = out;
    this.seconds = 30;
    this.cdr.detectChanges();
  }

  private finder(r: number, c: number): boolean | null {
    const n = this.size;
    const inBox = (r0: number, c0: number) => r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7;
    let box: [number, number] | null = null;
    if (inBox(0, 0)) box = [0, 0];
    else if (inBox(0, n - 7)) box = [0, n - 7];
    else if (inBox(n - 7, 0)) box = [n - 7, 0];
    if (!box) return null;
    const lr = r - box[0];
    const lc = c - box[1];
    return lr === 0 || lr === 6 || lc === 0 || lc === 6 || (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4);
  }

  private start() {
    this.stop();
    this.timer = setInterval(() => {
      this.seconds--;
      if (this.seconds <= 0) this.regenerate();
      this.cdr.detectChanges();
    }, 1000);
  }

  private stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
  }
}
