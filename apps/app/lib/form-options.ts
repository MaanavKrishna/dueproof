/** Select options shared by setup and Settings. */
export const COUNTRY_OPTIONS = [
  { value: "IN", label: "India" },
  { value: "AE", label: "United Arab Emirates" },
  { value: "SG", label: "Singapore" },
  { value: "GB", label: "United Kingdom" },
  { value: "US", label: "United States" },
];

export const TIMEZONE_OPTIONS = [
  { value: "Asia/Kolkata", label: "India (IST, UTC+5:30)" },
  { value: "Asia/Dubai", label: "Gulf (GST, UTC+4)" },
  { value: "Asia/Singapore", label: "Singapore (SGT, UTC+8)" },
  { value: "Europe/London", label: "London (UK time)" },
  { value: "America/New_York", label: "New York (US Eastern)" },
];

export const FY_OPTIONS = [
  { value: "4", label: "April – March (India)" },
  { value: "1", label: "January – December" },
  { value: "7", label: "July – June" },
  { value: "10", label: "October – September" },
];

export const ROLE_OPTIONS = [
  { value: "admin", label: "Admin — manages people and settings" },
  { value: "manager", label: "Manager — assigns work, approves replies" },
  { value: "member", label: "Member — works on notices" },
  { value: "viewer", label: "Viewer — reads only" },
];

export const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  member: "Member",
  viewer: "Viewer",
};

export const WEEKDAYS = [
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
  { value: 7, short: "Sun", label: "Sunday" },
];
