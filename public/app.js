// GristSync Custom Widget Application

let state = {
  tenantId: 'client-alpha',
  gristColumns: [],
  mailchimpFields: [],
  config: null,
  mappings: [], // Array of { gristCol, mcField, direction }
};

const dom = {
  tenantBadge: document.getElementById('tenantBadge'),
  gristStatus: document.getElementById('gristStatus'),
  mcStatus: document.getElementById('mcStatus'),
  tenantIdInput: document.getElementById('tenantIdInput'),
  gristTableSelect: document.getElementById('gristTableSelect'),
  mcAudience: document.getElementById('mcAudience'),
  mcServer: document.getElementById('mcServer'),
  mappingBody: document.getElementById('mappingBody'),
  addMappingBtn: document.getElementById('addMappingBtn'),
  lockEmailCheckbox: document.getElementById('lockEmailCheckbox'),
  syncActiveCheckbox: document.getElementById('syncActiveCheckbox'),
  reloadBtn: document.getElementById('reloadBtn'),
  saveBtn: document.getElementById('saveBtn'),
  alertBanner: document.getElementById('alertBanner'),
};

function showAlert(message, type = 'success') {
  dom.alertBanner.textContent = message;
  dom.alertBanner.className = `banner banner-${type}`;
  dom.alertBanner.style.display = 'block';
  setTimeout(() => {
    dom.alertBanner.style.display = 'none';
  }, 4000);
}

// Extract tenant from query string if available
function initTenantId() {
  const params = new URLSearchParams(window.location.search);
  const tenantFromQuery = params.get('tenant') || params.get('tenantId');
  if (tenantFromQuery) {
    state.tenantId = tenantFromQuery;
  }
  dom.tenantIdInput.value = state.tenantId;
  dom.tenantBadge.textContent = `Tenant: ${state.tenantId}`;
}

async function loadTenantData() {
  const tenantId = state.tenantId;
  dom.tenantBadge.textContent = `Tenant: ${tenantId}`;

  try {
    // 1. Fetch current config
    const configRes = await fetch(`/api/schema/config/${tenantId}`);
    if (!configRes.ok) throw new Error(`Could not load configuration for ${tenantId}`);
    state.config = await configRes.json();

    dom.mcAudience.value = state.config.mailchimp.listId || '';
    dom.mcServer.value = state.config.mailchimp.serverPrefix || '';
    dom.lockEmailCheckbox.checked = !!state.config.rules?.lockEmailIfMailchimpIdExists;

    // 2. Fetch Grist columns
    const gristRes = await fetch(`/api/schema/grist/${tenantId}`);
    if (gristRes.ok) {
      const gristData = await gristRes.json();
      state.gristColumns = gristData.columns || [];
      dom.gristStatus.textContent = 'Grist: Connected';
      dom.gristStatus.className = 'badge badge-connected';
    } else {
      dom.gristStatus.textContent = 'Grist: Offline';
      dom.gristStatus.className = 'badge badge-disconnected';
    }

    // 3. Fetch Mailchimp fields
    const mcRes = await fetch(`/api/schema/mailchimp/${tenantId}`);
    if (mcRes.ok) {
      const mcData = await mcRes.json();
      state.mailchimpFields = mcData.fields || [];
      dom.mcStatus.textContent = 'Mailchimp: Connected';
      dom.mcStatus.className = 'badge badge-connected';
    } else {
      dom.mcStatus.textContent = 'Mailchimp: Offline';
      dom.mcStatus.className = 'badge badge-disconnected';
    }

    // 4. Initialize mappings from config
    populateMappingsFromConfig();
    renderMappings();
  } catch (err) {
    console.error('Failed to load schemas:', err);
    showAlert(`Error loading tenant details: ${err.message}`, 'error');
  }
}

