import { Suspense, lazy, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { CrewJob, CrewProfile, MyCrews } from "./screens/crew";
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
import { HistoryTrail } from "./lib/back";
import { Guard, SignedOutOnly } from "./lib/session";
import { PwaLayer, useSyncEpoch } from "./pwa/PwaLayer";
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
  const syncEpoch = useSyncEpoch();
  return (
    <DraftProvider>
      <ScrollToTop />
      <HistoryTrail />
      <PwaLayer />
      <ErrorBoundary>
        <Suspense
          fallback={
            <div className="mx-auto max-w-md p-4">
              <ListSkeleton />
            </div>
          }
        >
          <Routes key={syncEpoch}>
            <Route path="/" element={<Landing />} />

            <Route element={<SignedOutOnly />}>
              <Route path="/app" element={<RoleChooser />} />
            </Route>
            <Route path="/app/login" element={<Login />} />
            <Route path="/admin/login" element={<Login door="admin" />} />

            {/* Sign-up. The last step stays open, because finishing it creates the profile while still on it. */}
            <Route element={<Guard roles={["worker", "agent"]} profile="none" />}>
              <Route path="/app/onboard" element={<OnboardVoice />} />
              <Route path="/app/onboard/type" element={<OnboardType />} />
            </Route>
            <Route element={<Guard roles={["worker", "agent"]} />}>
              <Route path="/app/onboard/photos" element={<OnboardPhotos />} />
            </Route>
            <Route element={<Guard roles={["customer"]} profile="none" />}>
              <Route path="/app/signup/customer" element={<CustomerVoice />} />
              <Route path="/app/signup/customer/type" element={<CustomerType />} />
            </Route>
            <Route element={<Guard roles={["customer"]} />}>
              <Route path="/app/signup/customer/confirm" element={<CustomerConfirm />} />
            </Route>
            <Route element={<Guard roles={["agent"]} />}>
              <Route path="/app/agent/new" element={<AgentNew />} />
            </Route>

            <Route element={<Guard roles={["worker"]} profile="required" />}>
              <Route path="/app/worker" element={<WorkerHome />} />
              <Route path="/app/earnings" element={<Earnings />} />
              <Route path="/app/crews" element={<MyCrews />} />
            </Route>

            <Route element={<Guard roles={["customer"]} profile="required" />}>
              <Route path="/app/describe" element={<Describe />} />
              <Route path="/app/adda" element={<Adda />} />
              <Route path="/app/crew-job" element={<CrewJob />} />
            </Route>

            <Route element={<Guard />}>
              <Route path="/app/workers/:id" element={<WorkerProfile />} />
              <Route path="/app/hirers/:id" element={<HirerProfile />} />
              <Route path="/app/jobs" element={<MyJobs />} />
              <Route path="/app/jobs/:id" element={<JobChat />} />
              <Route path="/app/jobs/:id/offers" element={<Offers />} />
              <Route path="/app/jobs/:id/review" element={<VoiceReview />} />
              <Route path="/app/crews/:id" element={<CrewProfile />} />
              <Route path="/app/settings" element={<SettingsScreen />} />
            </Route>

            <Route element={<Guard roles={["admin"]} />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/workers" element={<AdminWorkers />} />
              <Route path="/admin/jobs" element={<AdminJobs />} />
              <Route path="/admin/categories" element={<AdminCategories />} />
              <Route path="/admin/agents" element={<AdminAgents />} />
              <Route path="/admin/agents/:id" element={<AdminAgentLedger />} />
              <Route path="/admin/disputes" element={<AdminDisputes />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </DraftProvider>
  );
}
