import chalk from 'chalk';

export const logger = {
  success: (message: string) => console.log(chalk.green('✓'), message),
  error: (message: string) => console.log(chalk.red('✗'), message),
  info: (message: string) => console.log(chalk.blue('ℹ'), message),
  warn: (message: string) => console.log(chalk.yellow('⚠'), message),
  step: (message: string) => console.log(chalk.cyan('→'), message),
  log: (message: string) => console.log(message),
  header: (message: string) => {
    console.log('\n' + chalk.bold.underline(message));
  },
  json: (data: any) => console.log(JSON.stringify(data, null, 2)),
  keyValue: (key: string, value: string) => {
    console.log(`  ${chalk.gray(key + ':')} ${value}`);
  }
};
