export {};

type UserType = 'admin' | 'guest';

export interface BaseAuthPayload {
  type: UserType;
  iat?: number;
  exp?: number;
}