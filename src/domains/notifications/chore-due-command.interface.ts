export interface ChoreDueCommandV1 {
  version: 1;
  type: 'CHORE_DUE';
  choreId: string;
  expectedDueDate: string;
  expectedAssigneeId: string;
}
