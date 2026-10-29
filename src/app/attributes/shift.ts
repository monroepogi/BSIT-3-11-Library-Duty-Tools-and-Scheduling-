export interface Shift {
  id: number;
  day: string;          // Mon..Sun
  date: string;         // 'Oct 28'
  startTime: string;
  endTime: string;
  section: string;
  oic: string;
  student: string;
  status: 'Scheduled' | 'Completed' | 'Missed';
}
