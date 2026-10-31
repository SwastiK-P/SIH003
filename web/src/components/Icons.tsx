import { HugeiconsIcon, type HugeiconsIconProps, type IconSvgElement } from "@hugeicons/react";
import {
  Add01Icon, Search01Icon, ArrowLeft01Icon, ArrowRight01Icon, ArrowDown01Icon, Cancel01Icon, Tick02Icon, Alert02Icon, AlertCircleIcon,
  InformationCircleIcon, Download01Icon, Upload01Icon, Copy01Icon, Edit02Icon, Delete02Icon, PrinterIcon, QrCodeIcon, SecurityCheckIcon,
  Key01Icon, Logout01Icon, Menu01Icon, MoreHorizontalIcon, RefreshIcon, LinkSquare02Icon, UnfoldMoreIcon, CheckmarkCircle02Icon,
  Clock01Icon, FilterIcon, File02Icon, LoaderCircleIcon, SquareLock02Icon, ViewIcon, ArrowUpRight01Icon, SlidersHorizontalIcon,
  DashboardSquare01Icon, UserGroupIcon, SentIcon, Certificate01Icon, ApiIcon, Building03Icon, Analytics01Icon, InboxIcon, UserIcon,
  Share08Icon, Files01Icon, UserCircleIcon, Database01Icon, FingerPrintIcon, LockKeyIcon, UserCheck01Icon, WorkHistoryIcon, FileSearchIcon,
  TaskDone01Icon, LicenseIcon, CheckListIcon,
} from "@hugeicons/core-free-icons";

export type IconProps = Omit<HugeiconsIconProps, "icon" | "altIcon" | "showAlt">;

const glyph = (icon: IconSvgElement) => ({ strokeWidth = 1.7, size = 18, ...p }: IconProps) => <HugeiconsIcon icon={icon} strokeWidth={strokeWidth} size={size} aria-hidden {...p} />;

/** Keyed by meaning, so pages never import the icon library directly. */
export const Icon = {
  Plus: glyph(Add01Icon), Search: glyph(Search01Icon), Back: glyph(ArrowLeft01Icon), Next: glyph(ArrowRight01Icon), Down: glyph(ArrowDown01Icon),
  Close: glyph(Cancel01Icon), Check: glyph(Tick02Icon), Warning: glyph(Alert02Icon), Error: glyph(AlertCircleIcon), Info: glyph(InformationCircleIcon),
  Download: glyph(Download01Icon), Upload: glyph(Upload01Icon), Copy: glyph(Copy01Icon), Edit: glyph(Edit02Icon), Trash: glyph(Delete02Icon),
  Print: glyph(PrinterIcon), QR: glyph(QrCodeIcon), Shield: glyph(SecurityCheckIcon), Key: glyph(Key01Icon), SignOut: glyph(Logout01Icon),
  Menu: glyph(Menu01Icon), More: glyph(MoreHorizontalIcon), Refresh: glyph(RefreshIcon), External: glyph(LinkSquare02Icon), UpDown: glyph(UnfoldMoreIcon),
  CheckCircle: glyph(CheckmarkCircle02Icon), Clock: glyph(Clock01Icon), Filter: glyph(FilterIcon), File: glyph(File02Icon), Spinner: glyph(LoaderCircleIcon),
  Lock: glyph(SquareLock02Icon), Eye: glyph(ViewIcon), Arrow: glyph(ArrowUpRight01Icon), Sliders: glyph(SlidersHorizontalIcon),
  Dashboard: glyph(DashboardSquare01Icon), Users: glyph(UserGroupIcon), Send: glyph(SentIcon), Certificate: glyph(Certificate01Icon),
  Api: glyph(ApiIcon), Building: glyph(Building03Icon), Chart: glyph(Analytics01Icon), Inbox: glyph(InboxIcon), User: glyph(UserIcon),
  Share: glyph(Share08Icon), Files: glyph(Files01Icon), Account: glyph(UserCircleIcon), Database: glyph(Database01Icon),
  Fingerprint: glyph(FingerPrintIcon), LockKey: glyph(LockKeyIcon), UserCheck: glyph(UserCheck01Icon), History: glyph(WorkHistoryIcon),
  FileSearch: glyph(FileSearchIcon), Done: glyph(TaskDone01Icon), License: glyph(LicenseIcon), Checklist: glyph(CheckListIcon),
};
export type IconName = keyof typeof Icon;
