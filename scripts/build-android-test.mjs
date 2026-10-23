import {build} from 'esbuild';
await build({entryPoints:['tests/android-migration-entry.ts'],bundle:true,format:'iife',target:'es2022',outfile:'android/app/src/androidTest/assets/migration-test.js'});
