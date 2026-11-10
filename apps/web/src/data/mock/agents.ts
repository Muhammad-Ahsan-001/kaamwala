/** MOCK: invented data for development only. Payment collection is mocked. See ./index.ts. */
import type { AdminStats, AgentLedgerEntry, AgentLedgerSummary, AppSettings, PastWork } from "../types";

export const defaultSettings: AppSettings = { agentSignupFee: 200, agentSharePercent: 40 };

export const mockAgents = [
  { agentId: "a1", agentName: "Usman Tariq", phone: "0300-5550201" },
  { agentId: "a2", agentName: "Ayesha Noor", phone: "0300-5550202" },
  { agentId: "a3", agentName: "Hamza Ali", phone: "0300-5550203" },
];

const WORKER_NAMES = ["Rafaqat Ali", "Naveed Iqbal", "Sajid Ali", "Imran Masih", "Tariq Mehmood", "Shabana Bibi"];

function seedEntries(): AgentLedgerEntry[] {
  const entries: AgentLedgerEntry[] = [];
  mockAgents.forEach((agent, agentIndex) => {
    const count = [4, 3, 2][agentIndex] ?? 1;
    for (let i = 0; i < count; i++) {
      entries.push({
        id: `${agent.agentId}-e${i}`,
        agentId: agent.agentId,
        agentName: agent.agentName,
        workerId: `w${i + 1}`,
        workerName: WORKER_NAMES[(i + agentIndex) % WORKER_NAMES.length] ?? "Worker",
        fee: 200,
        agentShare: 80,
        platformShare: 120,
        paymentStatus: "mock_collected",
        createdAt: new Date(Date.now() - (i + 1) * 20 * 3_600_000).toISOString(),
      });
    }
  });
  return entries;
}

export const ledger: AgentLedgerEntry[] = seedEntries();

export function summarise(agentId: string): AgentLedgerSummary | null {
  const agent = mockAgents.find((a) => a.agentId === agentId);
  if (!agent) return null;
  const entries = ledger.filter((e) => e.agentId === agentId);
  return {
    ...agent,
    signups: entries.length,
    totalFee: entries.reduce((sum, e) => sum + e.fee, 0),
    agentShare: entries.reduce((sum, e) => sum + e.agentShare, 0),
    platformShare: entries.reduce((sum, e) => sum + e.platformShare, 0),
  };
}

export function adminStats(availableNow: number, engagedNow: number): AdminStats {
  const counts = [6, 9, 7, 12, 10, 14, 11];
  return {
    availableNow,
    engagedNow,
    jobsToday: counts[counts.length - 1] ?? 0,
    agentFeesWeek: ledger.reduce((sum, e) => sum + e.fee, 0),
    pendingWorkers: 3,
    disputes: 1,
    jobsByDay: counts.map((count, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (counts.length - 1 - index));
      return { date: date.toISOString(), count };
    }),
  };
}

export function pastWorkFor(skills: string[]): PastWork[] {
  return skills.slice(0, 3).map((skill, index) => ({ id: `p${index}`, url: null, skill }));
}
