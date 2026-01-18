import { pgTable, serial, integer, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';

export const user = pgTable('user', { id: serial('id').primaryKey(), age: integer('age') });

export const llmsRun = pgTable(
	'llms_run',
	{
		id: uuid('id').primaryKey(),
		content: text('content').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		paidAt: timestamp('paid_at', { withTimezone: true })
	},
	(table) => ({
		expiresAtIdx: index('llms_run_expires_at_idx').on(table.expiresAt)
	})
);
