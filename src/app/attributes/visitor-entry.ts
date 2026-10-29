export interface VisitorEntry {
  id: number;
  name: string;
  kind: 'Visitor' | 'Baggage' | 'Paper';
  detail: string;
  time: string;
  returned?: boolean;   // papers only
}
