import { Icon, type IconName } from "./Icons";

/**
 * Small pictorial pieces: an icon tile for lists and cards, a quiet icon badge for empty states, and the
 * product's emblem. Kept deliberately plain — they label, they don't decorate.
 */

export type RowName =
  | "overview" | "students" | "upload" | "issues" | "submit" | "records" | "integration" | "activity"
  | "institutions" | "duplicates" | "reports" | "audit" | "rules" | "lookup"
  | "verify" | "requests" | "me" | "sharing" | "views";

export const ROW_ICON: Record<RowName, IconName> = {
  overview: "Dashboard", students: "Users", upload: "Upload", issues: "Warning", submit: "Send", records: "Certificate",
  integration: "Api", activity: "History", institutions: "Building", duplicates: "Files", reports: "Chart", audit: "Fingerprint",
  rules: "Sliders", lookup: "FileSearch", verify: "Shield", requests: "Inbox", me: "User", sharing: "Share", views: "Eye",
};

/** An icon on a soft navy tile. */
export function RowCard({ name, size = 36 }: { name: RowName; size?: number }) {
  const G = Icon[ROW_ICON[name]];
  return <span className="icon-tile" style={{ width: size, height: size }}><G size={Math.round(size * 0.5)} /></span>;
}

export type SceneName = "clear" | "upload" | "search" | "consent" | "record" | "empty" | "submitted";

const SCENE: Record<SceneName, { icon: IconName; tone: string }> = {
  clear: { icon: "CheckCircle", tone: "ok" }, upload: { icon: "Upload", tone: "info" }, search: { icon: "Search", tone: "muted" },
  consent: { icon: "LockKey", tone: "info" }, record: { icon: "Certificate", tone: "info" }, empty: { icon: "Files", tone: "muted" },
  submitted: { icon: "Send", tone: "ok" },
};

/** The badge above an empty state's title. */
export function Scene({ name }: { name: SceneName; size?: number }) {
  const s = SCENE[name];
  const G = Icon[s.icon];
  return <span className={`scene tone-${s.tone}`} aria-hidden><G size={26} strokeWidth={1.6} /></span>;
}

/** The emblem: a navy shield-cut square holding an ID card, with one saffron rule. Matches /public/icon.svg. */
export function BrandIcon({ size = 32 }: { size?: number }) {
  return (
    <svg className="brand-icon" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="12" fill="#1f4b85" />
      <rect x="0.5" y="0.5" width="63" height="63" rx="11.5" fill="none" stroke="rgba(255,255,255,0.18)" />
      <rect x="13" y="18" width="38" height="28" rx="4" fill="#fff" />
      <rect x="13" y="18" width="38" height="5" rx="2" fill="#e07b24" />
      <circle cx="24" cy="32.5" r="4.4" fill="#1f4b85" />
      <rect x="18.5" y="39" width="11" height="2.8" rx="1.4" fill="#1f4b85" />
      <rect x="33" y="29" width="13" height="2.8" rx="1.4" fill="#9fb3cf" />
      <rect x="33" y="34.5" width="9" height="2.8" rx="1.4" fill="#9fb3cf" />
    </svg>
  );
}
