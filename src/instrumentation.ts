/**
 * Next.js Instrumentation — runs once on server startup.
 * Used to start the in-process cron scheduler for local/desktop deployments.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSchedulerService } = await import(
      "./core/scheduling/scheduler-service"
    );
    // Delay startup slightly to let the HTTP server become ready
    setTimeout(() => {
      startSchedulerService();
    }, 5000);
  }
}
