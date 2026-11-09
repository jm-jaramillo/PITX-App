// Field names follow the CTS tab of the PITX App Work Program.

export type Status = "Active" | "Inactive";

export interface Province {
  id: string;
  code: string;
  description: string;
  status: Status;
}

export interface Town {
  id: string;
  code: string;
  description: string;
  provinceId: string;
  status: Status;
}

export interface Company {
  id: string;
  code: string;
  name: string;
  description?: string;
  logo?: string;
  registrationNo: string;
  ptuNo: string;
  tin: string;
  serialNo?: string;
  minNo?: string;
  ticketCode: string;
  advanceDays: number;
  address: string;
  contactPerson: string;
  mobileNo: string;
  status: Status;
}

export interface Counter {
  id: string;
  code: string;
  description: string;
  ticketCode: string;
  kiosk: boolean;
  townId: string;
  allowInternet?: boolean;
  counterDisplay?: boolean;
  kioskDisplay?: boolean;
  remark?: string;
  status: Status;
}

export interface BusType {
  id: string;
  companyId: string;
  code: string;
  description: string;
  layoutId: string;
  blockedSeats?: string; // e.g. "44, 45" for CR seats
  remark?: string;
  status: Status;
}

export const CHARTER_TYPES = ["Not Chartered", "Monthly Chartered", "Special Chartered"] as const;
export type Charter = (typeof CHARTER_TYPES)[number];

export interface Bus {
  id: string;
  companyId: string;
  plateNo: string;
  description: string;
  busTypeId: string;
  aircon: boolean;
  charter?: Charter;
  status: Status;
}

/** Route setup for one counter. Blank fares fall back to the route's fares. */
export interface CounterFare {
  counterId: string;
  selling: boolean;
  adult?: number;
  student?: number;
  senior?: number;
  pwd?: number;
}

export interface Route {
  id: string;
  companyId: string;
  operatorRouteId: string;
  code: string;
  description: string;
  denomination?: string; // Route group, e.g. BICOL or NORTHERN ROUTES
  provinceId: string;
  townId?: string; // Destination town
  mileage: number;
  price: number; // Adult fare
  // Blank category fares fall back to 20% off the Adult fare.
  studentFare?: number;
  seniorFare?: number;
  pwdFare?: number;
  message?: string; // "Msg to Cust", printed on the boarding pass
  authorizedAgent?: string;
  seatConfirm?: boolean;
  counterFares?: CounterFare[];
  status: Status;
}

export const TRIP_STATUSES = ["Scheduled", "Boarding", "Departed", "Cancelled"] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export interface Trip {
  id: string;
  tripNo: string;
  date: string; // YYYY-MM-DD, Asia/Manila
  time: string; // HH:mm
  routeId: string;
  busId: string; // Empty until the Operator Admin assigns the unit
  bay: string;
  status: TripStatus;
  stopSelling?: boolean;
  remark?: string;
  cancelRemark?: string;
  seatMarks?: SeatMark[];
  holds?: SeatHold[];
}

/** A seat someone picked but hasn't paid for yet. Nobody else can pick it until it runs out. */
export interface SeatHold {
  seatNo: number;
  holder: string; // holderKey() of the teller, admin or passenger
  holderName: string;
  until: string; // ISO timestamp
}

export const FARE_TYPES = ["Adult", "Student", "Senior", "PWD"] as const;
export type FareType = (typeof FARE_TYPES)[number];

