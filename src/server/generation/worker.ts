import type { GenerationJobRepository } from "@/server/db/repositories";

type WorkerDependencies = {
  jobs: GenerationJobRepository;
  runJob(jobId: string): Promise<void>;
  now?: () => Date;
  leaseSeconds?: number;
  idleDelayMs?: number;
};

export async function runWorkerOnce(workerId: string, dependencies: WorkerDependencies) {
  const job = await dependencies.jobs.leaseNextJob(
    workerId,
    dependencies.now?.() ?? new Date(),
    dependencies.leaseSeconds ?? 60,
  );
  if (!job) return false;
  await dependencies.runJob(job.id);
  return true;
}

export async function startGenerationWorker(workerId: string, dependencies: WorkerDependencies) {
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  while (!stopping) {
    const worked = await runWorkerOnce(workerId, dependencies).catch(() => false);
    if (!worked) {
      await new Promise((resolve) => setTimeout(resolve, dependencies.idleDelayMs ?? 500));
    }
  }
}

