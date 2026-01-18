import { and, eq, gt, lt } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { llmsRun } from '$lib/server/db/schema';

const RUN_TTL_MS = 1000 * 60 * 60 * 24;

export type RunRecord = {
	id: string;
	content: string;
	createdAt: Date;
	expiresAt: Date;
	paidAt: Date | null;
};

const toRecord = (run: typeof llmsRun.$inferSelect): RunRecord => ({
	id: run.id,
	content: run.content,
	createdAt: run.createdAt,
	expiresAt: run.expiresAt,
	paidAt: run.paidAt
});

export const createRun = async (content: string) => {
	const id = crypto.randomUUID();
	const now = new Date();
	const expiresAt = new Date(now.getTime() + RUN_TTL_MS);

	const [run] = await db
		.insert(llmsRun)
		.values({ id, content, expiresAt })
		.returning();

	return run ? toRecord(run) : null;
};

export const getRun = async (id: string) => {
	const now = new Date();
	const [run] = await db
		.select()
		.from(llmsRun)
		.where(and(eq(llmsRun.id, id), gt(llmsRun.expiresAt, now)));

	return run ? toRecord(run) : null;
};

export const markRunPaid = async (id: string) => {
	const now = new Date();
	const [run] = await db
		.update(llmsRun)
		.set({ paidAt: now })
		.where(and(eq(llmsRun.id, id), gt(llmsRun.expiresAt, now)))
		.returning();

	return run ? toRecord(run) : null;
};

export const deleteExpiredRuns = async () => {
	const now = new Date();
	const deleted = await db.delete(llmsRun).where(lt(llmsRun.expiresAt, now)).returning({
		id: llmsRun.id
	});

	return deleted.length;
};