export const PAYMENT_METHODS = ["Cash", "Card", "E-Wallet"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// Reserved = paid, at the counter or online, so the seat is the passenger's. Booked and
// Issued were merged into it at the 9 Nov review. Picked but unpaid seats are SeatHolds.
export type TicketStatus = "Reserved" | "Boarded" | "Voided";
export type TicketSource = "Counter" | "Online";

export interface Ticket {
  id: string;
  ticketNo: string;
  groupId?: string; // Tickets bought together in one payment
  source: TicketSource;
  bookingRef?: string;
  tripId: string;
  counterId?: string;
  soldBy?: string;
  seatNo: number;
  passengerName: string;
  // Personal details: keep these and idNo off printed passes, manifests and exports.
  contactNo?: string;
  email?: string;
  fareType: FareType;
  fare: number;
  idNo?: string; // Discount ID
  paymentMethod: PaymentMethod;
  tendered?: number;
  paymentRef?: string;
  issuedAt: string; // ISO timestamp
  status: TicketStatus;
  voidReason?: string;
  voidedBy?: string;
  refundAmount?: number;
  refundMethod?: PaymentMethod;
  refundRef?: string;
  refundCategory?: string;
  insurance?: number;
  printed?: boolean;
  reprints?: TicketReprint[];
  bookedBy?: string; // Passenger account that bought it online
}

export interface TicketReprint {
  at: string;
  by: string;
  counterId?: string;
  category: string;
  remark: string;
  charge: number;
}

export type ApprovalMode = "None" | "Admin" | "Password";

/** Set by the PITX Admin on the System Parameters screen. */
export interface SystemParams {
  defaultCounterId: string;
  counterCutoffMinutes: number; // Stop selling at counters this long before departure
  kioskCutoffMinutes: number;
  checkInBeforeMinutes: number; // Gate window around departure
  checkInAfterMinutes: number;
  insurancePrice: number; // Added per ticket
  seatTransferCheckRoute: boolean; // Only transfer within the same route
  refundCutoffHours: number; // Closer than this, a Teller needs the PITX Admin
  refundPercent: number;
  refundApproval: ApprovalMode;
  refundReasons: string[];
  reprintAllowed: boolean;
  reprintCharge: number;
  reprintApproval: ApprovalMode;
  reprintReasons: string[];
  seatHoldMinutes: number; // How long a picked, unpaid seat stays held
  approvalPassword: string; // Demo only: real accounts must replace this
}

export interface ApprovalRequest {
  id: string;
  type: "Refund" | "Reprint";
  ticketId: string;
  category: string;
  remark: string;
  requestedBy: string;
  counterId?: string;
  requestedAt: string;
  status: "Pending" | "Approved" | "Rejected";
  decidedBy?: string;
  refundMethod?: PaymentMethod;
  refundRef?: string;
  passengerName?: string;
  contactNo?: string;
}

export interface CloseCode {
  code: string;
  issuedAt: string;
  issuedBy: string;
  used: boolean;
}

export interface SalesClosing {
  id: string;
  date: string;
  teller: string;
  counterId: string;
  closedAt: string;
  tellerCount: number;
  // Filled when Account submits its own count, which is when the totals become visible.
  accountCount?: number;
  accountBy?: string;
  systemCash?: number;
  reconciledAt?: string;
}

export const SEAT_MARK_TYPES = ["Permanent Block", "Temporary Block", "Temporary Release"] as const;
export type SeatMarkType = (typeof SEAT_MARK_TYPES)[number];

export interface SeatMark {
  id: string;
  seatNo: number;
  type: SeatMarkType;
  until?: string; // ISO timestamp for temporary marks
}

// The five users from the 9 Nov review (see roles.ts). Portal operator accounts
// (e.g. genesis-ops) are Operator Admins of their own company.
export const ROLES = ["PITX Admin", "PITX Cashier", "Operator Admin", "Teller", "Passenger"] as const;
export type Role = (typeof ROLES)[number];

export interface Session {
  name: string;
  role: Role;
  counterId?: string;
  companyId?: string; // Set for operator staff, who only see their own company
}

export interface AuditEntry {
  id: string;
  at: string; // ISO timestamp
  by: string;
  action: string;
  ticketId?: string;
  tripId?: string;
  detail: string;
}

export interface Db {
  provinces: Province[];
  towns: Town[];
  companies: Company[];
  counters: Counter[];
  busTypes: BusType[];
  buses: Bus[];
  routes: Route[];
  trips: Trip[];
  tickets: Ticket[];
  audit: AuditEntry[];
  session: Session | null;
  settings: SystemParams;
  requests: ApprovalRequest[];
  closeCodes: CloseCode[];
  closings: SalesClosing[];
  source?: "sample" | "pitx"; // pitx: masterfiles and trips read from the other modules (live.ts)
  loadedAt?: string; // ISO timestamp of the last read from PITX
}
