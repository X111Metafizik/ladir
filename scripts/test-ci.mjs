import {mkdir,readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
await mkdir('test-results',{recursive:true});
const tests=(await readdir('tests')).filter(n=>n.endsWith('.test.mjs')).sort().map(n=>'tests/'+n);
const child=spawn(process.execPath,['--test','--test-isolation=none','--test-reporter=spec','--test-reporter=junit','--test-reporter-destination=stdout','--test-reporter-destination=test-results/unit.xml',...tests],{stdio:'inherit',windowsHide:true});
child.once('error',error=>{console.error(error);process.exitCode=1;});child.once('exit',code=>{process.exitCode=code??1;});