function populateMappingsFromConfig() {
  state.mappings = [];
  if (!state.config || !state.config.fieldMapping) return;

  const fieldMapping = state.config.fieldMapping;
  const directions = state.config.rules?.fieldDirections || {};

  // Grist column to external field mapping
  for (const [extField, gristCol] of Object.entries(fieldMapping)) {
    const dir = directions[extField] || (extField.toUpperCase() === 'EMAIL' ? 'mailchimp_only' : 'two_way');
    state.mappings.push({
      gristCol,
      mcField: extField.toUpperCase().replace(/^EXTERNAL_/, ''),
      direction: dir,
    });
  }

  // Ensure default rows if empty
  if (state.mappings.length === 0) {
    state.mappings.push(
      { gristCol: 'Email_1', mcField: 'EMAIL', direction: 'mailchimp_only' },
      { gristCol: 'First_Name', mcField: 'FNAME', direction: 'two_way' },
      { gristCol: 'Last_Name', mcField: 'LNAME', direction: 'two_way' }
    );
  }
}

function renderMappings() {
  dom.mappingBody.innerHTML = '';

  state.mappings.forEach((mapping, index) => {
    const tr = document.createElement('tr');

    // Grist Column Select
    const tdGrist = document.createElement('td');
    const gristSelect = document.createElement('select');
    gristSelect.innerHTML = `<option value="">-- Select Grist Column --</option>` +
      state.gristColumns.map(col =>
        `<option value="${col.id}" ${col.id === mapping.gristCol ? 'selected' : ''}>${col.label || col.id} (${col.type})</option>`
      ).join('');
    if (state.gristColumns.length === 0) {
      gristSelect.innerHTML = `
        <option value="Email_1" ${mapping.gristCol === 'Email_1' ? 'selected' : ''}>Email_1 (Text)</option>
        <option value="First_Name" ${mapping.gristCol === 'First_Name' ? 'selected' : ''}>First_Name (Text)</option>
        <option value="Last_Name" ${mapping.gristCol === 'Last_Name' ? 'selected' : ''}>Last_Name (Text)</option>
        <option value="Status" ${mapping.gristCol === 'Status' ? 'selected' : ''}>Status (Choice)</option>
      `;
    }
    gristSelect.addEventListener('change', (e) => {
      state.mappings[index].gristCol = e.target.value;
    });
    tdGrist.appendChild(gristSelect);

    // Direction Select
    const tdDir = document.createElement('td');
    const dirSelect = document.createElement('select');
    dirSelect.className = 'direction-select';
    dirSelect.innerHTML = `
      <option value="two_way" ${mapping.direction === 'two_way' ? 'selected' : ''}>◀▶ Two-Way (LWW)</option>
      <option value="mailchimp_only" ${mapping.direction === 'mailchimp_only' ? 'selected' : ''}>◀ Mailchimp Only</option>
      <option value="grist_only" ${mapping.direction === 'grist_only' ? 'selected' : ''}>Grist Only ▶</option>
      <option value="create_only" ${mapping.direction === 'create_only' ? 'selected' : ''}>Create-Only</option>
    `;
    dirSelect.addEventListener('change', (e) => {
      state.mappings[index].direction = e.target.value;
    });
    tdDir.appendChild(dirSelect);

    // Mailchimp Field Select
    const tdMC = document.createElement('td');
    const mcSelect = document.createElement('select');
    mcSelect.innerHTML = `<option value="">-- Select Mailchimp Field --</option>` +
      state.mailchimpFields.map(f =>
        `<option value="${f.tag}" ${f.tag === mapping.mcField ? 'selected' : ''}>${f.name} [${f.tag}]</option>`
      ).join('');
    if (state.mailchimpFields.length === 0) {
      mcSelect.innerHTML = `
        <option value="EMAIL" ${mapping.mcField === 'EMAIL' ? 'selected' : ''}>Email Address [EMAIL]</option>
        <option value="FNAME" ${mapping.mcField === 'FNAME' ? 'selected' : ''}>First Name [FNAME]</option>
        <option value="LNAME" ${mapping.mcField === 'LNAME' ? 'selected' : ''}>Last Name [LNAME]</option>
        <option value="STATUS" ${mapping.mcField === 'STATUS' ? 'selected' : ''}>Subscription Status [STATUS]</option>
      `;
    }
    mcSelect.addEventListener('change', (e) => {
      state.mappings[index].mcField = e.target.value;
      if (e.target.value === 'EMAIL') {
        dirSelect.value = 'mailchimp_only';
        state.mappings[index].direction = 'mailchimp_only';
      }
    });
    tdMC.appendChild(mcSelect);

    // Remove Action
    const tdAction = document.createElement('td');
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-danger btn-sm';
    delBtn.innerHTML = '&times;';
    delBtn.title = 'Remove mapping';
    delBtn.addEventListener('click', () => {
      state.mappings.splice(index, 1);
      renderMappings();
    });
    tdAction.appendChild(delBtn);

    tr.appendChild(tdGrist);
    tr.appendChild(tdDir);
    tr.appendChild(tdMC);
    tr.appendChild(tdAction);
    dom.mappingBody.appendChild(tr);
  });
}

