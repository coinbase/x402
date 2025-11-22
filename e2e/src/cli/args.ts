import { TestFilters } from './filters';

/**
 * Parse command-line arguments
 * Used primarily for CI/GitHub workflows
 */
export interface ParsedArgs {
  mode: 'interactive' | 'programmatic';
  verbose: boolean;
  logFile?: string;
  filters: TestFilters;
  showHelp: boolean;
  minimize: boolean;
}

export function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);

  // Help flag
  if (args.includes('-h') || args.includes('--help')) {
    return {
      mode: 'interactive',
      verbose: false,
      filters: {},
      showHelp: true,
      minimize: false
    };
  }

  // Check if any filter args present -> programmatic mode
  const hasFilterArgs = args.some(arg => 
    arg.startsWith('--facilitators=') ||
    arg.startsWith('--servers=') ||
    arg.startsWith('--clients=') ||
    arg.startsWith('--extensions=') ||
    arg.startsWith('--versions=') ||
    arg.startsWith('--families=')
  );

  const mode: 'interactive' | 'programmatic' = hasFilterArgs ? 'programmatic' : 'interactive';

  // Parse verbose
  const verbose = args.includes('-v') || args.includes('--verbose');

  // Parse log file
  const logFile = args.find(arg => arg.startsWith('--log-file='))?.split('=')[1];

  // Parse minimize flag
  const minimize = args.includes('--min');

  // Parse filters (comma-separated lists)
  const facilitators = parseListArg(args, '--facilitators');
  const servers = parseListArg(args, '--servers');
  const clients = parseListArg(args, '--clients');
  const extensions = parseListArg(args, '--extensions');
  const versions = parseListArg(args, '--versions')?.map(v => parseInt(v));
  const families = parseListArg(args, '--families');

  return {
    mode,
    verbose,
    logFile,
    filters: {
      facilitators,
      servers,
      clients,
      extensions,
      versions,
      protocolFamilies: families,
    },
    showHelp: false,
    minimize
  };
}

function parseListArg(args: string[], argName: string): string[] | undefined {
  const arg = args.find(a => a.startsWith(`${argName}=`));
  if (!arg) return undefined;
  const value = arg.split('=')[1];
  return value.split(',').map(v => v.trim()).filter(v => v.length > 0);
}

export function printHelp(): void {
  console.log('Usage: pnpm test [options]');
  console.log('');
  console.log('Interactive Mode (default):');
  console.log('  pnpm test                  Launch interactive prompt mode');
  console.log('  pnpm test -v               Interactive with verbose logging');
  console.log('');
  console.log('Programmatic Mode (for CI/workflows):');
  console.log('  --facilitators=<list>      Comma-separated facilitator names');
  console.log('  --servers=<list>           Comma-separated server names');
  console.log('  --clients=<list>           Comma-separated client names');
  console.log('  --extensions=<list>        Comma-separated extensions (e.g., bazaar)');
  console.log('  --versions=<list>          Comma-separated version numbers (e.g., 1,2)');
  console.log('  --families=<list>          Comma-separated protocol families (e.g., evm,svm)');
  console.log('');
  console.log('Options:');
  console.log('  -v, --verbose              Enable verbose logging');
  console.log('  --log-file=<path>          Save verbose output to file');
  console.log('  --min                      Minimize tests (coverage-based skipping)');
  console.log('  -h, --help                 Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  pnpm test                                           # Interactive mode');
  console.log('  pnpm test -v                                        # Interactive with verbose');
  console.log('  pnpm test --min                                     # Minimize tests');
  console.log('  pnpm test --facilitators=go --servers=express       # Programmatic');
  console.log('  pnpm test --facilitators=go,typescript \\');
  console.log('            --servers=legacy-express \\');
  console.log('            --clients=go-http \\');
  console.log('            --extensions=bazaar -v                    # Full example');
  console.log('  pnpm test --min --facilitators=go,typescript \\');
  console.log('            --extensions=bazaar -v                    # Minimized with filters');
  console.log('');
  console.log('Note: Extensions control test output visibility, not scenario filtering');
  console.log('');
}

