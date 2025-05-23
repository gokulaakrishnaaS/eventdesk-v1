
import { Router, Request, Response, NextFunction } from 'express';
import { CrudRegistry } from '../core/crud-registry';
import { validateQuery, validateBody, querySchema, createSchema, updateSchema } from '../middleware/validation';
import { logger } from '../utils/logger';

export function createCrudRoutes(modelName: string): Router {
  const router = Router();
  const registry = CrudRegistry.getInstance();

  // Get CRUD engine for this model
  const getEngine = () => {
    const engine = registry.get(modelName);
    if (!engine) {
      throw new Error(`CRUD engine not found for model: ${modelName}`);
    }
    return engine;
  };

  // GET /:model - List records with filtering, pagination, sorting
  router.get('/', validateQuery(querySchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const engine = getEngine();
      const result = await engine.findMany(req.query);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // GET /:model/count - Get record count
  router.get('/count', validateQuery(querySchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const engine = getEngine();
      const count = await engine.count(req.query);
      res.json({ count });
    } catch (error) {
      next(error);
    }
  });

  // GET /:model/:id - Get single record by ID
  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const engine = getEngine();
      const { id } = req.params;
      const includeDeleted = req.query.deleted === 'true';
      
      const record = await engine.findById(id, includeDeleted);
      
      if (!record) {
        return res.status(404).json({ error: 'Record not found' });
      }
      
      res.json(record);
    } catch (error) {
      next(error);
    }
  });

    // POST /:model - Create a new record
  router.post('/', validateBody(createSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const engine = getEngine();
      const data = req.body;

      const created = await engine.create(data);
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });


  return router;
}
