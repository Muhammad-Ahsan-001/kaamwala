/**
 * Demo data. Every person, phone number, job and review here is fictional.
 * The whole set is disclosed in the README under "Seeded / Mocked".
 */
import { createHash } from "node:crypto";
import { PrismaClient, type JobStatus, type Prisma, type WorkerStatus } from "@prisma/client";
import { AREAS, type Area } from "../src/areas";
import { dayDates } from "../src/domain/days";
import { splitAgentFee, splitEarnings } from "../src/domain/pricing";
import { addDaysIso, todayPkt, toDateOnly } from "../src/geo";
import { CATEGORIES, type SeedCategory } from "./categories";

const prisma = new PrismaClient();

const AGENT_SIGNUP_FEE = 200;
const AGENT_SHARE_PERCENT = 40;

const WORKER_NAMES: Record<string, string[]> = {
  electrician: ["Imran Khan", "Muhammad Asif", "Shahid Mehmood", "Waseem Abbasi", "Zubair Ahmed"],
  plumber: ["Tariq Mehmood", "Nadeem Akhtar", "Rashid Ali", "Sajid Hussain", "Khalid Awan"],
  "ac-technician": ["Faisal Rehman", "Usman Ghani", "Kamran Shah", "Adnan Qureshi", "Bilal Raja"],
  carpenter: ["Ghulam Mustafa", "Abdul Rehman", "Yousaf Masih", "Haroon Rasheed", "Akram Butt"],
  mechanic: ["Javed Iqbal", "Shakeel Anjum", "Nasir Mahmood", "Aamir Sohail", "Mushtaq Ahmed"],
  mistri: ["Allah Ditta", "Muhammad Riaz", "Safdar Hussain", "Liaqat Ali", "Ghulam Abbas"],
  labourer: ["Shafiq Ur Rehman", "Noor Muhammad", "Gul Zaman", "Sher Khan", "Mumtaz Ali"],
  painter: ["Saleem Akhtar", "Arshad Mehmood", "Pervaiz Masih", "Zahid Iqbal", "Ishfaq Ahmed"],
  "home-maid": ["Shabana Bibi", "Nasreen Akhtar", "Rukhsana Bibi", "Parveen Masih", "Zainab Bibi"],
};

const CUSTOMER_NAMES = [
  "Ayesha Siddiqui",
  "Hamza Malik",
  "Sana Tariq",
  "Omar Farooq",
  "Mehwish Raza",
  "Ali Hassan",
  "Fatima Zahra",
  "Saad Ahmed",
  "Hira Nawaz",
  "Junaid Iqbal",
];

const WORKER_TAGS = ["waqt ka paband", "munasib qeemat", "saaf kaam", "tameez daar", "mahir", "jaldi kaam", "bharosay ka aadmi"];
const HIRER_TAGS = ["waqt par adaigi", "acha rawaiya", "extra diya", "izzat se pesh aaye"];
const REVIEW_LINES = [
  "Bohat acha kaam kiya, waqt par aaye.",
  "Kaam saaf tha aur paise bhi munasib liye.",
  "Bohat tameez se baat ki aur jaldi kaam khatam kiya.",
  "Mahir aadmi hain, dobara bulayenge.",
];
const HOURS = ["Subah 9 se shaam 6", "Subah 8 se dopahar 2", "Dopahar 12 se raat 8", "Poora din"];

/** Small deterministic generator, so every seed run produces the same data. */
function makeRandom(seed: number) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const random = makeRandom(20261110);
const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)] as T;
const pickSome = <T>(items: T[], min: number, max: number): T[] =>
  [...items].sort(() => random() - 0.5).slice(0, int(min, Math.min(max, items.length)));
const jitter = (n: number) => n + (random() - 0.5) * 0.012;
const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000 - int(0, 8) * 60 * 60 * 1000);
const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);

/** Fictional numbers, salted the same way as real ones so duplicate checks treat them normally. */
const seededCnicHash = (index: number) =>
  createHash("sha256")
    .update(`${process.env.CNIC_SALT ?? ""}:00000${String(index).padStart(8, "0")}`)
    .digest("hex");

async function reset() {
  await prisma.$transaction([
    prisma.agentLedgerEntry.deleteMany(),
    prisma.earning.deleteMany(),
    prisma.review.deleteMany(),
    prisma.message.deleteMany(),
    prisma.offer.deleteMany(),
    prisma.jobAssignment.deleteMany(),
    prisma.job.deleteMany(),
    prisma.crewMember.deleteMany(),
    prisma.crew.deleteMany(),
    prisma.cnicHash.deleteMany(),
    prisma.pushSubscription.deleteMany(),
    prisma.otpChallenge.deleteMany(),
    prisma.hirerProfile.deleteMany(),
    prisma.workerProfile.deleteMany(),
    prisma.user.deleteMany(),
    prisma.category.deleteMany(),
  ]);
}

