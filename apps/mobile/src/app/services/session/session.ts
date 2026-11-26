import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { SupabaseService } from '@vits/shared-network';
import { Role } from '../../attributes/role';
import { LibraryDatabaseService } from '../database/library-database.service';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly toastCtrl = inject(ToastController);
  private readonly supabase = inject(SupabaseService);
  private readonly db = inject(LibraryDatabaseService);

  role: Role | null = null;
  userName = '';
  userEmail = '';
  onDuty = false;
  offline = false;
  pendingSync = 0;

  get isSupabaseConfigured(): boolean {
    return this.supabase.isConfigured;
  }

  signIn(role: Role) {
    this.role = role;
    this.userName = role === 'STUDENT' ? 'Juan Dela Cruz' : 'Ms. Reyes';
    this.userEmail =
      role === 'STUDENT' ? 'juan.delacruz@university.edu' : 'reyes.oic@university.edu';
    this.onDuty = false;
    this.offline = false;
    this.db.setOffline(false);
    this.pendingSync = this.db.pendingCount;
  }

  async signInWithSupabase(
    email: string,
    password: string,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this.supabase.isConfigured) {
      return { ok: false, error: 'Supabase is not configured in environment.ts.' };
    }

    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return { ok: false, error: error?.message ?? 'Invalid email or password.' };
    }

    const { data: profile } = await this.supabase
      .from('profiles')
      .select('full_name, role, email')
      .or(`auth_user_id.eq.${data.user.id},email.eq.${email}`)
      .maybeSingle();

    const mappedRole: Role = profile?.role === 'OIC' ? 'OIC' : 'STUDENT';
    this.role = mappedRole;
    this.userName = profile?.full_name ?? data.user.email ?? 'Library User';
    this.userEmail = profile?.email ?? data.user.email ?? email;
    this.onDuty = false;
    this.offline = false;
    this.db.setOffline(false);
    this.pendingSync = this.db.pendingCount;
    return { ok: true };
  }

  signOut() {
    this.role = null;
    this.userName = '';
    this.userEmail = '';
    this.onDuty = false;
    this.offline = false;
    this.db.setOffline(false);
    this.pendingSync = 0;
    if (this.supabase.isConfigured) {
      void this.supabase.auth.signOut();
    }
  }

  homeUrl(): string {
    return this.role === 'OIC' ? '/oic/home' : this.role === 'STUDENT' ? '/student/home' : '/login';
  }

  setOffline(value: boolean) {
    this.offline = value;
    this.db.setOffline(value);
    if (!value) {
      void this.db.flushPendingOperations().then((flushed) => {
        this.pendingSync = this.db.pendingCount;
        if (flushed > 0) {
          void this.notify(`Synced ${flushed} offline change(s) to Supabase`);
        }
      });
    }
  }

  async notify(message: string) {
    const t = await this.toastCtrl.create({ message, duration: 1800, position: 'top' });
    await t.present();
  }

  async record(message: string) {
    if (this.offline) {
      this.pendingSync = Math.max(this.pendingSync + 1, this.db.pendingCount);
    } else {
      this.pendingSync = this.db.pendingCount;
    }
    await this.notify(this.offline ? `${message} - saved offline, will sync` : message);
  }
}
