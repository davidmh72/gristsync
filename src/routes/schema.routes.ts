import { Router, Request, Response } from 'express';
import { getTenantConfig, setTenantConfig } from '../config/tenantConfig';
import { fetchMailchimpMergeFields } from '../services/mailchimp.service';
import { fetchGristColumns } from '../services/grist.service';

const router = Router();

/**
 * GET /api/schema/mailchimp/:tenantId
 * Retrieves available standard and merge fields for the tenant's Mailchimp list
 */
router.get('/api/schema/mailchimp/:tenantId', async (req: Request, res: Response): Promise<void> => {
  const { tenantId } = req.params;
  const config = getTenantConfig(tenantId);

  if (!config) {
    res.status(404).json({ error: `Tenant '${tenantId}' not found.` });
    return;
  }

  try {
    const fields = await fetchMailchimpMergeFields(config);
    res.status(200).json({
      tenantId,
      listId: config.mailchimp.listId,
      fields,
    });
  } catch (error: any) {
    console.error(`[Schema Router] Failed to fetch Mailchimp fields for tenant ${tenantId}:`, error.message);
    res.status(502).json({
      error: `Mailchimp introspection failed: ${error.message}`,
    });
  }
});

/**
 * GET /api/schema/grist/:tenantId
 * Retrieves available column definitions for the tenant's Grist table
 */
router.get('/api/schema/grist/:tenantId', async (req: Request, res: Response): Promise<void> => {
  const { tenantId } = req.params;
  const config = getTenantConfig(tenantId);

  if (!config) {
    res.status(404).json({ error: `Tenant '${tenantId}' not found.` });
    return;
  }

  try {
    const columns = await fetchGristColumns(config);
    res.status(200).json({
      tenantId,
      docId: config.grist.docId,
      tableId: config.grist.tableId,
      columns,
    });
  } catch (error: any) {
    console.error(`[Schema Router] Failed to fetch Grist columns for tenant ${tenantId}:`, error.message);
    res.status(502).json({
      error: `Grist introspection failed: ${error.message}`,
    });
  }
});

/**
 * GET /api/schema/config/:tenantId
 * Retrieves current public configuration details and field mappings for the widget UI
 */
router.get('/api/schema/config/:tenantId', (req: Request, res: Response): void => {
  const { tenantId } = req.params;
  const config = getTenantConfig(tenantId);

  if (!config) {
    res.status(404).json({ error: `Tenant '${tenantId}' not found.` });
    return;
  }

  // Omit API keys from public widget payload
  res.status(200).json({
    tenantId: config.tenantId,
    grist: {
      docId: config.grist.docId,
      tableId: config.grist.tableId,
      apiUrl: config.grist.apiUrl,
    },
    mailchimp: {
      listId: config.mailchimp.listId,
      serverPrefix: config.mailchimp.serverPrefix,
    },
    fieldMapping: config.fieldMapping,
    rules: config.rules,
  });
});

/**
 * POST /api/schema/config/:tenantId
 * Saves updated field mappings and rules for the tenant
 */
router.post('/api/schema/config/:tenantId', (req: Request, res: Response): void => {
  const { tenantId } = req.params;
  const config = getTenantConfig(tenantId);

  if (!config) {
    res.status(404).json({ error: `Tenant '${tenantId}' not found.` });
    return;
  }

  const { fieldMapping, rules } = req.body;

  if (fieldMapping && typeof fieldMapping === 'object') {
    config.fieldMapping = fieldMapping;
  }

  if (rules && typeof rules === 'object') {
    config.rules = {
      ...config.rules,
      ...rules,
    };
  }

  setTenantConfig(config);

  res.status(200).json({
    status: 'success',
    message: `Configuration updated for tenant '${tenantId}'.`,
    fieldMapping: config.fieldMapping,
    rules: config.rules,
  });
});

export default router;