interface SeedWorker {
  id: string;
  userId: string;
  categoryId: string;
  rate: number;
  name: string;
  /** Chance that a seeded job of theirs finishes on time. */
  punctuality: number;
}

async function createCategories() {
  await prisma.category.createMany({
    data: CATEGORIES.map((c, i) => ({
      id: c.id,
      nameUr: c.nameUr,
      nameRoman: c.nameRoman,
      nameEn: c.nameEn,
      icon: c.icon,
      keywords: c.keywords,
      skills: Object.keys(c.skills),
      skillAliases: c.skills as Prisma.InputJsonValue,
      floorPrice: c.floorPrice,
      step: 50,
      crewAllowed: c.crewAllowed,
      sortOrder: i,
    })),
  });
}

async function createWorkers(): Promise<SeedWorker[]> {
  const workers: SeedWorker[] = [];
  let phone = 3100000001;
  let index = 0;
  for (const category of CATEGORIES) {
    for (const name of WORKER_NAMES[category.id] as string[]) {
      const area = AREAS[index % AREAS.length] as Area;
      const skills = pickSome(Object.keys(category.skills), 2, 4);
      const rate = category.floorPrice + 50 * int(2, 20);
      const received = int(8, 30);
      // Every fifteenth worker starts offline, so the hidden-while-busy behaviour is visible at once.
      // None of them belongs to a crew, so every seeded crew can be booked straight away.
      const status: WorkerStatus = index % 15 === 8 ? "offline" : "available";
      const user = await prisma.user.create({
        data: {
          phone: `+92${phone++}`,
          name,
          role: "worker",
          phoneVerifiedAt: index % 7 === 3 ? null : daysAgo(int(30, 200)),
          workerProfile: {
            create: {
              categoryIds: [category.id],
              skills,
              years: int(2, 25),
              rate,
              area: area.name,
              lat: jitter(area.lat),
              lng: jitter(area.lng),
              status,
              workingHours: pick(HOURS),
              requestsReceived: received,
              requestsAnswered: Math.round(received * (0.7 + random() * 0.3)),
              ...(index % 3 !== 2 ? { cnicHash: { create: { hash: seededCnicHash(index) } } } : {}),
            },
          },
        },
        include: { workerProfile: true },
      });
      workers.push({
        id: user.workerProfile?.id as string,
        userId: user.id,
        categoryId: category.id,
        rate,
        name,
        punctuality: 0.65 + random() * 0.35,
      });
      index++;
    }
  }
  return workers;
}

async function createCustomers() {
  const ids: string[] = [];
  for (const [i, name] of CUSTOMER_NAMES.entries()) {
    const area = AREAS[(i * 3) % AREAS.length] as Area;
    const user = await prisma.user.create({
      data: {
        phone: `+92${3200000001 + i}`,
        name,
        role: "customer",
        hirerProfile: { create: { area: area.name, lat: jitter(area.lat), lng: jitter(area.lng) } },
      },
    });
    ids.push(user.id);
  }
  return ids;
}

