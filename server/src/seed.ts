import { createApiKey } from "./auth.js";
import { audit } from "./audit.js";
import { issue } from "./credentials.js";
import { all, bump, db, get, run, setRules, tx, DEFAULT_RULES } from "./db.js";

/**
 * Sandbox data: fictional institutions and students with the kinds of mistakes and patterns real
 * submissions carry, so every check and dashboard has something true to show. Deterministic.
 */

let seed = 20260724;
const rand = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const chance = (p: number) => rand() < p;
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

const MALE = "Aarav Vivaan Aditya Arjun Sai Reyansh Krishna Ishaan Shaurya Atharv Ayaan Dhruv Kabir Rohan Aniket Pranav Siddharth Harsh Yash Karthik Rahul Varun Nikhil Abhishek Manish Tejas Omkar Rithvik Sanjay Vikram Naveen Gaurav Akash Deepak Arnav Rudra Parth Mihir Kunal Faizan Imran Arif Joel Kevin Gurpreet Harjot Lalit Chetan Tushar Suresh".split(" ");
const FEMALE = "Ananya Diya Saanvi Aadhya Ishita Kavya Myra Anika Riya Sneha Pooja Priya Shreya Nandini Meghana Aishwarya Divya Sakshi Tanvi Neha Aditi Pallavi Swati Bhavya Keerthana Lakshmi Harini Nisha Ritika Simran Zoya Fatima Ayesha Sara Mariam Jasleen Navneet Gauri Mrunal Janhavi Vaishnavi Sushmita Payal Komal Rashmi Deepika Anjali Isha Monika Pragya".split(" ");
const SURNAMES = "Sharma Verma Gupta Singh Kumar Patel Shah Mehta Joshi Desai Kulkarni Deshpande Patil Pawar Jadhav Reddy Rao Naidu Iyer Iyengar Nair Menon Pillai Krishnan Subramanian Banerjee Chatterjee Mukherjee Das Ghosh Bose Sen Mishra Tiwari Pandey Dubey Yadav Chauhan Rathore Thakur Bhat Hegde Shetty Kamath Gowda Khan Ahmed Qureshi Siddiqui Fernandes D'Souza Gill Sandhu Kaur Grewal Saxena Agarwal Jain Bansal Goyal Malhotra Kapoor Khanna Sinha Jha Prasad Mohanty Panda Behera Barua Bora Lyngdoh Sangma".split(" ");

interface InstDef { name: string; city: string; state: string; type: string; university: string; est: number }

