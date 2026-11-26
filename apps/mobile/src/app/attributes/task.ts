export interface Task {
  id: number;
  title: string;
  type: 'Shelving' | 'Circulation' | 'Inventory';
  section: string;
  assignedTo: string;
  status: 'Assigned' | 'In Progress' | 'Done' | 'Verified';
}