async function createCompletedJob(input: {
  categoryId: string;
  mode: "direct" | "open" | "crew";
  crewId?: string;
  leaderUserId: string;
  workerIds: string[];
  price: number;
  customerId: string;
  punctuality: number;
  status?: JobStatus;
  disputeReason?: string;
  durationDays?: number;
  /** Fewer than durationDays means the job finished early. */
  completedDays?: number;
}) {
  const category = CATEGORIES.find((c) => c.id === input.categoryId) as SeedCategory;
  const area = pick(AREAS);
  const description = pick(category.tasks);

  // Believable timestamps: the "waqt par" and "jawab" figures are computed from these.
  const viaOffer = input.mode === "open";
  const durationDays = input.durationDays ?? 1;
  const finishedDays = input.completedDays ?? durationDays;
  const multiDay = durationDays > 1;
  const createdAt = daysAgo(multiDay ? int(12, 90) : int(3, 90));
  const repliedAt = addMinutes(createdAt, int(2, 45));
  const acceptedAt = addMinutes(repliedAt, int(5, 60));
  const etaMinutes = pick([20, 30, 45, 60, 90, 120]);
  const engagedAt = addMinutes(viaOffer ? acceptedAt : repliedAt, int(5, 40));
  const scheduledFor = !viaOffer && random() < 0.4 ? addMinutes(engagedAt, int(120, 1440)) : null;
  const promised = scheduledFor ?? (viaOffer ? addMinutes(acceptedAt, etaMinutes) : engagedAt);
  const onTime = random() < input.punctuality;
  const oneDayFinish = addMinutes(promised, onTime ? int(30, 220) : int(260, 720));

  const firstDate = todayPkt(scheduledFor ?? engagedAt);
  const startDate = multiDay ? addDaysIso(firstDate, 1) : firstDate;
  const dayRows = dayDates(startDate, durationDays).map((date, i) => {
    const done = i < finishedDays;
    return {
      dayNumber: i + 1,
      date: toDateOnly(date),
      status: done ? ("completed" as const) : ("skipped" as const),
      // Multi-day work is marked done at 17:00 Pakistan time on each day.
      completedAt: done ? (multiDay ? new Date(`${date}T12:00:00.000Z`) : oneDayFinish) : null,
    };
  });
  const completedAt = dayRows[finishedDays - 1]?.completedAt as Date;

  const job = await prisma.job.create({
    data: {
      mode: input.mode,
      status: input.status ?? "completed",
      customerId: input.customerId,
      categoryId: input.categoryId,
      crewId: input.crewId ?? null,
      description,
      area: area.name,
      lat: jitter(area.lat),
      lng: jitter(area.lng),
      floor: category.floorPrice,
      step: 50,
      proposedPrice: input.price,
      proposedById: input.customerId,
      agreedPrice: input.price,
      durationDays,
      startDate: toDateOnly(startDate),
      totalPrice: input.price * finishedDays,
      card: {
        task: description,
        addressArea: area.name,
        time: "Seeded",
        agreedPrice: input.price,
        pricePerDay: input.price,
        durationDays,
        startDate,
        totalPrice: input.price * durationDays,
        source: "template",
      },
      days: { create: dayRows },
      customerConfirmed: true,
      workerConfirmed: true,
      scheduledFor,
      engagedAt,
      completedAt,
      createdAt,
      disputeReason: input.disputeReason ?? null,
      assignments: {
        create: input.workerIds.map((workerId) => ({
          workerId,
          active: false,
          respondedAt: viaOffer ? null : repliedAt,
          createdAt,
        })),
      },
      ...(viaOffer
        ? {
            offers: {
              create: [
                {
                  workerId: input.workerIds[0] as string,
                  price: input.price,
                  etaMinutes,
                  status: "accepted" as const,
                  acceptedAt,
                  createdAt: repliedAt,
                },
              ],
            },
          }
        : {}),
    },
  });

  const shares = splitEarnings(input.price, input.workerIds.length);
  await prisma.earning.createMany({
    data: dayRows
      .filter((d) => d.status === "completed")
      .flatMap((d) =>
        input.workerIds.map((workerId, i) => ({
          workerId,
          jobId: job.id,
          dayNumber: d.dayNumber,
          amount: shares[i] as number,
          categoryId: input.categoryId,
          earnedAt: d.completedAt as Date,
        })),
      ),
  });

  if (job.status === "completed") {
    await prisma.review.createMany({
      data: [
        {
          jobId: job.id,
          direction: "customer_to_worker",
          reviewerId: input.customerId,
          revieweeId: input.leaderUserId,
          rating: pick([3, 4, 4, 4, 5, 5, 5, 5]),
          transcript: pick(REVIEW_LINES),
          tags: pickSome(WORKER_TAGS, 1, 3),
          createdAt: completedAt,
        },
        {
          jobId: job.id,
          direction: "worker_to_customer",
          reviewerId: input.leaderUserId,
          revieweeId: input.customerId,
          rating: pick([4, 4, 5, 5, 5]),
          tags: pickSome(HIRER_TAGS, 1, 2),
          createdAt: completedAt,
        },
      ],
    });
  }
}