const INSTITUTIONS: InstDef[] = [
  { name: "Kaveri Institute of Technology", city: "Bengaluru", state: "Karnataka", type: "Engineering", university: "Visvesvaraya Technological University", est: 2001 },
  { name: "Sahyadri College of Engineering and Management", city: "Pune", state: "Maharashtra", type: "Engineering", university: "Savitribai Phule Pune University", est: 1998 },
  { name: "Ganga Valley Institute of Management", city: "Lucknow", state: "Uttar Pradesh", type: "PGDM", university: "Autonomous (PGDM)", est: 2006 },
  { name: "Deccan Plateau Institute of Engineering", city: "Hyderabad", state: "Telangana", type: "Engineering", university: "Jawaharlal Nehru Technological University", est: 2008 },
  { name: "Coromandel College of Pharmacy", city: "Chennai", state: "Tamil Nadu", type: "Pharmacy", university: "The Tamil Nadu Dr. M.G.R. Medical University", est: 2003 },
  { name: "Aravalli School of Architecture", city: "Jaipur", state: "Rajasthan", type: "Architecture", university: "Rajasthan Technical University", est: 2011 },
  { name: "Brahmaputra Institute of Technology", city: "Guwahati", state: "Assam", type: "Engineering", university: "Assam Science and Technology University", est: 2009 },
  { name: "Malwa Polytechnic Institute", city: "Indore", state: "Madhya Pradesh", type: "Diploma", university: "RGPV (Diploma Board)", est: 1994 },
  { name: "Konkan Institute of Management Studies", city: "Mumbai", state: "Maharashtra", type: "PGDM", university: "Autonomous (PGDM)", est: 2002 },
  { name: "Periyar Valley College of Engineering", city: "Kochi", state: "Kerala", type: "Engineering", university: "APJ Abdul Kalam Technological University", est: 2002 },
  { name: "Satpura Institute of Technology", city: "Bhopal", state: "Madhya Pradesh", type: "Engineering", university: "Rajiv Gandhi Proudyogiki Vishwavidyalaya", est: 2007 },
  { name: "Kalinga Coast Institute of Engineering", city: "Bhubaneswar", state: "Odisha", type: "Engineering", university: "Biju Patnaik University of Technology", est: 2005 },
  { name: "Doaba Institute of Engineering and Technology", city: "Jalandhar", state: "Punjab", type: "Engineering", university: "I.K. Gujral Punjab Technical University", est: 2004 },
  { name: "Sabarmati College of Computer Applications", city: "Ahmedabad", state: "Gujarat", type: "MCA", university: "Gujarat Technological University", est: 2010 },
  { name: "Hooghly Riverside Institute of Technology", city: "Kolkata", state: "West Bengal", type: "Engineering", university: "Maulana Abul Kalam Azad University of Technology", est: 2001 },
  { name: "Nilgiri College of Pharmacy", city: "Coimbatore", state: "Tamil Nadu", type: "Pharmacy", university: "The Tamil Nadu Dr. M.G.R. Medical University", est: 2006 },
  { name: "Godavari Institute of Engineering", city: "Rajahmundry", state: "Andhra Pradesh", type: "Engineering", university: "Jawaharlal Nehru Technological University, Kakinada", est: 2008 },
  { name: "Shivalik Institute of Management", city: "Dehradun", state: "Uttarakhand", type: "PGDM", university: "Autonomous (PGDM)", est: 2009 },
  { name: "Thar Desert College of Engineering", city: "Jodhpur", state: "Rajasthan", type: "Engineering", university: "Rajasthan Technical University", est: 2010 },
  { name: "Vindhya Institute of Technology", city: "Prayagraj", state: "Uttar Pradesh", type: "Engineering", university: "Dr. A.P.J. Abdul Kalam Technical University", est: 2006 },
  { name: "Mahanadi Polytechnic College", city: "Raipur", state: "Chhattisgarh", type: "Diploma", university: "CSVTU (Diploma Board)", est: 1999 },
  { name: "Tungabhadra College of Engineering", city: "Hubballi", state: "Karnataka", type: "Engineering", university: "Visvesvaraya Technological University", est: 2000 },
  { name: "Yamuna Institute of Engineering and Technology", city: "Gurugram", state: "Haryana", type: "Engineering", university: "Guru Jambheshwar University", est: 2007 },
  { name: "Cauvery Delta Institute of Technology", city: "Thanjavur", state: "Tamil Nadu", type: "Engineering", university: "Anna University", est: 2004 },
  { name: "Western Ghats School of Business", city: "Mangaluru", state: "Karnataka", type: "PGDM", university: "Autonomous (PGDM)", est: 2012 },
  { name: "Chambal Institute of Computer Applications", city: "Gwalior", state: "Madhya Pradesh", type: "MCA", university: "Rajiv Gandhi Proudyogiki Vishwavidyalaya", est: 2011 },
  { name: "Krishna Basin College of Engineering", city: "Vijayawada", state: "Andhra Pradesh", type: "Engineering", university: "Jawaharlal Nehru Technological University, Kakinada", est: 2009 },
  { name: "Narmada Institute of Pharmacy", city: "Vadodara", state: "Gujarat", type: "Pharmacy", university: "Gujarat Technological University", est: 2007 },
  { name: "Himalayan Foothills Institute of Technology", city: "Solan", state: "Himachal Pradesh", type: "Engineering", university: "Himachal Pradesh Technical University", est: 2010 },
  { name: "Sundarbans College of Engineering", city: "Durgapur", state: "West Bengal", type: "Engineering", university: "Maulana Abul Kalam Azad University of Technology", est: 2003 },
  { name: "Marathwada Institute of Technology and Research", city: "Aurangabad", state: "Maharashtra", type: "Engineering", university: "Dr. Babasaheb Ambedkar Technological University", est: 1999 },
  { name: "Bundelkhand Polytechnic", city: "Jhansi", state: "Uttar Pradesh", type: "Diploma", university: "BTEUP (Diploma Board)", est: 1996 },
  { name: "Mithila Institute of Technology", city: "Darbhanga", state: "Bihar", type: "Engineering", university: "Bihar Engineering University", est: 2012 },
  { name: "Lakeside School of Architecture", city: "Udaipur", state: "Rajasthan", type: "Architecture", university: "Rajasthan Technical University", est: 2014 },
  { name: "Capital Region Institute of Management", city: "Noida", state: "Uttar Pradesh", type: "PGDM", university: "Autonomous (PGDM)", est: 2005 },
  { name: "Vaigai Institute of Engineering", city: "Madurai", state: "Tamil Nadu", type: "Engineering", university: "Anna University", est: 2006 },
];

