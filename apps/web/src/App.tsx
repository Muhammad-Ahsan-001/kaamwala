import { Suspense, lazy, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { CrewJob, CrewProfile } from "./screens/crew";
import { Describe } from "./screens/Describe";
import { Earnings } from "./screens/Earnings";
import { Login, RoleChooser } from "./screens/entry";
import { JobChat, MyJobs, Offers, VoiceReview } from "./screens/jobs";
import { Landing } from "./screens/Landing";
import { HirerProfile, WorkerProfile } from "./screens/profiles";
import { SettingsScreen } from "./screens/Settings";
import { DraftProvider } from "./screens/signup/draft";
import { OnboardPhotos } from "./screens/signup/OnboardPhotos";
import { OnboardType } from "./screens/signup/OnboardType";
import { OnboardVoice } from "./screens/signup/OnboardVoice";
import { AgentNew, CustomerConfirm, CustomerType, CustomerVoice } from "./screens/signup/other-signups";
import { WorkerHome } from "./screens/WorkerHome";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { ListSkeleton } from "./ui/primitives";

// Leaflet and the admin area are only needed on their own routes.
const Adda = lazy(() => import("./screens/Adda").then((m) => ({ default: m.Adda })));
const admin = () => import("./screens/admin/Dashboard");
const AdminDashboard = lazy(() => admin().then((m) => ({ default: m.AdminDashboard })));
const AdminWorkers = lazy(() => admin().then((m) => ({ default: m.AdminWorkers })));
const AdminJobs = lazy(() => admin().then((m) => ({ default: m.AdminJobs })));
const AdminDisputes = lazy(() => admin().then((m) => ({ default: m.AdminDisputes })));
const AdminAgents = lazy(() => admin().then((m) => ({ default: m.AdminAgents })));
const AdminAgentLedger = lazy(() => admin().then((m) => ({ default: m.AdminAgentLedger })));
const AdminCategories = lazy(() => import("./screens/admin/Categories").then((m) => ({ default: m.AdminCategories })));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <DraftProvider>
      <ScrollToTop />
      <ErrorBoundary>
        <Suspense
          fallback={
            <div className="mx-auto max-w-md p-4">
              <ListSkeleton />
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Landing />} />

            <Route path="/app" element={<RoleChooser />} />
            <Route path="/app/login" element={<Login />} />

            <Route path="/app/onboard" element={<OnboardVoice />} />
            <Route path="/app/onboard/type" element={<OnboardType />} />
            <Route path="/app/onboard/photos" element={<OnboardPhotos />} />
            <Route path="/app/signup/customer" element={<CustomerVoice />} />
            <Route path="/app/signup/customer/type" element={<CustomerType />} />
            <Route path="/app/signup/customer/confirm" element={<CustomerConfirm />} />
            <Route path="/app/agent/new" element={<AgentNew />} />

            <Route path="/app/worker" element={<WorkerHome />} />
            <Route path="/app/describe" element={<Describe />} />
            <Route path="/app/adda" element={<Adda />} />
            <Route path="/app/workers/:id" element={<WorkerProfile />} />
            <Route path="/app/hirers/:id" element={<HirerProfile />} />

            <Route path="/app/jobs" element={<MyJobs />} />
            <Route path="/app/jobs/:id" element={<JobChat />} />
            <Route path="/app/jobs/:id/offers" element={<Offers />} />
            <Route path="/app/jobs/:id/review" element={<VoiceReview />} />

            <Route path="/app/crews/:id" element={<CrewProfile />} />
            <Route path="/app/crew-job" element={<CrewJob />} />

            <Route path="/app/earnings" element={<Earnings />} />
            <Route path="/app/settings" element={<SettingsScreen />} />

            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/workers" element={<AdminWorkers />} />
            <Route path="/admin/jobs" element={<AdminJobs />} />
            <Route path="/admin/categories" element={<AdminCategories />} />
            <Route path="/admin/agents" element={<AdminAgents />} />
            <Route path="/admin/agents/:id" element={<AdminAgentLedger />} />
            <Route path="/admin/disputes" element={<AdminDisputes />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </DraftProvider>
  );
}
