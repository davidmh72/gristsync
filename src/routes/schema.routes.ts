import { Router, Request, Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import {
  getTenantConfig,
  setTenantConfig,
  getTenantByDocId,
  saveTenantConfigToDisk,
} from '../config/tenantConfig';
import { fetchMailchimpMergeFields } from '../services/mailchimp.service';
import { fetchGristColumns } from '../services/grist.service';
import { RawTenantConfig } from '../types/sync.types';

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

/**
 * GET /api/schema/tenant-by-doc/:docId
 * Matches a Grist document ID to a registered tenant configuration
 */
router.get('/api/schema/tenant-by-doc/:docId', (req: Request, res: Response): void => {
  const { docId } = req.params;
  const config = getTenantByDocId(docId);

  if (!config) {
    res.status(404).json({ error: `No tenant configured for docId: ${docId}` });
    return;
  }

  res.status(200).json({
    tenantId: config.tenantId,
    docId: config.grist.docId,
    tableId: config.grist.tableId,
  });
});

/**
 * POST /api/schema/tenant/init
 * Dynamically initializes a new tenant configuration from the custom widget UI
 */
router.post('/api/schema/tenant/init', (req: Request, res: Response): void => {
  const {
    tenantId,
    docId,
    tableId,
    gristApiUrl,
    gristApiKey,
    mailchimpListId,
    mailchimpApiKey,
    mailchimpServerPrefix,
    fieldMapping,
    rules,
  } = req.body;

  if (!docId || !gristApiUrl || !gristApiKey || !mailchimpListId || !mailchimpApiKey || !mailchimpServerPrefix) {
    res.status(400).json({
      error: 'Missing required parameters: docId, gristApiUrl, gristApiKey, mailchimpListId, mailchimpApiKey, and mailchimpServerPrefix are required.',
    });
    return;
  }

  const assignedTenantId = tenantId && typeof tenantId === 'string' && tenantId.trim() !== ''
    ? tenantId.trim()
    : `tenant-${crypto.randomBytes(4).toString('hex')}`;

  const rawConfig: RawTenantConfig = {
    tenant_id: assignedTenantId,
    grist: {
      doc_id: docId,
      table_id: tableId || 'Contacts',
      api_url: gristApiUrl,
      api_key: gristApiKey,
    },
    mailchimp: {
      list_id: mailchimpListId,
      api_key: mailchimpApiKey,
      server_prefix: mailchimpServerPrefix,
    },
    field_mapping: fieldMapping || {
      external_email: 'Email_1',
      external_first_name: 'First_Name',
      external_last_name: 'Last_Name',
    },
    rules: {
      lock_email_if_mailchimp_id_exists: rules?.lockEmailIfMailchimpIdExists ?? true,
      field_directions: rules?.fieldDirections || {},
    },
  };

  const configDir = process.env.CONFIG_DIR || path.resolve(process.cwd(), 'configs');

  try {
    const saved = saveTenantConfigToDisk(rawConfig, configDir);
    res.status(201).json({
      status: 'success',
      tenantId: saved.tenantId,
      config: {
        tenantId: saved.tenantId,
        grist: {
          docId: saved.grist.docId,
          tableId: saved.grist.tableId,
          apiUrl: saved.grist.apiUrl,
        },
        mailchimp: {
          listId: saved.mailchimp.listId,
          serverPrefix: saved.mailchimp.serverPrefix,
        },
        fieldMapping: saved.fieldMapping,
        rules: saved.rules,
      },
    });
  } catch (error: any) {
    console.error(`[Schema Router] Failed to initialize tenant config:`, error.message);
    res.status(500).json({
      error: `Failed to persist tenant config: ${error.message}`,
    });
  }
});

export default router;
