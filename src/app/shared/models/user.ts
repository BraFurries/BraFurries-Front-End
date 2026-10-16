export interface User {
  id: number;
  name: string;
  email: string;
  profileImageUrl?: string | null;
  roles: string[];
  permissions: string[];
}