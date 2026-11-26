import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  BulkCsvImportResultDto,
  CsvImportRowDto,
  UserProfileDto,
  UserRole,
} from '@vits/shared-types';
import { AdminApiService, parseUsersCsv } from '../../core/admin-api.service';
import { AdminAuthService } from '../../core/admin-auth.service';

const SAMPLE_CSV = `university_id,full_name,email,role,department
2025-20011,Andrea Mendoza,andrea.mendoza@university.edu,student,BS Information Systems
2025-20012,Rafael Gomez,rafael.gomez@university.edu,oic,BS Computer Science
2025-20013,Invalid Row,not-an-email,invalidrole,BA English`;

@Component({
  selector: 'vits-admin-users',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="admin-page-header">
      <div>
        <h1 class="admin-page-title">User Management</h1>
        <div class="vits-muted">Manage student assistants, OICs, admins, and bulk CSV roster imports</div>
      </div>
      <div class="vits-row">
        <button type="button" class="admin-btn secondary" (click)="openCsvModal()">Bulk CSV Import</button>
        <button type="button" class="admin-btn" (click)="openCreateModal()">+ New User</button>
      </div>
    </div>

    @if (feedback()) {
      <div class="vits-banner duty" role="status">{{ feedback() }}</div>
    }

    <div class="admin-toolbar">
      <input
        class="admin-input"
        type="search"
        placeholder="Search name, email, or university ID..."
        [ngModel]="search()"
        (ngModelChange)="search.set($event)"
        style="min-width: 260px;"
      />
      <select class="admin-select" [ngModel]="roleFilter()" (ngModelChange)="roleFilter.set($event)">
        <option value="all">All roles</option>
        <option value="student">Student</option>
        <option value="oic">OIC</option>
        <option value="admin">Admin</option>
      </select>
      <button type="button" class="admin-btn secondary sm" (click)="load()">Refresh</button>
    </div>

    @if (loading()) {
      <div class="admin-state-box">Loading users...</div>
    } @else if (error()) {
      <div class="admin-state-box error" role="alert">
        <p>{{ error() }}</p>
        <button type="button" class="admin-btn secondary sm" (click)="load()">Retry</button>
      </div>
    } @else if (filteredUsers().length === 0) {
      <div class="admin-state-box">No users match the current filter.</div>
    } @else {
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>University ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Department</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (u of filteredUsers(); track u.id) {
              <tr>
                <td><strong>{{ u.universityId }}</strong></td>
                <td>{{ u.fullName }}</td>
                <td>{{ u.email }}</td>
                <td><span class="vits-chip info">{{ u.role }}</span></td>
                <td>{{ u.department }}</td>
                <td>
                  <span class="vits-chip" [class.ok]="u.active" [class.bad]="!u.active">
                    {{ u.active ? 'Active' : 'Deactivated' }}
                  </span>
                </td>
                <td>
                  <div class="vits-row" style="justify-content: flex-start;">
                    <button type="button" class="admin-btn secondary sm" (click)="openEditModal(u)">Edit</button>
                    <button
                      type="button"
                      class="admin-btn sm"
                      [class.danger]="u.active"
                      [class.success]="!u.active"
                      (click)="toggleActive(u)"
                    >
                      {{ u.active ? 'Deactivate' : 'Reactivate' }}
                    </button>
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    @if (showUserModal()) {
      <div class="admin-modal-backdrop">
        <div class="admin-modal" role="dialog" aria-modal="true">
          <h2 class="vits-heading">{{ editingUser() ? 'Edit User' : 'Create User' }}</h2>
          <form (ngSubmit)="saveUser()">
            @if (!editingUser()) {
              <div class="admin-field">
                <label for="u-id">University ID</label>
                <input id="u-id" class="admin-input" name="universityId" [(ngModel)]="formUniversityId" required />
              </div>
              <div class="admin-field">
                <label for="u-email">Email</label>
                <input id="u-email" class="admin-input" type="email" name="email" [(ngModel)]="formEmail" required />
              </div>
            }
            <div class="admin-field">
              <label for="u-name">Full Name</label>
              <input id="u-name" class="admin-input" name="fullName" [(ngModel)]="formFullName" required />
            </div>
            <div class="admin-field">
              <label for="u-role">Role</label>
              <select id="u-role" class="admin-select" name="role" [(ngModel)]="formRole">
                <option value="student">Student</option>
                <option value="oic">OIC</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div class="admin-field">
              <label for="u-dept">Department</label>
              <input id="u-dept" class="admin-input" name="department" [(ngModel)]="formDepartment" required />
            </div>
            <div class="vits-row" style="justify-content: flex-end;">
              <button type="button" class="admin-btn secondary" (click)="showUserModal.set(false)">Cancel</button>
              <button type="submit" class="admin-btn" [disabled]="saving()">Save</button>
            </div>
          </form>
        </div>
      </div>
    }

    @if (showCsvModal()) {
      <div class="admin-modal-backdrop">
        <div class="admin-modal" role="dialog" aria-modal="true">
          <div class="vits-row" style="margin-bottom: var(--vits-space-3);">
            <h2 class="vits-heading" style="margin: 0;">Bulk CSV User Import</h2>
            <button type="button" class="admin-btn secondary sm" (click)="loadSampleCsv()">Load Sample CSV</button>
          </div>

          <div class="admin-field">
            <label for="csv-file">Upload CSV File (or paste below)</label>
            <input id="csv-file" type="file" accept=".csv,text/csv" (change)="onCsvFileSelected($event)" />
          </div>

          <div class="admin-field">
            <label for="csv-text">CSV Content (university_id, full_name, email, role, department)</label>
            <textarea
              id="csv-text"
              class="admin-textarea"
              rows="5"
              [ngModel]="csvText()"
              (ngModelChange)="onCsvTextChange($event)"
            ></textarea>
          </div>

          @if (csvPreview().length > 0) {
            <div class="vits-muted" style="margin-bottom: var(--vits-space-2);">
              Preview: {{ validCsvCount() }} valid row(s), {{ invalidCsvCount() }} row(s) with errors
            </div>
            <div class="admin-table-wrap" style="margin-bottom: var(--vits-space-3);">
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Validation</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of csvPreview(); track row.rowNumber) {
                    <tr>
                      <td>{{ row.rowNumber }}</td>
                      <td>{{ row.universityId }}</td>
                      <td>{{ row.fullName }}</td>
                      <td>{{ row.email }}</td>
                      <td>{{ row.role }}</td>
                      <td>
                        @if (row.errors.length === 0) {
                          <span class="vits-chip ok">Valid</span>
                        } @else {
                          <span class="vits-chip bad">{{ row.errors.join('; ') }}</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }

          @if (csvResult(); as res) {
            <div class="vits-banner duty">
              Imported {{ res.importedCount }} user(s), skipped {{ res.skippedCount }} invalid/duplicate row(s).
            </div>
          }

          <div class="vits-row" style="justify-content: flex-end;">
            <button type="button" class="admin-btn secondary" (click)="showCsvModal.set(false)">Close</button>
            <button
              type="button"
              class="admin-btn"
              [disabled]="saving() || validCsvCount() === 0"
              (click)="confirmCsvImport()"
            >
              Confirm Import ({{ validCsvCount() }})
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class UsersPage implements OnInit {
  private readonly api = inject(AdminApiService);
  private readonly auth = inject(AdminAuthService);

  readonly users = signal<UserProfileDto[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly feedback = signal<string | null>(null);

  readonly search = signal('');
  readonly roleFilter = signal<'all' | UserRole>('all');

  readonly showUserModal = signal(false);
  readonly editingUser = signal<UserProfileDto | null>(null);
  formUniversityId = '';
  formEmail = '';
  formFullName = '';
  formRole: UserRole = 'student';
  formDepartment = '';

  readonly showCsvModal = signal(false);
  readonly csvText = signal('');
  readonly csvPreview = signal<CsvImportRowDto[]>([]);
  readonly csvResult = signal<BulkCsvImportResultDto | null>(null);

  readonly validCsvCount = computed(
    () => this.csvPreview().filter((r) => r.errors.length === 0).length,
  );
  readonly invalidCsvCount = computed(
    () => this.csvPreview().filter((r) => r.errors.length > 0).length,
  );

  readonly filteredUsers = computed(() => {
    const q = this.search().trim().toLowerCase();
    const role = this.roleFilter();
    return this.users().filter((u) => {
      if (role !== 'all' && u.role !== role) return false;
      if (!q) return true;
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.universityId.toLowerCase().includes(q)
      );
    });
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.api.getUsers();
      this.users.set(res.users);
    } catch (err) {
      this.error.set(this.auth.extractErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  openCreateModal(): void {
    this.editingUser.set(null);
    this.formUniversityId = '';
    this.formEmail = '';
    this.formFullName = '';
    this.formRole = 'student';
    this.formDepartment = '';
    this.showUserModal.set(true);
  }

  openEditModal(u: UserProfileDto): void {
    this.editingUser.set(u);
    this.formUniversityId = u.universityId;
    this.formEmail = u.email;
    this.formFullName = u.fullName;
    this.formRole = u.role;
    this.formDepartment = u.department;
    this.showUserModal.set(true);
  }

  async saveUser(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const editing = this.editingUser();
      if (editing) {
        await this.api.updateUser(editing.id, {
          fullName: this.formFullName,
          role: this.formRole,
          department: this.formDepartment,
        });
        this.feedback.set(`Updated user ${this.formFullName}.`);
      } else {
        await this.api.createUser({
          universityId: this.formUniversityId,
          email: this.formEmail,
          fullName: this.formFullName,
          role: this.formRole,
          department: this.formDepartment,
        });
        this.feedback.set(`Created user ${this.formFullName}.`);
      }
      this.showUserModal.set(false);
      await this.load();
    } catch (err) {
      this.error.set(this.auth.extractErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  async toggleActive(u: UserProfileDto): Promise<void> {
    try {
      await this.api.updateUser(u.id, { active: !u.active });
      this.feedback.set(`${u.fullName} is now ${!u.active ? 'active' : 'deactivated'}.`);
      await this.load();
    } catch (err) {
      this.error.set(this.auth.extractErrorMessage(err));
    }
  }

  openCsvModal(): void {
    this.csvResult.set(null);
    this.showCsvModal.set(true);
  }

  loadSampleCsv(): void {
    this.onCsvTextChange(SAMPLE_CSV);
  }

  onCsvTextChange(text: string): void {
    this.csvText.set(text);
    this.csvPreview.set(parseUsersCsv(text));
    this.csvResult.set(null);
  }

  onCsvFileSelected(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => this.onCsvTextChange(String(reader.result ?? ''));
    reader.readAsText(file);
  }

  async confirmCsvImport(): Promise<void> {
    this.saving.set(true);
    try {
      const res = await this.api.importUsersCsv(this.csvPreview());
      this.csvResult.set(res);
      await this.load();
    } catch (err) {
      this.error.set(this.auth.extractErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
