import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { Role } from '../../attributes/role';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private toastCtrl = inject(ToastController);

  role: Role | null = null;
  userName = '';
  onDuty = false;
  offline = false;       // dev toggle
  pendingSync = 0;       // fake outbox counter

  signIn(role: Role) {
    this.role = role;
    this.userName = role === 'STUDENT' ? 'Juan Dela Cruz' : 'Ms. Reyes';
    this.onDuty = false;
    this.offline = false;
    this.pendingSync = 0;
  }

  signOut() {
    this.role = null;
    this.userName = '';
    this.onDuty = false;
    this.offline = false;
    this.pendingSync = 0;
  }

  homeUrl(): string {
    return this.role === 'OIC' ? '/oic/home' : this.role === 'STUDENT' ? '/student/home' : '/login';
  }

  setOffline(value: boolean) {
    this.offline = value;
    if (!value) this.pendingSync = 0;   // "sync" completes when back online
  }

  async notify(message: string) {
    const t = await this.toastCtrl.create({ message, duration: 1800, position: 'top' });
    await t.present();
  }

  // every "write" goes through here: queues when offline, then shows a toast
  async record(message: string) {
    if (this.offline) this.pendingSync++;
    await this.notify(this.offline ? message + ' - saved offline, will sync' : message);
  }
}
