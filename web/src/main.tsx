import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import "./fonts.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/miniatures.css";
import "./styles/shell.css";
import "./styles/parts.css";
import "./styles/site.css";
import { homeFor, SessionProvider, useSession, type Role } from "./lib/session";
import { UiProvider } from "./components/ui";
import { Shell } from "./components/Shell";
import { useApi } from "./lib/api";
import { Landing } from "./pages/Landing";
import { SignIn } from "./pages/SignIn";
import { PublicVerify } from "./pages/PublicVerify";
import { InstHome } from "./pages/inst/Home";
import { Students } from "./pages/inst/Students";
import { Upload } from "./pages/inst/Upload";
import { Issues } from "./pages/inst/Issues";
import { Submit } from "./pages/inst/Submit";
import { Records } from "./pages/inst/Records";
import { Integration } from "./pages/inst/Integration";
import { Activity } from "./pages/inst/Activity";
import { Overview } from "./pages/aicte/Overview";
import { Institutions } from "./pages/aicte/Institutions";
import { InstitutionDetail } from "./pages/aicte/InstitutionDetail";
import { Duplicates } from "./pages/aicte/Duplicates";
import { Reports, ReportView } from "./pages/aicte/Reports";
import { Audit } from "./pages/aicte/Audit";
import { Rules } from "./pages/aicte/Rules";
import { Lookup } from "./pages/aicte/Lookup";
import { Verify } from "./pages/verifier/Verify";
import { Requests, RequestDetail } from "./pages/verifier/Requests";
import { Me, Sharing, Views } from "./pages/student/Me";

function Gate({ role, children }: { role: Role; children: ReactNode }) {
  const { user, ready } = useSession();
  if (!ready) return null;
  if (!user) return <Navigate to="/sign-in" replace />;
  if (user.role !== role) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

function InstitutionShell({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const { data } = useApi(user?.institution_id ? `/institutions/${user.institution_id}` : null);
  return <Shell scope={data ? { label: "Institution", name: data.institution.name } : undefined}>{children}</Shell>;
}

const inst = (el: ReactNode) => <Gate role="institution"><InstitutionShell>{el}</InstitutionShell></Gate>;
const aicte = (el: ReactNode) => <Gate role="aicte"><Shell scope={{ label: "AICTE · Approval Bureau", name: "National admissions, 2026–27" }}>{el}</Shell></Gate>;
const verifier = (el: ReactNode) => <Gate role="verifier"><Shell scope={{ label: "Authorised verifier", name: "Northwind Analytics" }}>{el}</Shell></Gate>;
const student = (el: ReactNode) => <Gate role="student"><Shell scope={{ label: "Student", name: "Signed in via DigiLocker" }}>{el}</Shell></Gate>;

function AicteInstitution() { const { id } = useParams(); return <InstitutionDetail id={id!} />; }

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/v" element={<PublicVerify />} />
      <Route path="/v/:id" element={<PublicVerify />} />

      <Route path="/i" element={inst(<InstHome />)} />
      <Route path="/i/students" element={inst(<Students />)} />
      <Route path="/i/students/:sid" element={inst(<Students />)} />
      <Route path="/i/upload" element={inst(<Upload />)} />
      <Route path="/i/issues" element={inst(<Issues />)} />
      <Route path="/i/submit" element={inst(<Submit />)} />
      <Route path="/i/records" element={inst(<Records />)} />
      <Route path="/i/integration" element={inst(<Integration />)} />
      <Route path="/i/activity" element={inst(<Activity />)} />

      <Route path="/a" element={aicte(<Overview />)} />
      <Route path="/a/institutions" element={aicte(<Institutions />)} />
      <Route path="/a/review" element={aicte(<Institutions preset="review" />)} />
      <Route path="/a/institutions/:id" element={aicte(<AicteInstitution />)} />
      <Route path="/a/institutions/:id/students" element={aicte(<Students readOnly />)} />
      <Route path="/a/institutions/:id/students/:sid" element={aicte(<Students readOnly />)} />
      <Route path="/a/duplicates" element={aicte(<Duplicates />)} />
      <Route path="/a/reports" element={aicte(<Reports />)} />
      <Route path="/a/reports/:kind" element={aicte(<ReportView />)} />
      <Route path="/a/lookup" element={aicte(<Lookup />)} />
      <Route path="/a/rules" element={aicte(<Rules />)} />
      <Route path="/a/audit" element={aicte(<Audit />)} />

      <Route path="/e" element={verifier(<Verify />)} />
      <Route path="/e/requests" element={verifier(<Requests />)} />
      <Route path="/e/requests/:id" element={verifier(<RequestDetail />)} />

      <Route path="/s" element={student(<Me />)} />
      <Route path="/s/sharing" element={student(<Sharing />)} />
      <Route path="/s/views" element={student(<Views />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <UiProvider><App /></UiProvider>
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
