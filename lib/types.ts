export interface Room {
  id: string;
  name: string;
  floor: number;
  capacity: number;
}

export interface BookingUser {
  id: string;
  name: string;
  email: string;
}

export interface Booking {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  roomId: string;
  room: Room;
  user: BookingUser;
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
}

export interface TimeSlot {
  start: Date;
  end: Date;
}
