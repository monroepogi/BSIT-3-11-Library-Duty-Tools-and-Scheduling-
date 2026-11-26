export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type DbUserRole = 'STUDENT' | 'OIC' | 'ADMIN';
export type DbShiftStatus = 'Scheduled' | 'Completed' | 'Missed';
export type DbTaskType = 'Shelving' | 'Circulation' | 'Inventory';
export type DbTaskStatus = 'Assigned' | 'In Progress' | 'Done' | 'Verified';
export type DbRequestKind = 'Swap' | 'Leave';
export type DbRequestStatus = 'Pending OIC' | 'Endorsed' | 'Approved' | 'Rejected';
export type DbVisitorKind = 'Visitor' | 'Baggage' | 'Paper';

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: '12';
  };
  public: {
    Tables: {
      library_sections: {
        Row: {
          id: string;
          code: string;
          name: string;
          location: string;
          created_at: string;
        };
        Insert: {
          id: string;
          code: string;
          name: string;
          location: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          location?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          auth_user_id: string | null;
          university_id: string;
          email: string;
          full_name: string;
          role: DbUserRole;
          department: string;
          done_hours: number;
          required_hours: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id?: string | null;
          university_id: string;
          email: string;
          full_name: string;
          role: DbUserRole;
          department?: string;
          done_hours?: number;
          required_hours?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          auth_user_id?: string | null;
          university_id?: string;
          email?: string;
          full_name?: string;
          role?: DbUserRole;
          department?: string;
          done_hours?: number;
          required_hours?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      section_memberships: {
        Row: {
          profile_id: string;
          section_id: string;
        };
        Insert: {
          profile_id: string;
          section_id: string;
        };
        Update: {
          profile_id?: string;
          section_id?: string;
        };
        Relationships: [];
      };
      shifts: {
        Row: {
          id: number;
          day_label: string;
          shift_date: string;
          start_time: string;
          end_time: string;
          section: string;
          section_id: string | null;
          oic_name: string;
          student_name: string;
          student_profile_id: string | null;
          status: DbShiftStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          day_label: string;
          shift_date: string;
          start_time: string;
          end_time: string;
          section: string;
          section_id?: string | null;
          oic_name: string;
          student_name: string;
          student_profile_id?: string | null;
          status?: DbShiftStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          day_label?: string;
          shift_date?: string;
          start_time?: string;
          end_time?: string;
          section?: string;
          section_id?: string | null;
          oic_name?: string;
          student_name?: string;
          student_profile_id?: string | null;
          status?: DbShiftStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      attendance_logs: {
        Row: {
          id: number;
          student_name: string;
          student_profile_id: string | null;
          shift_id: number | null;
          clocked_in_at: string;
          clocked_out_at: string | null;
          is_active: boolean;
          scanned_by: string | null;
          verification_method: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          student_name: string;
          student_profile_id?: string | null;
          shift_id?: number | null;
          clocked_in_at?: string;
          clocked_out_at?: string | null;
          is_active?: boolean;
          scanned_by?: string | null;
          verification_method?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          student_name?: string;
          student_profile_id?: string | null;
          shift_id?: number | null;
          clocked_in_at?: string;
          clocked_out_at?: string | null;
          is_active?: boolean;
          scanned_by?: string | null;
          verification_method?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          id: number;
          title: string;
          type: DbTaskType;
          section: string;
          assigned_to: string;
          assigned_to_profile_id: string | null;
          shift_id: number | null;
          status: DbTaskStatus;
          created_by: string | null;
          completed_at: string | null;
          verified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          title: string;
          type: DbTaskType;
          section: string;
          assigned_to: string;
          assigned_to_profile_id?: string | null;
          shift_id?: number | null;
          status?: DbTaskStatus;
          created_by?: string | null;
          completed_at?: string | null;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          title?: string;
          type?: DbTaskType;
          section?: string;
          assigned_to?: string;
          assigned_to_profile_id?: string | null;
          shift_id?: number | null;
          status?: DbTaskStatus;
          created_by?: string | null;
          completed_at?: string | null;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      duty_requests: {
        Row: {
          id: number;
          kind: DbRequestKind;
          shift_id: number | null;
          shift_label: string;
          reason: string;
          requester: string;
          requester_profile_id: string | null;
          submitted_on: string;
          attachment_name: string | null;
          status: DbRequestStatus;
          endorsed_by: string | null;
          endorsed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          kind: DbRequestKind;
          shift_id?: number | null;
          shift_label: string;
          reason: string;
          requester: string;
          requester_profile_id?: string | null;
          submitted_on: string;
          attachment_name?: string | null;
          status?: DbRequestStatus;
          endorsed_by?: string | null;
          endorsed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          kind?: DbRequestKind;
          shift_id?: number | null;
          shift_label?: string;
          reason?: string;
          requester?: string;
          requester_profile_id?: string | null;
          submitted_on?: string;
          attachment_name?: string | null;
          status?: DbRequestStatus;
          endorsed_by?: string | null;
          endorsed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      visitor_entries: {
        Row: {
          id: number;
          name: string;
          kind: DbVisitorKind;
          detail: string;
          entry_time: string;
          returned: boolean | null;
          section: string | null;
          recorded_by: string | null;
          deleted_at: string | null;
          delete_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          name: string;
          kind: DbVisitorKind;
          detail: string;
          entry_time: string;
          returned?: boolean | null;
          section?: string | null;
          recorded_by?: string | null;
          deleted_at?: string | null;
          delete_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          name?: string;
          kind?: DbVisitorKind;
          detail?: string;
          entry_time?: string;
          returned?: boolean | null;
          section?: string | null;
          recorded_by?: string | null;
          deleted_at?: string | null;
          delete_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      clock_in_student: {
        Args: {
          p_student_name: string;
          p_scanned_by?: string | null;
        };
        Returns: string;
      };
      clock_out_student: {
        Args: {
          p_student_name: string;
        };
        Returns: string;
      };
    };
  };
}

export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type ShiftRow = Database['public']['Tables']['shifts']['Row'];
export type AttendanceLogRow = Database['public']['Tables']['attendance_logs']['Row'];
export type TaskRow = Database['public']['Tables']['tasks']['Row'];
export type DutyRequestRow = Database['public']['Tables']['duty_requests']['Row'];
export type VisitorEntryRow = Database['public']['Tables']['visitor_entries']['Row'];
