
export interface StandardEntity {
  wid: number;
  id: string;
  name: string;
  data: Record<string, any>;
  created_at: Date;
  deleted_at: Date | null;
}

export interface QueryParams {
  page?: number;
  limit?: number;
  sort?: string;
  select?: string;
  deleted?: boolean;
  [key: string]: any; 
}

export interface QueryResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface FilterOperator {
  field: string;
  operator: 'eq' | 'ne' | 'lt' | 'gt' | 'lte' | 'gte' | 'in' | 'prefix' | 'suffix' | 'substr';
  value: any;
}