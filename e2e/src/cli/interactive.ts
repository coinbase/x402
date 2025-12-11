import prompts from 'prompts';
import { DiscoveredClient, DiscoveredServer, DiscoveredFacilitator, TestScenario } from '../types';
import { TestFilters, getUniqueVersions, getUniqueProtocolFamilies } from './filters';
import { log } from '../logger';

export interface InteractiveSelections extends TestFilters {
  // All fields from TestFilters
}

/**
 * Run interactive mode to select test scenarios
 * 
 * @param allClients - All discovered clients
 * @param allServers - All discovered servers
 * @param allFacilitators - All discovered facilitators
 * @param allScenarios - All test scenarios
 * @param minimize - If true (--min flag), default all items selected. If false, default none selected.
 */
export async function runInteractiveMode(
  allClients: DiscoveredClient[],
  allServers: DiscoveredServer[],
  allFacilitators: DiscoveredFacilitator[],
  allScenarios: TestScenario[],
  minimize: boolean = false
): Promise<InteractiveSelections | null> {

  log('\n🎯 Interactive Mode');
  log('==================\n');

  // Question 1: Select facilitators (multi-select)
  // Sort facilitators: regular ones first, external ones at the bottom
  const regularFacilitators = allFacilitators.filter(f => !f.isExternal);
  const externalFacilitators = allFacilitators.filter(f => f.isExternal);
  
  const facilitatorChoices: any[] = [];
  
  // Add regular facilitators
  regularFacilitators.forEach(f => {
    facilitatorChoices.push({
      title: `${f.name} (${formatVersions(f.config.x402Versions)}) [${f.config.protocolFamilies?.join(', ') || ''}]${f.config.extensions ? ' {' + f.config.extensions.join(', ') + '}' : ''}`,
      value: f.name,
      selected: minimize // With --min: all selected. Without --min: none selected
    });
  });
  
  // Add external facilitators section if any exist
  if (externalFacilitators.length > 0) {
    // Add separator/header for external facilitators
    facilitatorChoices.push({
      title: '────────── External ──────────',
      value: '__external_separator__',
      disabled: true
    });
    
    externalFacilitators.forEach(f => {
      facilitatorChoices.push({
        title: `${f.name} (${formatVersions(f.config.x402Versions)}) [${f.config.protocolFamilies?.join(', ') || ''}]${f.config.extensions ? ' {' + f.config.extensions.join(', ') + '}' : ''}`,
        value: f.name,
        selected: false // External facilitators are never selected by default
      });
    });
  }

  const facilitatorsResponse = await prompts({
    type: 'multiselect',
    name: 'facilitators',
    message: 'Select facilitators',
    choices: facilitatorChoices,
    min: 1,
    hint: 'Space to select, Enter to confirm',
    instructions: false
  });

  if (!facilitatorsResponse.facilitators || facilitatorsResponse.facilitators.length === 0) {
    return null; // User cancelled
  }

  // Question 2: Select servers (multi-select)
  const serverChoices = allServers.map(s => {
    const families = Array.from(new Set(s.config.endpoints?.map(e => e.protocolFamily).filter(Boolean))) || [];
    const extInfo = s.config.extensions ? ' {' + s.config.extensions.join(', ') + '}' : '';
    return {
      title: `${s.name} (v${s.config.x402Version}) [${families.join(', ')}]${extInfo}`,
      value: s.name,
      selected: minimize // With --min: all selected. Without --min: none selected
    };
  });

  const serversResponse = await prompts({
    type: 'multiselect',
    name: 'servers',
    message: 'Select servers',
    choices: serverChoices,
    min: 1,
    hint: 'Space to select, Enter to confirm',
    instructions: false
  });

  if (!serversResponse.servers || serversResponse.servers.length === 0) {
    return null;
  }

  // Question 3: Select clients (multi-select)
  const clientChoices = allClients.map(c => ({
    title: `${c.name} (${formatVersions(c.config.x402Versions)}) [${c.config.protocolFamilies?.join(', ') || ''}]`,
    value: c.name,
    selected: minimize // With --min: all selected. Without --min: none selected
  }));

  const clientsResponse = await prompts({
    type: 'multiselect',
    name: 'clients',
    message: 'Select clients',
    choices: clientChoices,
    min: 1,
    hint: 'Space to select, Enter to confirm',
    instructions: false
  });

  if (!clientsResponse.clients || clientsResponse.clients.length === 0) {
    return null;
  }

  // Question 4: Select extensions (ALWAYS shown if any available, determines test output visibility)
  log('\n🔍 Detecting available extensions from selections...\n');

  const availableExtensions = getAvailableExtensions(
    facilitatorsResponse.facilitators,
    serversResponse.servers,
    allFacilitators,
    allServers
  );

  let selectedExtensions: string[] | undefined;

  if (availableExtensions.length > 0) {
    const extensionChoices = availableExtensions.map(ext => ({
      title: `${ext.name} (${ext.description})`,
      value: ext.name,
      selected: true // Default all selected
    }));

    const extensionsResponse = await prompts({
      type: 'multiselect',
      name: 'extensions',
      message: 'Select extensions (controls test output visibility)',
      choices: extensionChoices,
      hint: 'Space to select, Enter to confirm or skip',
      instructions: false
    });

    selectedExtensions = extensionsResponse.extensions;

    if (selectedExtensions && selectedExtensions.length > 0) {
      log(`ℹ️  Extensions enabled: ${selectedExtensions.join(', ')}`);
      log('   (Extension validation output will be shown)\n');
    }
  }

  // Now analyze what scenarios would be generated from these selections
  log('🔍 Analyzing remaining scenarios...\n');

  const preliminaryScenarios = filterScenariosBySelections(
    allScenarios,
    {
      facilitators: facilitatorsResponse.facilitators,
      servers: serversResponse.servers,
      clients: clientsResponse.clients
    }
  );

  // Question 5 (CONDITIONAL): Select versions IF multiple versions exist in remaining scenarios
  const availableVersions = getUniqueVersions(preliminaryScenarios);
  let selectedVersions: number[] | undefined;

  if (availableVersions.length > 1) {
    const versionChoices = availableVersions.map(v => {
      const count = preliminaryScenarios.filter(s => s.server.config.x402Version === v).length;
      return {
        title: `v${v} (${count} scenarios)`,
        value: v,
        selected: true
      };
    });

    const versionsResponse = await prompts({
      type: 'multiselect',
      name: 'versions',
      message: 'Select x402 versions',
      choices: versionChoices,
      min: 1,
      hint: 'Space to select, Enter to confirm',
      instructions: false
    });

    if (!versionsResponse.versions || versionsResponse.versions.length === 0) {
      return null;
    }

    selectedVersions = versionsResponse.versions;
  } else if (availableVersions.length === 1) {
    // Auto-select if only one version
    selectedVersions = availableVersions;
  }

  // Question 6 (CONDITIONAL): Select protocol families IF multiple families exist
  const availableFamilies = getUniqueProtocolFamilies(preliminaryScenarios);
  let selectedFamilies: string[] | undefined;

  if (availableFamilies.length > 1) {
    const familyChoices = availableFamilies.map(f => {
      const count = preliminaryScenarios.filter(s => s.protocolFamily === f).length;
      return {
        title: `${f.toUpperCase()} (${count} scenarios)`,
        value: f,
        selected: true
      };
    });

    const familiesResponse = await prompts({
      type: 'multiselect',
      name: 'families',
      message: 'Select protocol families',
      choices: familyChoices,
      min: 1,
      hint: 'Space to select, Enter to confirm',
      instructions: false
    });

    if (!familiesResponse.families || familiesResponse.families.length === 0) {
      return null;
    }

    selectedFamilies = familiesResponse.families;
  } else if (availableFamilies.length === 1) {
    // Auto-select if only one family
    selectedFamilies = availableFamilies;
  }

  return {
    facilitators: facilitatorsResponse.facilitators,
    servers: serversResponse.servers,
    clients: clientsResponse.clients,
    extensions: selectedExtensions,
    versions: selectedVersions,
    protocolFamilies: selectedFamilies,
  };
}

