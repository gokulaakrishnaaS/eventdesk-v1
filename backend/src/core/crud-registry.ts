
import { CrudEngine } from './crud-engine';
import { PgTable } from 'drizzle-orm/pg-core';
import { StandardEntity } from '../types/common';

export class CrudRegistry {
  private static instance: CrudRegistry;
  private engines: Map<string, CrudEngine<any>> = new Map();

  private constructor() {}

  static getInstance(): CrudRegistry {
    if (!CrudRegistry.instance) {
      CrudRegistry.instance = new CrudRegistry();
    }
    return CrudRegistry.instance;
  }

  register<T extends StandardEntity>(
    modelName: string,
    table: PgTable
  ): CrudEngine<T> {
    const engine = new CrudEngine<T>(table, modelName);
    this.engines.set(modelName, engine);
    return engine;
  }

  get<T extends StandardEntity>(modelName: string): CrudEngine<T> | null {
    return this.engines.get(modelName) || null;
  }

  getAll(): string[] {
    return Array.from(this.engines.keys());
  }
}
