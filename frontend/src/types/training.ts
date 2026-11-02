// Kiểu dữ liệu khu quản trị – lớp tập huấn và danh sách đăng ký.

export interface TrainingRow {
  id: number;
  title: string;
  heldOn: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  location: string | null;
  trainer: string | null;
  enrolled: number;
  capacity: number;
  completed: boolean;
  description?: string | null;
}

export type TrainingCourseRecord = TrainingRow;

export interface TrainingInput {
  title: string;
  heldOn: string | null;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  trainer: string | null;
  capacity: number;
  description: string | null;
  completed: boolean;
}

export type RegistrationStatus = "registered" | "attended" | "absent" | "cancelled";

export interface TrainingRegistration {
  id: number;
  courseId?: number;
  householdId: number;
  householdName?: string | null;
  householdCode?: string | null;
  villageName?: string | null;
  phone?: string | null;
  status: RegistrationStatus;
  registeredAt?: string | null;
  updatedAt?: string | null;
}