/** A three-day job in progress: day one done, the worker engaged through day three. */
async function createActiveMultiDayJob(worker: SeedWorker, customerId: string) {
  const category = CATEGORIES.find((c) => c.id === worker.categoryId) as SeedCategory;
  const area = pick(AREAS);
  const startDate = addDaysIso(todayPkt(), -1);
  const dates = dayDates(startDate, 3);
  const engagedAt = daysAgo(2);
  const createdAt = addMinutes(engagedAt, -45);
  const dayOneDone = new Date(`${dates[0]}T12:00:00.000Z`);
  const description = pick(category.tasks);
  const total = worker.rate * 3;

  const job = await prisma.job.create({
    data: {
      mode: "direct",
      status: "engaged",
      customerId,
      categoryId: worker.categoryId,
      description,
      area: area.name,
      lat: jitter(area.lat),
      lng: jitter(area.lng),
      floor: category.floorPrice,
      step: 50,
      durationDays: 3,
      startDate: toDateOnly(startDate),
      proposedPrice: worker.rate,
      proposedById: customerId,
      agreedPrice: worker.rate,
      totalPrice: total,
      card: {
        task: description,
        addressArea: area.name,
        time: "Seeded",
        agreedPrice: worker.rate,
        pricePerDay: worker.rate,
        durationDays: 3,
        startDate,
        totalPrice: total,
        source: "template",
      },
      customerConfirmed: true,
      workerConfirmed: true,
      engagedAt,
      createdAt,
      assignments: { create: [{ workerId: worker.id, active: true, respondedAt: addMinutes(createdAt, 12), createdAt }] },
      days: {
        create: dates.map((date, i) => ({
          dayNumber: i + 1,
          date: toDateOnly(date),
          status: i === 0 ? ("completed" as const) : ("scheduled" as const),
          completedAt: i === 0 ? dayOneDone : null,
        })),
      },
    },
  });
  await prisma.earning.create({
    data: {
      workerId: worker.id,
      jobId: job.id,
      dayNumber: 1,
      amount: worker.rate,
      categoryId: worker.categoryId,
      earnedAt: dayOneDone,
    },
  });
  await prisma.workerProfile.update({ where: { id: worker.id }, data: { status: "engaged", statusChangedAt: engagedAt } });
}

/** Mock-collected demo signups for the seeded agent. Each is flagged as seeded in the database. */
async function createAgentLedger(agentId: string, workers: SeedWorker[]) {
  const assisted = workers.filter((_, i) => i % 5 === 1).slice(0, 8);
  const split = splitAgentFee(AGENT_SIGNUP_FEE, AGENT_SHARE_PERCENT);
  for (const [i, worker] of assisted.entries()) {
    await prisma.workerProfile.update({ where: { id: worker.id }, data: { createdByAgentId: agentId } });
    await prisma.agentLedgerEntry.create({
      data: {
        agentId,
        workerId: worker.id,
        fee: AGENT_SIGNUP_FEE,
        ...split,
        paymentStatus: "mock_collected",
        seeded: true,
        createdAt: daysAgo(i < 3 ? int(1, 6) : int(8, 60)),
      },
    });
  }
  return assisted.length;
}

