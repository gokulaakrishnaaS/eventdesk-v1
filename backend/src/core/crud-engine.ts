import {
  eq,
  and,
  or,
  gt,
  lt,
  gte,
  lte,
  ilike,
  inArray,
  isNull,
  isNotNull,
  desc,
  asc,
  sql,
  SQL,
} from 'drizzle-orm';
import { PgTable, PgColumn } from 'drizzle-orm/pg-core';
import { db } from '../database/connection';
import { QueryParams, QueryResult, FilterOperator, StandardEntity } from '../types/common';
import { logger } from '../utils/logger';
import { generateXid } from '../utils/xid-generator';

export class CrudEngine<T extends StandardEntity> {
  constructor(
    private table: PgTable,
    private modelName: string
  ) {}

  private parseFilters(params: QueryParams): FilterOperator[] {
    const filters: FilterOperator[] = [];

    for (const [key, value] of Object.entries(params)) {
      if (['page', 'limit', 'sort', 'select', 'deleted'].includes(key)) {
        continue;
      }

      let field = key;
      let operator: FilterOperator['operator'] = 'eq';

      // Parse operator suffixes
      if (key.endsWith('_ne')) {
        field = key.slice(0, -3);
        operator = 'ne';
      } else if (key.endsWith('_lt')) {
        field = key.slice(0, -3);
        operator = 'lt';
      } else if (key.endsWith('_gt')) {
        field = key.slice(0, -3);
        operator = 'gt';
      } else if (key.endsWith('_lte')) {
        field = key.slice(0, -4);
        operator = 'lte';
      } else if (key.endsWith('_gte')) {
        field = key.slice(0, -4);
        operator = 'gte';
      } else if (key.endsWith('_in')) {
        field = key.slice(0, -3);
        operator = 'in';
      } else if (key.endsWith('_prefix')) {
        field = key.slice(0, -7);
        operator = 'prefix';
      } else if (key.endsWith('_suffix')) {
        field = key.slice(0, -7);
        operator = 'suffix';
      } else if (key.endsWith('_substr')) {
        field = key.slice(0, -7);
        operator = 'substr';
      }

      filters.push({ field, operator, value });
    }

    return filters;
  }

  private buildWhereClause(filters: FilterOperator[], includeDeleted: boolean = false): SQL[] {
    const conditions: SQL[] = [];

    // Handle soft deletes
    if (!includeDeleted) {
      conditions.push(isNull((this.table as any).deleted_at));
    }

    for (const filter of filters) {
      const column = this.table[filter.field as keyof typeof this.table] as PgColumn;
      if (!column) continue;

      switch (filter.operator) {
        case 'eq':
          conditions.push(eq(column, filter.value));
          break;
        case 'ne':
          conditions.push(sql`${column} != ${filter.value}`);
          break;
        case 'lt':
          conditions.push(lt(column, filter.value));
          break;
        case 'gt':
          conditions.push(gt(column, filter.value));
          break;
        case 'lte':
          conditions.push(lte(column, filter.value));
          break;
        case 'gte':
          conditions.push(gte(column, filter.value));
          break;
        case 'in':
          const values = Array.isArray(filter.value) ? filter.value : [filter.value];
          conditions.push(inArray(column, values));
          break;
        case 'prefix':
          conditions.push(ilike(column, `${filter.value}%`));
          break;
        case 'suffix':
          conditions.push(ilike(column, `%${filter.value}`));
          break;
        case 'substr':
          conditions.push(ilike(column, `%${filter.value}%`));
          break;
      }
    }

    return conditions;
  }

  private buildOrderBy(sortParam?: string): SQL[] {
    if (!sortParam) {
      return [desc((this.table as any).created_at)];
    }

    const sorts = sortParam.split(',');
    const orderBy: SQL[] = [];

    for (const sort of sorts) {
      let field = sort.trim();
      let direction: 'asc' | 'desc' = 'asc';

      if (field.startsWith('desc_')) {
        field = field.slice(5);
        direction = 'desc';
      }

      const column = this.table[field as keyof typeof this.table] as PgColumn;
      if (column) {
        orderBy.push(direction === 'desc' ? desc(column) : asc(column));
      }
    }

    return orderBy.length > 0 ? orderBy : [desc((this.table as any).created_at)];
  }

  private buildSelect(selectParam?: string): Record<string, PgColumn> | undefined {
    if (!selectParam) return undefined;

    const fields = selectParam.split(',').map((f) => f.trim());
    const select: Record<string, PgColumn> = {};

    for (const field of fields) {
      const column = this.table[field as keyof typeof this.table] as PgColumn;
      if (column) {
        select[field] = column;
      }
    }

    return Object.keys(select).length > 0 ? select : undefined;
  }

