import {spawn} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {parse} from 'dotenv';

const lab=process.argv.includes('--lab');
const envFile=path.resolve(lab?'.env.local-test':'.env');
if(!existsSync(envFile))throw new Error('Prepare the local environment file first.');
const env={...process.env,...parse(readFileSync(envFile))};
const origin=new URL(env.APP_URL||'http://localhost:3000');
if(!['localhost','127.0.0.1','[::1]'].includes(origin.hostname))throw new Error('Local forwarding requires a loopback APP_URL.');
if(!/^(?:sk|rk|rkcs)_test_[A-Za-z0-9]+$/.test(env.STRIPE_SECRET_KEY||''))throw new Error('A Stripe test key is required.');
const shim=path.resolve('.local/stripe-tools/node_modules/@stripe/cli/bin/shim.js');
if(!existsSync(shim))throw new Error('Install the official CLI: npm install --prefix .local/stripe-tools @stripe/cli');
const args=[shim,'--config',path.resolve('.local/stripe/config.toml'),'listen','--all-snapshot','--forward-to',`${origin.origin}/api/radar/webhook`];
// Env avoids putting API credentials in the process command line.
const child=spawn(process.execPath,args,{env:{...env,STRIPE_API_KEY:env.STRIPE_SECRET_KEY},stdio:['ignore','pipe','pipe'],windowsHide:true});
let buffered='';
function output(chunk){buffered+=chunk.toString();const lines=buffered.split(/\r?\n/);buffered=lines.pop()||'';for(const line of lines)process.stdout.write(line.replace(/(?:whsec_|(?:sk|rk|rkcs|pk)_(?:test|live)_)[A-Za-z0-9_]+/g,'[REDACTED]')+'\n');}
child.stdout.on('data',output);child.stderr.on('data',output);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill());
child.on('error',()=>{console.error('Stripe CLI could not start.');process.exitCode=1;});
child.on('exit',code=>{if(buffered)output('\n');process.exitCode=code||0;});