type P = [code: string, name: string, level: string, duration: number, intakes: number[]];
const PROGRAMMES: Record<string, P[]> = {
  Engineering: [
    ["CSE", "B.Tech Computer Science and Engineering", "UG", 4, [120, 180, 240]],
    ["AIDS", "B.Tech Artificial Intelligence and Data Science", "UG", 4, [60, 120]],
    ["ECE", "B.Tech Electronics and Communication Engineering", "UG", 4, [60, 120]],
    ["ME", "B.Tech Mechanical Engineering", "UG", 4, [60, 120]],
    ["CE", "B.Tech Civil Engineering", "UG", 4, [60]],
    ["EEE", "B.Tech Electrical and Electronics Engineering", "UG", 4, [60]],
    ["MTCS", "M.Tech Computer Science and Engineering", "PG", 2, [18, 24]],
    ["MBA", "MBA", "PG", 2, [60, 120]],
  ],
  PGDM: [
    ["PGDM", "PGDM", "PGDM", 2, [120, 180, 240]],
    ["PGDMF", "PGDM (Finance)", "PGDM", 2, [60]],
    ["PGDMB", "PGDM (Business Analytics)", "PGDM", 2, [60]],
  ],
  Pharmacy: [
    ["BPH", "B.Pharm", "UG", 4, [100]],
    ["MPH", "M.Pharm Pharmaceutics", "PG", 2, [15]],
    ["PHD", "Pharm.D", "UG", 6, [30]],
    ["DPH", "D.Pharm", "Diploma", 2, [60]],
  ],
  Architecture: [["BARCH", "B.Arch", "UG", 5, [40, 80]], ["MARCH", "M.Arch Urban Design", "PG", 2, [20]]],
  Diploma: [
    ["DCE", "Diploma in Civil Engineering", "Diploma", 3, [60]],
    ["DME", "Diploma in Mechanical Engineering", "Diploma", 3, [60]],
    ["DCS", "Diploma in Computer Engineering", "Diploma", 3, [60, 120]],
    ["DEE", "Diploma in Electrical Engineering", "Diploma", 3, [60]],
  ],
  MCA: [["MCA", "MCA", "PG", 2, [60, 120, 180]]],
};

const YEAR = DEFAULT_RULES.academic_year;
const TODAY = new Date("2026-10-24T11:30:00+05:30");

