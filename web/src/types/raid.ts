export type RaidType = 'Mirror' | 'Stripe' | 'Concat';
export type RaidStatus = 'Online' | 'Degraded' | 'Offline' | 'Rebuilding';
export type MemberStatus = 'Online' | 'Failed' | 'Spare' | 'Rebuilding';

export interface RaidMember {
  index: number;
  deviceNode: string;
  uuid: string;
  status: MemberStatus;
  size: number;
}

export interface RaidSet {
  uniqueId: string;
  name: string;
  type: RaidType;
  status: RaidStatus;
  size: number;
  deviceNode: string;
  rebuild: string;
  members: RaidMember[];
}

export interface CreateRaidRequest {
  type: 'mirror' | 'stripe' | 'concat';
  name: string;
  disks: string[];
}

export interface AddMemberRequest {
  disk: string;
  asSpare?: boolean;
}

export interface RemoveMemberRequest {
  disk: string;
}

export interface RepairRaidRequest {
  disk: string;
}
