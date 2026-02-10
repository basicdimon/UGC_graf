#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import sharp from 'sharp';
import { exiftool } from 'exiftool-vendored';

const program = new Command();

program
  .name('ugc')
  .description('Universal Graphics Converter')
  .version('1.0.0');

program.command('info')
  .description('Check environment and sharp version')
  .action(async () => {
    console.log(chalk.green('Universal Graphics Converter (UGC)'));
    console.log(`Node version: ${process.version}`);
    console.log(`Sharp version: ${sharp.versions.sharp}`);
    console.log(`Vips version: ${sharp.versions.vips}`);
    
    try {
      const version = await exiftool.version();
      console.log(`ExifTool version: ${version}`);
    } catch (err) {
      console.log(chalk.red('ExifTool error:'), err);
    } finally {
      await exiftool.end();
    }

    console.log(chalk.blue('Environment is ready.'));
  });

program.parse();