async function main() {
  // Seeding wipes everything. An empty database (a first deploy) is safe, anything else needs the flag.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED_RESET !== "1" && (await prisma.user.count()) > 0) {
    throw new Error("This database already has data and seeding wipes it. Set ALLOW_SEED_RESET=1 to continue.");
  }

  await reset();
  await createCategories();
  const settings = { agentSignupFee: AGENT_SIGNUP_FEE, agentSharePercent: AGENT_SHARE_PERCENT };
  await prisma.appSettings.upsert({ where: { id: 1 }, create: { id: 1, ...settings }, update: settings });

  await prisma.user.create({
    data: { phone: "+923000000001", name: "KaamWala Admin", role: "admin", phoneVerifiedAt: new Date() },
  });
  const agent = await prisma.user.create({
    data: { phone: "+923000000002", name: "Bashir Ahmed (Field Agent)", role: "agent", phoneVerifiedAt: new Date() },
  });

  const workers = await createWorkers();
  const ledgerEntries = await createAgentLedger(agent.id, workers);
  const customers = await createCustomers();

  const findByName = (name: string) => workers.find((w) => w.name === name) as SeedWorker;
  const crewPlans = [
    { name: "Madina Tameeraat Crew", categoryIds: ["mistri", "labourer", "electrician"], rate: 6500, members: ["Muhammad Riaz", "Gul Zaman", "Zubair Ahmed"] },
    { name: "Rawal Finishing Team", categoryIds: ["painter", "carpenter", "labourer"], rate: 5500, members: ["Saleem Akhtar", "Ghulam Mustafa", "Noor Muhammad"] },
    { name: "Pindi Pipe aur Bijli Crew", categoryIds: ["plumber", "electrician", "labourer"], rate: 4500, members: ["Rashid Ali", "Waseem Abbasi", "Sher Khan"] },
    { name: "AI WEB FORGE", categoryIds: ["electrician", "carpenter", "plumber"], rate: 2500, members: ["Shahid Mehmood", "Yousaf Masih", "Sajid Hussain"] },
  ];

  const crews = [];
  for (const plan of crewPlans) {
    const members = plan.members.map(findByName);
    const leader = members[0] as SeedWorker;
    const crew = await prisma.crew.create({
      data: {
        name: plan.name,
        leaderId: leader.id,
        categoryIds: plan.categoryIds,
        rate: plan.rate,
        members: { create: members.map((m) => ({ workerId: m.id, status: "accepted" as const })) },
      },
    });
    crews.push({ crew, members, leader, categoryId: plan.categoryIds[0] as string, rate: plan.rate });
  }

  // One to three finished jobs per worker, so every profile carries real reviews.
  for (const worker of workers) {
    const count = int(1, 3);
    for (let i = 0; i < count; i++) {
      await createCompletedJob({
        categoryId: worker.categoryId,
        mode: random() < 0.35 ? "open" : "direct",
        leaderUserId: worker.userId,
        workerIds: [worker.id],
        price: worker.rate + 50 * int(-1, 4),
        customerId: pick(customers),
        punctuality: worker.punctuality,
      });
    }
  }

  for (const { crew, members, leader, categoryId, rate } of crews) {
    await createCompletedJob({
      categoryId,
      mode: "crew",
      crewId: crew.id,
      leaderUserId: leader.userId,
      workerIds: members.map((m) => m.id),
      price: rate,
      customerId: pick(customers),
      punctuality: leader.punctuality,
    });
  }

  // Jobs over several days: one run to the end, one finished early, one by a crew, one still going.
  const threeDay = findByName("Arshad Mehmood");
  await createCompletedJob({
    categoryId: threeDay.categoryId,
    mode: "direct",
    leaderUserId: threeDay.userId,
    workerIds: [threeDay.id],
    price: threeDay.rate,
    customerId: customers[4] as string,
    punctuality: 1,
    durationDays: 3,
  });
  const finishedEarly = findByName("Liaqat Ali");
  await createCompletedJob({
    categoryId: finishedEarly.categoryId,
    mode: "direct",
    leaderUserId: finishedEarly.userId,
    workerIds: [finishedEarly.id],
    price: finishedEarly.rate,
    customerId: customers[5] as string,
    punctuality: 1,
    durationDays: 3,
    completedDays: 2,
  });
  const crewForDays = crews[1];
  if (crewForDays) {
    await createCompletedJob({
      categoryId: crewForDays.categoryId,
      mode: "crew",
      crewId: crewForDays.crew.id,
      leaderUserId: crewForDays.leader.userId,
      workerIds: crewForDays.members.map((m) => m.id),
      price: crewForDays.rate,
      customerId: customers[6] as string,
      punctuality: 1,
      durationDays: 4,
    });
  }
  await createActiveMultiDayJob(findByName("Akram Butt"), customers[3] as string);

  const disputed = workers[2] as SeedWorker;
  await createCompletedJob({
    categoryId: disputed.categoryId,
    mode: "direct",
    leaderUserId: disputed.userId,
    workerIds: [disputed.id],
    price: disputed.rate,
    customerId: customers[0] as string,
    punctuality: disputed.punctuality,
    status: "disputed",
    disputeReason: "Kaam adhoora chhor diya gaya, paise poore liye.",
  });

  for (const [i, categoryId] of (["electrician", "plumber"] as const).entries()) {
    const category = CATEGORIES.find((c) => c.id === categoryId) as SeedCategory;
    const area = AREAS[2 + i] as Area;
    await prisma.job.create({
      data: {
        mode: "open",
        status: "open",
        customerId: customers[i + 1] as string,
        categoryId,
        description: category.tasks[0] as string,
        area: area.name,
        lat: area.lat,
        lng: area.lng,
        floor: category.floorPrice,
        step: 50,
      },
    });
  }

  const [workerCount, jobCount, reviewCount] = await Promise.all([
    prisma.workerProfile.count(),
    prisma.job.count({ where: { status: "completed" } }),
    prisma.review.count(),
  ]);
  console.log(
    `Seeded ${CATEGORIES.length} categories, ${workerCount} workers, ${customers.length} customers, ${crews.length} crews, ${jobCount} past jobs, ${reviewCount} reviews, ${ledgerEntries} agent ledger entries (mock_collected).`,
  );
  console.log("Admin +923000000001, agent +923000000002, workers from +923100000001, customers from +923200000001.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
