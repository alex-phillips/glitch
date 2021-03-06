const chalk = require('chalk');
const yargs = require('yargs');
const Command = require('./Command');
const Config = require('./Config');
const Logger = require('./Logger');

const defaultCommands = {
  'config': {
    usage: '[flags] [key] [value]',
    desc: 'Read, write, and reset config values',
    options: {
      r: {
        group: 'Flags:',
        alias: 'reset',
        demand: false,
        desc: 'Reset the config option to its default value',
        type: 'boolean',
      },
    },
    file: './ConfigCommand',
  },
  'delete-everything': {
    usage: '',
    desc: 'Remove all files and folders related to the CLI',
    options: {},
    file: './DeleteEverythingCommand',
  },
};
const defaultConfig = {
  'cli.colors': {
    type: 'bool',
    default: true,
  },
  'cli.progressBars': {
    type: 'bool',
    default: true,
  },
  'cli.progressInterval': {
    type: 'string',
    default: 250,
  },
  'cli.timestamp': {
    type: 'bool',
    default: false,
  },
  'json.pretty': {
    type: 'bool',
    default: false,
  },
  'log.file': {
    type: 'string',
    default: '',
  },
  'log.level': {
    type: 'choice',
    default: 'info',
    choices: [
      'info',
      'verbose',
      'debug',
      'silly',
    ],
  },
};
const defaultGlobal = {
  h: {
    group: 'Global Flags:',
    global: true,
  },
  v: {
    group: 'Global Flags:',
    alias: 'verbose',
    demand: false,
    desc: 'Output verbosity (-v, -vv, -vvv)',
    type: 'count',
    global: true,
  },
  q: {
    group: 'Global Flags:',
    alias: 'quiet',
    demand: false,
    desc: 'Suppress all output',
    type: 'boolean',
    global: true,
  },
  V: {
    group: 'Global Flags:',
    global: true,
  },
  ansi: {
    group: 'Global Flags:',
    demand: false,
    desc: 'Control color output',
    type: 'boolean',
    global: true,
  },
  config: {
    group: 'Global Flags:',
    demand: false,
    desc: 'Specify location of config file',
    type: 'string',
  },
};

class climax {
  constructor(name, banner = '') {
    this.name = name;
    this.banner = banner;
  }

  init(commands = {}, config = {}, global = {}) {
    this.commands = Object.assign(defaultCommands, commands);
    this.config = Object.assign(defaultConfig, config);
    this.global = Object.assign(defaultGlobal, global);

    return this;
  }

  setBanner(banner) {
    this.banner = banner;

    return this;
  }

  setName(name) {
    this.name = name;

    return this;
  }

  addCommands(commands, yargs) {
    Object.keys(commands).map(name => {
      const command = commands[name];
      yargs.command(name, command.desc || command.description || false, yargs => {
        let retval = yargs.usage(`${command.desc}\n\n${chalk.magenta('Usage:')}\n  ${name} ${command.usage}`)
          .options(command.options)
          .demand(command.demand || 0)
          .fail(message => {
            yargs.showHelp();
            Logger.error(message);
            Command.shutdown(1);
          });

        if (command.commands) {
          retval = this.addCommands(command.commands, retval);
        }

        return retval;
      }, async argv => {
        let cliVerbosity = 'info';
        switch (parseInt(argv.verbose, 10)) {
          case 1:
            cliVerbosity = 'verbose';
            break;
          case 2:
            cliVerbosity = 'debug';
            break;
          case 3:
            cliVerbosity = 'silly';
            break;
          default:
            break;
        }

        if (argv.quiet) {
          cliVerbosity = 'error';
        }

        let configFile = `${Command.getConfigDirectory()}/${Command.APP_NAME}.ini`;
        if (yargs.argv.config) {
          configFile = yargs.argv.config;
        }

        const config = new Config(configFile, this.config);
        if (process.stdout.isTTY && yargs.argv.ansi !== undefined) {
          chalk.enabled = yargs.argv.ansi;
        } else if (!config.get('cli.colors') || !process.stdout.isTTY) {
          chalk.enabled = false;
        }

        Logger.getInstance({
          file: config.get('log.file'),
          logLevel: config.get('log.level'),
          verbosity: cliVerbosity,
          cliTimestamp: config.get('cli.timestamp'),
          colorize: config.get('cli.colors'),
        });

        // Load in the command file and run
        if (command.file) {
          const Cmd = require(command.file);
          await new Cmd(config).execute(argv._.slice(1), argv);
        } else if (command.func) {
          // Otherwise,
          Command.shutdown(await command.func(argv._.slice(1), argv));
        } else {
          yargs.showHelp();
          Command.shutdown(0);
        }
      });
    });
  }

  async run() {
    Command.setAppName(this.name);

    this.addCommands(this.commands, yargs);

    const { argv } = yargs
      .usage(`${chalk.cyan(this.banner)}
${chalk.cyan(this.name)} version ${chalk.magenta()}

${chalk.magenta('Usage:')}
  $0 command [flags] [options] [arguments]`)
      .help('h')
      .alias('h', 'help')
      .alias('V', 'version')
      .updateStrings({
        'Commands:': chalk.magenta('Commands:'),
        'Flags:': chalk.magenta('Flags:'),
        'Options:': chalk.magenta('Options:'),
        'Global Flags:': chalk.magenta('Global Flags:'),
      })
      .options(this.global)
      // .epilog(`Copyright ${new Date().getFullYear()}`)
      .fail((message) => {
        yargs.showHelp();
        Logger.error(message);
        Command.shutdown(1);
      })
      .recommendCommands();

    if (!argv._[0]) {
      yargs.showHelp();
    } else if (!this.commands[argv._[0]]) {
      yargs.showHelp();
      Command.shutdown(1);
    }
  }
}

module.exports = climax;
