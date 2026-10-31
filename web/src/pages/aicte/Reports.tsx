import { Link, useParams } from "react-router-dom";
import { download, useApi } from "../../lib/api";
import { n, plural } from "../../lib/format";
import { Page } from "../../components/Shell";
import { Icon } from "../../components/Icons";
import { RowCard, type RowName } from "../../components/Drawings";
import { ErrorNote, Loading, Table, useUi } from "../../components/ui";

const ART: Record<string, RowName> = { intake: "overview", states: "institutions", foreign: "students", apaar: "verify", duplicates: "duplicates", submissions: "submit" };
const USE: Record<string, string> = {
  intake: "Approval, excess-admission action",
  states: "Policy and state planning",
  foreign: "Supernumerary seat monitoring",
  apaar: "APAAR seeding drive",
  duplicates: "Follow-up with institutions",
  submissions: "Deadline follow-up, accreditation",
};

/** Reports for policy, accreditation and monitoring. Each one is a table you can read here, print, or download. */
export function Reports() {
  const { data, error, reload } = useApi("/national/reports");
  return (
    <Page title="Reports" sub="Built from the live registry, so they're current to the minute. Exports are logged in the audit trail.">
      {error ? <ErrorNote text={error} retry={reload} /> : !data ? <Loading /> : (
        <section className="panel">
          <Table cols="minmax(0,1fr) auto">
            {data.map((r: any) => (
              <Link key={r.kind} to={`/a/reports/${r.kind}`} className="t-row hoverable" style={{ minHeight: 68 }}>
                <span style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <RowCard name={ART[r.kind]} size={34} />
                  <span style={{ minWidth: 0 }}><div className="t-main">{r.title}</div><div className="t-sub" style={{ whiteSpace: "normal" }}>{r.description}</div></span>
                </span>
                <span className="t-sub hide-phone" style={{ textAlign: "right" }}>{plural(r.rows, "row")}<br />{USE[r.kind]}</span>
              </Link>
            ))}
          </Table>
        </section>
      )}
    </Page>
  );
}

export function ReportView() {
  const { kind } = useParams();
  const ui = useUi();
  const { data, error, reload } = useApi(`/national/reports/${kind}`, [kind]);
  const totals = data?.columns.filter((c: any) => c.num && !/%|risk|cap/i.test(c.label)).reduce((a: any, c: any) => ({ ...a, [c.key]: data.rows.reduce((s: number, r: any) => s + (Number(r[c.key]) || 0), 0) }), {});
  return (
    <Page title={data?.title ?? "Report"} back={{ to: "/a/reports", label: "Reports" }} sub={data ? `${data.description} ${plural(data.rows.length, "row")}, as of now.` : " "}
      actions={data && <>
        <button className="btn glass" onClick={() => window.print()}><Icon.Print size={16} />Print</button>
        <button className="btn primary" onClick={() => download(`/national/reports/${kind}?format=csv`, `${kind}.csv`).then(() => ui.toast("Downloaded")).catch((e) => ui.toast(e.message, { kind: "error" }))}><Icon.Download size={16} />CSV</button>
      </>}>
      {error ? <ErrorNote text={error} retry={reload} /> : !data ? <Loading rows={10} /> : (
        <section className="panel">
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr>{data.columns.map((c: any) => <th key={c.key} className={c.num ? "num" : ""}>{c.label}</th>)}</tr></thead>
              <tbody>
                {data.rows.map((r: any, i: number) => (
                  <tr key={i}>{data.columns.map((c: any) => <td key={c.key} className={c.num ? `num${c.key === "excess" && r[c.key] > 0 ? " bad" : ""}` : ""} title={c.num ? undefined : String(r[c.key] ?? "")}>{c.num ? n(r[c.key]) : r[c.key]}</td>)}</tr>
                ))}
              </tbody>
              {totals && Object.keys(totals).length > 0 && (
                <tfoot><tr>{data.columns.map((c: any, i: number) => <td key={c.key} className={c.num ? "num" : ""}>{i === 0 ? "Total" : totals[c.key] != null ? n(totals[c.key]) : ""}</td>)}</tr></tfoot>
              )}
            </table>
          </div>
        </section>
      )}
    </Page>
  );
}