  async findMany(params: QueryParams = {}): Promise<QueryResult<T>> {
    try {
      const page = Math.max(1, params.page || 1);
      const limit = Math.min(100, Math.max(1, params.limit || 10));
      const offset = (page - 1) * limit;
      const includeDeleted = params.deleted === true;

      const filters = this.parseFilters(params);
      const whereConditions = this.buildWhereClause(filters, includeDeleted);
      const orderBy = this.buildOrderBy(params.sort);
      const selectFields = this.buildSelect(params.select);

      let baseQuery = db.select(selectFields!).from(this.table);

      let query = baseQuery;
      if (whereConditions.length > 0) {
        query = query.where(and(...whereConditions)) as typeof query;
      }

      // Get total count
      const countQuery = db.select({ count: sql<number>`count(*)` }).from(this.table);

      if (whereConditions.length > 0) {
        countQuery.where(and(...whereConditions));
      }

      const [data, countResult] = await Promise.all([
        query
          .orderBy(...orderBy)
          .limit(limit)
          .offset(offset),
        countQuery,
      ]);

      const total = countResult[0]?.count || 0;
      const totalPages = Math.ceil(total / limit);

      return {
        data: data as T[],
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      logger.error(`Error in findMany for ${this.modelName}:`, error);
      throw error;
    }
  }

  async findById(id: string, includeDeleted: boolean = false): Promise<T | null> {
    try {
      const conditions = [eq((this.table as any).id, id)];

      if (!includeDeleted) {
        conditions.push(isNull((this.table as any).deleted_at));
      }

      const result = await db
        .select()
        .from(this.table)
        .where(and(...conditions))
        .limit(1);

      return (result[0] as T) || null;
    } catch (error) {
      logger.error(`Error in findById for ${this.modelName}:`, error);
      throw error;
    }
  }

  async create(data: Omit<T, 'wid' | 'id' | 'created_at' | 'deleted_at'>): Promise<T> {
    try {
      const id = generateXid();
      const newRecord = {
        ...data,
        id,
      };

      const result = await db.insert(this.table).values(newRecord).returning();

      logger.info(`Created new ${this.modelName} with id: ${id}`);
      return result[0] as unknown as T;
    } catch (error) {
      logger.error(`Error in create for ${this.modelName}:`, error);
      throw error;
    }
  }

  async update(id: string, data: Partial<Omit<T, 'wid' | 'id' | 'created_at'>>): Promise<T | null> {
    try {
      const result = await db
        .update(this.table)
        .set(data)
        .where(and(eq((this.table as any).id, id), isNull((this.table as any).deleted_at)))
        .returning();

      if (result.length === 0) {
        return null;
      }

      logger.info(`Updated ${this.modelName} with id: ${id}`);
      return result[0] as T;
    } catch (error) {
      logger.error(`Error in update for ${this.modelName}:`, error);
      throw error;
    }
  }

  async softDelete(id: string): Promise<boolean> {
    try {
      const result = await db
        .update(this.table)
        .set({ deleted_at: new Date() })
        .where(and(eq((this.table as any).id, id), isNull((this.table as any).deleted_at)))
        .returning();

      const success = result.length > 0;
      if (success) {
        logger.info(`Soft deleted ${this.modelName} with id: ${id}`);
      }
      return success;
    } catch (error) {
      logger.error(`Error in softDelete for ${this.modelName}:`, error);
      throw error;
    }
  }

  async hardDelete(id: string): Promise<boolean> {
    try {
      const result = await db
        .delete(this.table)
        .where(eq((this.table as any).id, id))
        .returning();

      const success = result.length > 0;
      if (success) {
        logger.info(`Hard deleted ${this.modelName} with id: ${id}`);
      }
      return success;
    } catch (error) {
      logger.error(`Error in hardDelete for ${this.modelName}:`, error);
      throw error;
    }
  }

  async restore(id: string): Promise<T | null> {
    try {
      const result = await db
        .update(this.table)
        .set({ deleted_at: null })
        .where(and(eq((this.table as any).id, id), isNotNull((this.table as any).deleted_at)))
        .returning();

      if (result.length === 0) {
        return null;
      }

      logger.info(`Restored ${this.modelName} with id: ${id}`);
      return result[0] as T;
    } catch (error) {
      logger.error(`Error in restore for ${this.modelName}:`, error);
      throw error;
    }
  }

  async bulkCreate(items: Omit<T, 'wid' | 'id' | 'created_at' | 'deleted_at'>[]): Promise<T[]> {
    try {
      const newRecords = items.map((item) => ({
        ...item,
        id: generateXid(),
      }));

      const result = await db.insert(this.table).values(newRecords).returning();

      logger.info(`Bulk created ${result.length} ${this.modelName} records`);
      return result as unknown as T[];
    } catch (error) {
      logger.error(`Error in bulkCreate for ${this.modelName}:`, error);
      throw error;
    }
  }

  async count(params: QueryParams = {}): Promise<number> {
    try {
      const includeDeleted = params.deleted === true;
      const filters = this.parseFilters(params);
      const whereConditions = this.buildWhereClause(filters, includeDeleted);

      const query = db
        .select({ count: sql<number>`count(*)` })
        .from(this.table)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);

      const result = await query;
      return result[0]?.count || 0;
    } catch (error) {
      logger.error(`Error in count for ${this.modelName}:`, error);
      throw error;
    }
  }
}