function apaar(used: Set<string>) {
  for (;;) { const id = String(int(1, 9)) + Array.from({ length: 11 }, () => int(0, 9)).join(""); if (!used.has(id)) { used.add(id); return id; } }
}
const iso = (d: Date) => d.toISOString();
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const between = (a: string, b: string) => new Date(new Date(a).getTime() + rand() * (new Date(b).getTime() - new Date(a).getTime()));
const phone = () => String(int(6, 9)) + Array.from({ length: 9 }, () => int(0, 9)).join("");
const slug = (n: string) => n.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");

/** A spelling the registry and the admission form disagree on: initial, order, one letter. */
function closeVariant(name: string) {
  const [f, ...rest] = name.split(" ");
  const r = rand();
  if (r < 0.35) return `${f[0]}. ${rest.join(" ")}`;
  if (r < 0.6) return `${rest.join(" ")} ${f}`;
  const i = int(1, f.length - 2);
  return `${f.slice(0, i)}${f[i] === "a" ? "aa" : f[i] + f[i]}${f.slice(i + 1)} ${rest.join(" ")}`;
}

export function seedAll() {
  for (const t of ["access_log", "consents", "credentials", "audit", "api_keys", "issue_notes", "conflict_notes", "submissions", "students", "intakes", "programs", "apaar_registry", "verifiers", "users", "institutions", "settings"]) run(`DELETE FROM ${t}`);
  run("DELETE FROM sqlite_sequence");
  setRules(DEFAULT_RULES);

  const used = new Set<string>();
  const events: { at: string; actor: any; action: string; opts: any }[] = [];
  const insertStudent = db.prepare(`INSERT INTO students (apaar_id, institution_id, program_id, academic_year, enrolment_no, name, dob, gender, social_category, quota, nationality, nri, oci, fn, passport_no, admission_date, year_of_study, status, email, phone, source, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertReg = db.prepare("INSERT OR REPLACE INTO apaar_registry (apaar_id, name, dob, gender, status) VALUES (?,?,?,?,?)");

  // Students who will show up at two institutions at once, collected as we go.
  const crossPool: any[] = [];

  tx(() => {
    INSTITUTIONS.forEach((d, idx) => {
      const id = `1-${pad(int(10000000, 99999999), 8)}${pad(idx, 2)}`;
      run("INSERT INTO institutions (id, name, city, state, type, university, established, email) VALUES (?,?,?,?,?,?,?,?)", id, d.name, d.city, d.state, d.type, d.university, d.est, `nodal@${slug(d.name.split(" ")[0])}.edu.in`);

      const catalog = PROGRAMMES[d.type];
      const count = d.type === "Engineering" ? int(4, 7) : Math.min(catalog.length, int(2, catalog.length));
      const chosen = idx === 0 ? catalog.slice(0, 7) : [catalog[0], ...catalog.slice(1).sort(() => rand() - 0.5).slice(0, count - 1)];
      const prefix = d.name.split(" ").filter((w) => /^[A-Z]/.test(w) && w.length > 2).map((w) => w[0]).join("").slice(0, 3);

      // Who this institution is, for the patterns it carries.
      const persona = idx === 0, overfill = idx === 3 || idx === 19, placeholder = idx === 7, foreignHeavy = idx === 8 || idx === 11,
        sloppy = idx === 15 || idx === 22, burst = idx === 3 || idx === 26, shared = idx === 3 || idx === 30;

      let serial = 0;
      chosen.forEach(([code, pname, level, duration, intakes]) => {
        const pid = `${id}-${code}`;
        run("INSERT INTO programs (id, institution_id, name, level, duration) VALUES (?,?,?,?,?)", pid, id, pname, level, duration);
        const approved = pick(intakes);
        let fill = overfill ? 1 + rand() * 0.14 : persona ? 0.86 + rand() * 0.12 : 0.62 + rand() * 0.36;
        if (persona && code === "AIDS") fill = 1.07;
        if (!overfill && !persona && chance(0.05)) fill = 1.02 + rand() * 0.05;
        const regular = Math.round(approved * fill);
        const lastYear = Math.round(approved * (overfill ? 0.58 + rand() * 0.1 : 0.6 + rand() * 0.35));
        run("INSERT INTO intakes (program_id, academic_year, approved, last_year_enrolled) VALUES (?,?,?,?)", pid, YEAR, approved, lastYear);
        run("INSERT INTO intakes (program_id, academic_year, approved, last_year_enrolled) VALUES (?,?,?,?)", pid, "2025-26", approved, null);

        const tfw = Math.floor(approved * (chance(0.5) ? rand() * 0.05 : 0));
        const fnSeats = foreignHeavy && code === catalog[0][0] ? Math.round(approved * 0.18) : chance(0.3) ? int(0, Math.max(1, Math.round(approved * 0.04))) : 0;
        const lateral = level === "UG" && d.type === "Engineering" && chance(0.4) ? int(1, Math.round(approved * 0.08)) : 0;
        const seats = [...Array(regular).fill("regular"), ...Array(tfw).fill("tfw"), ...Array(fnSeats).fill("fn_oci_pio"), ...Array(lateral).fill("lateral")];

        const pgAge = level === "PG" || level === "PGDM";
        const jan1 = new Map<string, string>();
        for (const quota of seats) {
          serial++;
          const female = chance(0.42);
          const first = pick(female ? FEMALE : MALE), last = pick(SURNAMES);
          const name = `${first} ${last}`;
          const by = pgAge ? int(2001, 2004) : quota === "lateral" ? int(2005, 2007) : level === "Diploma" ? int(2009, 2010) : int(2007, 2008);
          let dob = `${by}-${pad(int(1, 12))}-${pad(int(1, 28))}`;
          let regDob = dob;
          if (placeholder && chance(0.34)) { dob = `${by}-01-01`; regDob = dob; jan1.set(name, dob); }
          let nationality = "Indian", nri = 0, oci = 0, fn = 0, passport: string | null = null;
          if (quota === "fn_oci_pio") {
            const r = rand();
            if (r < 0.45) { fn = 1; nationality = pick(["Nepalese", "Bangladeshi", "Sri Lankan", "Afghan", "Nigerian", "Kenyan", "Bhutanese", "Mauritian"]); passport = `${pick(["N", "B", "S", "A", "K"])}${int(1000000, 9999999)}`; }
            else if (r < 0.92) { oci = 1; nationality = pick(["American", "British", "Canadian", "Australian", "Emirati"]); passport = `${pick(["US", "GB", "CA", "AU"])}${int(10000000, 99999999)}`; }
            else { nationality = "Indian"; /* CIWG: children of Indian workers in the Gulf */ }
          } else if (chance(0.012)) { nri = 1; }
          const adm = dateOnly(between(pgAge ? "2026-07-01" : "2026-07-20", "2026-09-20"));
          let createdAt = between("2026-08-05", "2026-10-21T18:00:00Z");
          if (burst && chance(0.62)) createdAt = between("2026-10-21T20:00:00Z", "2026-10-24T05:00:00Z");
          const sid = apaar(used);
          let apaarId: string | null = sid;
          let regName = name;
          const mistakeRate = sloppy ? 0.12 : persona ? 0.03 : 0.018;
          if (chance(mistakeRate)) {
            const r = rand();
            if (r < 0.28) apaarId = null;
            else if (r < 0.42) apaarId = sid.slice(0, 11);
            else if (r < 0.55) { apaarId = sid; regName = ""; /* not in registry */ }
            else if (r < 0.8) regName = closeVariant(name);
            else if (r < 0.92) regName = `${pick(female ? FEMALE : MALE)} ${pick(SURNAMES)}`;
            else regDob = `${by}-${pad(int(1, 12))}-${pad(int(1, 28))}`;
          }
          if (regName) insertReg.run(sid, regName, regDob, female ? "F" : "M", chance(0.002) ? "deactivated" : "active");
          const ph = shared && chance(0.05) ? (idx === 3 ? "9810012345" : "9440098765") : phone();
          const r = insertStudent.run(apaarId, id, pid, YEAR, `${prefix}26${code}${pad(serial, 3)}`, name, dob, female ? "F" : "M", pick(["GEN", "GEN", "GEN", "OBC", "OBC", "OBC", "SC", "ST", "EWS"]), quota, nationality, nri, oci, fn, passport, adm, quota === "lateral" ? 2 : 1, "active", `${slug(name)}${int(1, 99)}@example.in`, ph, chance(0.8) ? "upload" : "api", iso(createdAt), iso(createdAt));
          if (chance(0.0025) || (persona && serial % 140 === 7)) crossPool.push({ sid: Number(r.lastInsertRowid), apaar: sid, name, dob, inst: id, female });
        }
        // A probable duplicate: the same person keyed twice under two IDs.
        if (chance(persona ? 1 : 0.18)) {
          const s = get<any>("SELECT * FROM students WHERE program_id = ? ORDER BY RANDOM() LIMIT 1", pid);
          if (s) {
            serial++;
            const dup = apaar(used);
            insertReg.run(dup, s.name, s.dob, s.gender, "active");
            insertStudent.run(dup, id, pid, YEAR, `${prefix}26${code}${pad(serial, 3)}`, s.name, s.dob, s.gender, s.social_category, s.quota, s.nationality, 0, 0, 0, null, s.admission_date, 1, "active", s.email, s.phone, "upload", s.created_at, s.created_at);
          }
        }
      });

      // A few graduates from earlier cohorts, for verification.
      const firstProg = `${id}-${chosen[0][0]}`;
      const duration = chosen[0][3];
      const gradYear = 2026 - duration;
      for (let g = 0; g < 6; g++) {
        const female = chance(0.45);
        const name = persona && g === 0 ? "Ishita Rao" : `${pick(female || (persona && g === 0) ? FEMALE : MALE)} ${pick(SURNAMES)}`;
        const by = gradYear - 18;
        const dob = persona && g === 0 ? "2004-06-17" : `${by}-${pad(int(1, 12))}-${pad(int(1, 28))}`;
        const sid = persona && g === 0 ? "731846205519" : apaar(used);
        used.add(sid);
        insertReg.run(sid, name, dob, persona && g === 0 ? "F" : female ? "F" : "M", "active");
        const created = iso(between(`${gradYear}-08-10`, `${gradYear}-10-20`));
        insertStudent.run(sid, id, firstProg, `${gradYear}-${String(gradYear + 1).slice(2)}`, `${prefix}${String(gradYear).slice(2)}${chosen[0][0]}${pad(g + 1, 3)}`, name, dob, persona && g === 0 ? "F" : female ? "F" : "M", "GEN", "regular", "Indian", 0, 0, 0, null, `${gradYear}-08-0${int(1, 9)}`, duration, "graduated", `${slug(name)}@example.in`, phone(), "upload", created, iso(new Date("2026-07-15T10:00:00Z")));
      }

      // Inconsistencies a person would make by hand.
      if (persona || chance(0.4)) {
        const s = get<any>("SELECT id FROM students WHERE institution_id = ? AND academic_year = ? AND quota = 'regular' ORDER BY RANDOM() LIMIT 1", id, YEAR);
        if (s) run("UPDATE students SET fn = 1, nationality = 'Indian' WHERE id = ?", s.id);
      }
      if (persona) {
        const s = get<any>("SELECT id FROM students WHERE institution_id = ? AND academic_year = ? AND oci = 1 LIMIT 1", id, YEAR)
          ?? get<any>("SELECT id FROM students WHERE institution_id = ? AND academic_year = ? AND quota = 'regular' ORDER BY RANDOM() LIMIT 1", id, YEAR);
        run("UPDATE students SET oci = 1, nationality = 'American', passport_no = NULL WHERE id = ?", s!.id);
        const t = get<any>("SELECT id FROM students WHERE institution_id = ? AND academic_year = ? AND quota = 'regular' ORDER BY RANDOM() LIMIT 1", id, YEAR);
        run("UPDATE students SET admission_date = '2026-11-14' WHERE id = ?", t!.id);
      }
    });

    // The same student, active at two institutions.
    const insts = all<any>("SELECT id FROM institutions ORDER BY rowid");
    const progsBy = new Map<string, string[]>();
    for (const p of all<any>("SELECT id, institution_id FROM programs")) { const a = progsBy.get(p.institution_id) ?? []; a.push(p.id); progsBy.set(p.institution_id, a); }
    for (const c of crossPool) {
      let other = pick(insts).id;
      while (other === c.inst) other = pick(insts).id;
      const pid = pick(progsBy.get(other)!);
      const created = iso(between("2026-08-20", "2026-10-22"));
      insertStudent.run(c.apaar, other, pid, YEAR, `X26${int(1000, 9999)}`, c.name, c.dob, c.female ? "F" : "M", "GEN", "regular", "Indian", 0, 0, 0, null, dateOnly(between("2026-08-01", "2026-09-15")), 1, "active", null, phone(), "upload", created, created);
    }

    // Submissions: most have submitted, some were accepted, a few sent back.
    insts.forEach((inst, idx) => {
      const r = rand();
      let status = idx === 0 ? "draft" : idx === 3 ? "submitted" : r < 0.3 ? "draft" : r < 0.72 ? "submitted" : r < 0.92 ? "accepted" : "returned";
      if (idx === 26) status = "submitted";
      const last = get<any>("SELECT MAX(created_at) AS at, COUNT(*) AS n FROM students WHERE institution_id = ? AND academic_year = ?", inst.id, YEAR);
      const submittedAt = status === "draft" ? null : iso(new Date(new Date(last.at).getTime() + int(2, 30) * 3600_000));
      const reviewedAt = status === "accepted" || status === "returned" ? iso(new Date(new Date(submittedAt!).getTime() + int(20, 60) * 3600_000)) : null;
      run("INSERT INTO submissions (institution_id, academic_year, status, submitted_at, submitted_by, reviewed_at, reviewed_by, note, snapshot_count) VALUES (?,?,?,?,?,?,?,?,?)",
        inst.id, YEAR, status, submittedAt, submittedAt ? "Nodal officer" : null, reviewedAt, reviewedAt ? "Meera Iyer" : null,
        status === "returned" ? "Programme-wise counts don't match the intake on the approval letter. Please re-check M.Tech and resubmit." : null, submittedAt ? last.n : null);
      const actor = { id: `nodal-${idx}`, name: "Nodal officer", role: "institution", institution_id: inst.id };
      events.push({ at: iso(new Date(new Date(last.at).getTime() - 3600_000)), actor, action: "records.imported", opts: { entity: "institution", entityId: inst.id, institutionId: inst.id, detail: { rows: last.n, source: "upload" } } });
      if (submittedAt) events.push({ at: submittedAt, actor, action: "submission.submitted", opts: { entity: "submission", entityId: `${inst.id}/${YEAR}`, institutionId: inst.id, detail: { records: last.n } } });
      if (reviewedAt) events.push({ at: reviewedAt, actor: { id: "u-aicte", name: "Meera Iyer", role: "aicte" }, action: status === "accepted" ? "submission.accepted" : "submission.returned", opts: { entity: "submission", entityId: `${inst.id}/${YEAR}`, institutionId: inst.id } });
    });

    // Amended after submission: one institution keeps editing.
    const amender = insts[19].id;
    run("UPDATE students SET amended_after_submit = 1, updated_at = ? WHERE id IN (SELECT id FROM students WHERE institution_id = ? AND academic_year = ? ORDER BY RANDOM() LIMIT 7)", iso(TODAY), amender, YEAR);
  });

  // People
  const [kit] = all<any>("SELECT * FROM institutions ORDER BY rowid LIMIT 1");
  const verifiers = [
    ["v-northwind", "Northwind Analytics", "employer", "Bengaluru"],
    ["v-lakeview", "Lakeview University, Graduate Admissions", "university", "Pune"],
    ["v-scholar", "State Post-Matric Scholarship Cell", "government", "Bengaluru"],
  ];
  for (const v of verifiers) run("INSERT INTO verifiers (id, name, kind, city) VALUES (?,?,?,?)", ...v);
  const users = [
    ["u-aicte", "Meera Iyer", "Deputy Director, Approval Bureau", "meera.iyer@aicte.example", "aicte", null, null, null],
    ["u-inst", "Prakash Hegde", `Nodal officer, ${kit.name}`, "nodal@kaveri.edu.in", "institution", kit.id, null, null],
    ["u-verifier", "Farah Siddiqui", "Talent acquisition, Northwind Analytics", "farah@northwind.example", "verifier", null, "v-northwind", null],
    ["u-student", "Ishita Rao", "B.Tech Computer Science, class of 2026", "ishita.rao@example.in", "student", null, null, "731846205519"],
  ];
  for (const u of users) run("INSERT INTO users (id, name, title, email, role, institution_id, verifier_id, apaar_id) VALUES (?,?,?,?,?,?,?,?)", ...u);

  // Records already issued, consents asked for and given.
  const ishita = get<any>("SELECT * FROM students WHERE apaar_id = '731846205519'")!;
  const vc = issue(ishita, "Prakash Hegde");
  for (const g of all<any>("SELECT * FROM students WHERE status = 'graduated' AND id != ? ORDER BY RANDOM() LIMIT 30", ishita.id)) issue(g, "Nodal officer");
  run("INSERT INTO consents (id, apaar_id, verifier_id, purpose, fields, status, requested_at, decided_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?)",
    "c-lakeview", ishita.apaar_id, "v-lakeview", "M.Tech admission, document verification", JSON.stringify(["name", "programme", "institution", "status", "admission_year"]), "granted", "2026-09-02T09:12:00Z", "2026-09-02T09:40:00Z", "2026-12-01T00:00:00Z");
  run("INSERT INTO consents (id, apaar_id, verifier_id, purpose, fields, status, requested_at) VALUES (?,?,?,?,?,?,?)",
    "c-northwind", ishita.apaar_id, "v-northwind", "Pre-joining background check for Graduate Engineer role", JSON.stringify(["name", "dob", "programme", "institution", "status", "enrolment_no"]), "pending", "2026-10-23T15:05:00Z");
  run("INSERT INTO access_log (apaar_id, verifier_id, at, via, purpose) VALUES (?,?,?,?,?)", ishita.apaar_id, "v-lakeview", "2026-09-02T09:41:00Z", "consent", "M.Tech admission, document verification");
  run("INSERT INTO access_log (apaar_id, verifier_id, at, via, purpose) VALUES (?,?,?,?,?)", ishita.apaar_id, null, "2026-09-18T12:20:00Z", "credential", `Record ${vc.id} scanned`);

  events.push({ at: "2026-07-15T10:00:00Z", actor: { id: "u-inst", name: "Prakash Hegde", role: "institution", institution_id: kit.id }, action: "credential.issued", opts: { entity: "credential", entityId: vc.id, institutionId: kit.id } });
  events.sort((a, b) => a.at.localeCompare(b.at));
  tx(() => { for (const e of events) audit(e.actor, e.action, { ...e.opts, at: e.at }); });
  createApiKey(kit.id, "Campus ERP (sandbox)");
  bump();
  const n = get<any>("SELECT COUNT(*) AS n FROM students")!.n;
  return { institutions: INSTITUTIONS.length, students: n };
}

if (process.argv[1]?.endsWith("seed.ts")) {
  const r = seedAll();
  console.log(`Seeded ${r.institutions} institutions and ${r.students} student records.`);
}