/**
 * Get available extensions from selected facilitators and servers
 */
function getAvailableExtensions(
  facilitatorNames: string[],
  serverNames: string[],
  allFacilitators: DiscoveredFacilitator[],
  allServers: DiscoveredServer[]
): Array<{ name: string; description: string }> {
  const extensions = new Set<string>();
  const extensionInfo: Record<string, string> = {
    'bazaar': 'Discovery extension for resource discovery',
  };

  // Collect from facilitators
  facilitatorNames.forEach(name => {
    const facilitator = allFacilitators.find(f => f.name === name);
    if (facilitator?.config.extensions) {
      facilitator.config.extensions.forEach(ext => extensions.add(ext));
    }
  });

  // Collect from servers
  serverNames.forEach(name => {
    const server = allServers.find(s => s.name === name);
    if (server?.config.extensions) {
      server.config.extensions.forEach(ext => extensions.add(ext));
    }
  });

  return Array.from(extensions).map(ext => ({
    name: ext,
    description: extensionInfo[ext] || ext
  }));
}

/**
 * Filter scenarios based on preliminary selections (before version/family filtering)
 */
function filterScenariosBySelections(
  scenarios: TestScenario[],
  selections: { facilitators: string[]; servers: string[]; clients: string[] }
): TestScenario[] {
  return scenarios.filter(scenario => {
    // Facilitator filter
    const facilitatorName = scenario.facilitator?.name;
    if (!facilitatorName || !selections.facilitators.includes(facilitatorName)) {
      return false;
    }

    // Server filter
    if (!selections.servers.includes(scenario.server.name)) {
      return false;
    }

    // Client filter
    if (!selections.clients.includes(scenario.client.name)) {
      return false;
    }

    return true;
  });
}

/**
 * Format version array for display
 */
function formatVersions(versions?: number[]): string {
  if (!versions || versions.length === 0) return 'v?';
  if (versions.length === 1) return `v${versions[0]}`;
  return `v${versions.join(', v')}`;
}