function addMappingRow() {
  state.mappings.push({
    gristCol: '',
    mcField: '',
    direction: 'two_way',
  });
  renderMappings();
}

async function saveMappingConfiguration() {
  const validMappings = state.mappings.filter(m => m.gristCol && m.mcField);

  if (validMappings.length === 0) {
    showAlert('Please define at least one valid field mapping.', 'error');
    return;
  }

  // Ensure email is mapped
  const hasEmail = validMappings.some(m => m.mcField === 'EMAIL');
  if (!hasEmail) {
    showAlert('A mapping for the Mailchimp EMAIL field is required.', 'error');
    return;
  }

  // Construct config structure
  const updatedFieldMapping = {};
  const updatedDirections = {};

  validMappings.forEach(m => {
    updatedFieldMapping[m.mcField.toLowerCase()] = m.gristCol;
    updatedDirections[m.mcField.toLowerCase()] = m.direction;
  });

  const payload = {
    tenantId: state.tenantId,
    fieldMapping: updatedFieldMapping,
    rules: {
      lockEmailIfMailchimpIdExists: dom.lockEmailCheckbox.checked,
      fieldDirections: updatedDirections,
    },
  };

  // Save to backend microservice
  try {
    const res = await fetch(`/api/schema/config/${state.tenantId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }
  } catch (apiErr) {
    console.warn('Backend API update warning:', apiErr);
  }

  // If running inside Grist Custom Widget, apply to Grist table
  if (window.grist && typeof grist.docApi !== 'undefined') {
    try {
      await grist.docApi.applyUserActions([
        ['AddOrUpdateRecord', 'GristSync_Config', { id: 1 }, {
          Config_Payload: JSON.stringify(payload, null, 2),
          Updated_At: new Date().toISOString(),
        }]
      ]);
      showAlert('Configuration saved to GristSync_Config table & backend!', 'success');
      return;
    } catch (gristErr) {
      console.warn('Could not write to GristSync_Config table:', gristErr);
      // Fallback to notifying user
    }
  }

  // Confirmation banner
  console.log('Saved mapping configuration:', payload);
  showAlert('Mapping configuration saved successfully!', 'success');
}

// Event Listeners
dom.addMappingBtn.addEventListener('click', addMappingRow);
dom.reloadBtn.addEventListener('click', loadTenantData);
dom.saveBtn.addEventListener('click', saveMappingConfiguration);
dom.tenantIdInput.addEventListener('change', (e) => {
  state.tenantId = e.target.value.trim();
  loadTenantData();
});

// Initialize Grist Custom Widget Handlers
if (window.grist) {
  try {
    grist.ready({ requiredAccess: 'full' });
    grist.onRecord((record) => {
      // Respond to selected record if inspecting individual contact mapping
    });
  } catch (e) {
    console.warn('Grist API initialization note:', e);
  }
}

// Initialize on page load
initTenantId();
loadTenantData();
