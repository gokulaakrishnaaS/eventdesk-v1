
import { pgTable, serial, varchar, jsonb, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export function createStandardTable(tableName: string) {
  return pgTable(tableName, {
    wid: serial('wid').primaryKey(),
    id: varchar('id', { length: 255 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    data: jsonb('data').default('{}').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  }, (table) => ({
    idIdx: index(`${tableName}_id_idx`).on(table.id),
    nameIdx: index(`${tableName}_name_idx`).on(table.name),
    createdAtIdx: index(`${tableName}_created_at_idx`).on(table.created_at),
    deletedAtIdx: index(`${tableName}_deleted_at_idx`).on(table.deleted_at),
  }));
}