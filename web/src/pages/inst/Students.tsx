import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, useApi } from "../../lib/api";
import { useLive, useSession } from "../../lib/session";
import { apaar, n, plural, QUOTA, shortProgramme } from "../../lib/format";
import { Page } from "../../components/Shell";
import { Icon } from "../../components/Icons";
import { Empty, ErrorNote, Loading, MenuButton, MenuItem, Pager, Segmented, Table } from "../../components/ui";
import { StudentSheet } from "./StudentSheet";

const STATUSES = [["active", "Active"], ["withdrawn", "Withdrawn"], ["transferred", "Transferred"], ["graduated", "Graduated"], ["all", "Any status"]] as const;

/** Every student record, searchable; one opens in a drawer beside the list. */
export function Students({ readOnly }: { readOnly?: boolean }) {
  const { user } = useSession();
  const params = useParams();
  const instId = readOnly ? params.id! : user!.institution_id!;
  const base = readOnly ? `/a/institutions/${instId}/students` : "/i/students";
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const q = sp.get("q") ?? "", program = sp.get("program") ?? "", issue = sp.get("issue") ?? "", status = sp.get("status") ?? "active", page = Number(sp.get("page") ?? 1);
  const [typed, setTyped] = useState(q);
  const set = (k: string, v: string) => { const s = new URLSearchParams(sp); v ? s.set(k, v) : s.delete(k); if (k !== "page") s.delete("page"); setSp(s, { replace: true }); };
  useEffect(() => { const t = setTimeout(() => typed !== q && set("q", typed), 220); return () => clearTimeout(t); }, [typed]);

  const inst = useApi(`/institutions/${instId}`);
  const qs = new URLSearchParams({ q, program, issue, status, page: String(page) }).toString();
  const list = useApi(`/institutions/${instId}/students?${qs}`);
  useLive((e) => { if (e.type === "records" || e.type === "conflict") { list.reload(); inst.reload(); } });
  const [adding, setAdding] = useState(false);

  const programmes = inst.data?.programmes ?? [];
  const progName = programmes.find((p: any) => p.id === program)?.name;
  const sel = params.sid ? Number(params.sid) : null;
  const issueOpt = issue === "" ? "all" : issue === "any" || issue === "errors" ? issue : "code";
  const query = sp.toString() ? `?${sp}` : "";

  return (
    <Page
      title={readOnly ? `Students · ${inst.data?.institution.name ?? ""}` : "Students"}
      back={readOnly ? { to: `/a/institutions/${instId}`, label: inst.data?.institution.name ?? "Institution" } : undefined}
      sub={list.data ? <>{plural(list.data.total, "record")}{progName ? <> in <b>{progName}</b></> : null}{status !== "active" && status !== "all" ? `, ${status}` : ""}{issue && issueOpt === "code" ? <> with <b>{inst.data?.issueCounts.find((c: any) => c.code === issue)?.title ?? issue}</b></> : null}</> : " "}
      actions={!readOnly && <>
        <Link to="/i/upload" className="btn glass"><Icon.Upload size={17} />Upload</Link>
        <button className="btn primary" onClick={() => setAdding(true)}><Icon.Plus size={17} />Add student</button>
      </>}
    >
      <div className="toolbar">
        <label className="search glass"><Icon.Search size={17} /><input placeholder="Name, APAAR ID or enrolment no." value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Search students" /></label>
        <Segmented label="Show" value={issueOpt as any} onChange={(v) => set("issue", v === "all" ? "" : v)} options={[{ value: "all", label: "All" }, { value: "any", label: "With issues" }, { value: "errors", label: "Errors" }, ...(issueOpt === "code" ? [{ value: "code" as const, label: "One check" }] : [])]} />
        <MenuButton label={<><Icon.Filter size={16} />{progName ? shortProgramme(progName) : "All programmes"}</>}>
          {(close) => <>
            <MenuItem on={!program} onClick={() => { set("program", ""); close(); }}>All programmes</MenuItem>
            <div className="menu-sep" />
            {programmes.map((p: any) => <MenuItem key={p.id} on={program === p.id} trail={n(p.total)} onClick={() => { set("program", p.id); close(); }}>{p.name}</MenuItem>)}
          </>}
        </MenuButton>
        <MenuButton label={<>{STATUSES.find((s) => s[0] === status)?.[1]}<Icon.UpDown size={15} /></>}>
          {(close) => STATUSES.map(([v, l]) => <MenuItem key={v} on={status === v} onClick={() => { set("status", v === "active" ? "" : v); close(); }}>{l}</MenuItem>)}
        </MenuButton>
      </div>

      {list.error ? <ErrorNote text={list.error} retry={list.reload} /> : !list.data ? <Loading rows={8} /> : (
        <section className="panel">
          {list.data.students.length === 0 ? (
            <Empty scene={q || issue || program ? "search" : "upload"} title={q || issue || program ? "No students match" : "No students yet"}
              text={q || issue || program ? "Try a different search or clear the filters." : "Upload this year's admissions as a CSV file, or add students one by one."}
              action={!readOnly && !(q || issue || program) ? <Link to="/i/upload" className="btn primary">Upload students</Link> : (q || issue || program) ? <button className="btn quiet" onClick={() => { setTyped(""); setSp({}, { replace: true }); }}>Clear filters</button> : undefined} />
          ) : (
            <Table cols="minmax(0,1.6fr) 150px minmax(0,1.3fr) 110px minmax(0,1.1fr)" head={<><span>Student</span><span className="hide-phone">APAAR ID</span><span className="hide-phone">Programme</span><span className="hide-phone">Seat</span><span>Checks</span></>}>
              {list.data.students.map((s: any) => (
                <Link key={s.id} to={`${base}/${s.id}${query}`} className={`t-row hoverable${sel === s.id ? " selected" : ""}`}>
                  <span><div className="t-main">{s.name ?? <span className="tertiary">No name</span>}</div><div className="t-sub">{s.enrolment_no ?? "—"}{s.status !== "active" ? ` · ${s.status}` : ""}</div></span>
                  <span className="t-num hide-phone" style={{ fontSize: 14 }}>{s.apaar_id ? apaar(s.apaar_id) : <span className="chip small bad"><span className="dot" />Missing</span>}</span>
                  <span className="hide-phone"><div className="t-main" style={{ fontWeight: 400 }}>{shortProgramme(s.programme)}</div><div className="t-sub">{s.academic_year} · year {s.year_of_study}</div></span>
                  <span className="hide-phone t-sub" style={{ fontSize: 13.5 }}>{QUOTA[s.quota] ?? s.quota}{s.nri ? " · NRI" : ""}{s.oci ? " · OCI" : ""}{s.fn ? " · FN" : ""}</span>
                  <span className="chips"><IssueChips issues={s.issues} catalogue={inst.data?.issueCounts} /></span>
                </Link>
              ))}
            </Table>
          )}
          <Pager page={page} size={list.data.size} total={list.data.total} onPage={(p) => set("page", String(p))} />
        </section>
      )}

      {sel && <StudentSheet institutionId={instId} id={sel} readOnly={readOnly} programmes={programmes} onClose={() => nav(`${base}${query}`)} onChanged={() => { list.reload(); inst.reload(); }} />}
      {adding && <StudentSheet institutionId={instId} id={null} programmes={programmes} onClose={() => setAdding(false)} onChanged={() => { list.reload(); inst.reload(); }} onCreated={(id) => { setAdding(false); nav(`${base}/${id}`); }} />}
    </Page>
  );
}

function IssueChips({ issues, catalogue }: { issues: { code: string; severity: string }[]; catalogue?: any[] }) {
  if (!issues.length) return <span className="chip small ok"><Icon.Check size={12} strokeWidth={2.6} />Clear</span>;
  const errors = issues.filter((i) => i.severity === "error"), warns = issues.filter((i) => i.severity === "warning");
  const first = (errors[0] ?? warns[0]).code;
  const title = catalogue?.find((c) => c.code === first)?.title ?? first;
  return <>
    <span className={`chip small ${errors.length ? "bad" : "warn"}`} title={title} style={{ maxWidth: "100%", overflow: "hidden" }}><span className="dot" /><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span></span>
    {issues.length > 1 && <span className="chip small">+{issues.length - 1}</span>}
  </>;
}

export async function changeStatus(institutionId: string, id: number, status: string, reason: string) {
  return api(`/institutions/${institutionId}/students/${id}/status`, { body: { status, reason } });
}
