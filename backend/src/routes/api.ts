
import { Router } from 'express';
import { createCrudRoutes } from './crud-routes';
import { CrudRegistry } from '../core/crud-registry';

export function createApiRoutes(): Router {
  const router = Router();
  const registry = CrudRegistry.getInstance();

  // Health check endpoint
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      models: registry.getAll(),
    });
  });

  // Dynamic model routes
  router.use('/:model', (req, res, next) => {
    const { model } = req.params;
    const engine = registry.get(model);
    
    if (!engine) {
      return res.status(404).json({
        error: `Model '${model}' not found`,
        availableModels: registry.getAll(),
      });
    }
    
    // Mount CRUD routes for this model
    const crudRouter = createCrudRoutes(model);
    crudRouter(req, res, next);
  });

  return router;
}