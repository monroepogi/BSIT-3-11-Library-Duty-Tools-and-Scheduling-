export interface DutyRequest {
  id: number;
  kind: 'Swap' | 'Leave';
  shiftLabel: string;
  reason: string;
  requester: string;
  submittedOn: string;
  status: 'Pending OIC' | 'Endorsed' | 'Approved' | 'Rejected';
}
