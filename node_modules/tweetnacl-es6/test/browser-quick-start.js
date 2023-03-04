#!/usr/bin/env node
// https://github.com/hakanols/browser-quick-start

import fs from 'fs';
import http from 'http';
import path from 'path';
import { execSync } from 'child_process';

// maps file extention to MIME types
// full list can be found here: https://www.freeformatter.com/mime-types-list.html
const mimeType = {
    '.ico': 'image/x-icon',
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.doc': 'application/msword',
    '.eot': 'application/vnd.ms-fontobject',
    '.ttf': 'application/x-font-ttf',
};
    
function handleRequest(req, res) {
    // Started with code from
    // https://adrianmejia.com/building-a-node-js-static-file-server-files-over-http-using-es6/
    console.log(`${req.method} ${req.url}`);

    const baseURL = req.protocol + '://' + req.headers.host + '/';
    const reqUrl = new URL(req.url, baseURL);

    const sanitizePath = path.normalize(reqUrl.pathname).replace(/^(\.\.[\/\\])+/, '');
    const pathname = path.join(path.resolve(), sanitizePath);
   
    if(!fs.existsSync(pathname)) {
        res.statusCode = 404;
        res.end('File '+pathname+' not found!');
        return;
    }

    if (fs.statSync(pathname).isDirectory()) {
        pathname += '/index.html';
    }

    fs.readFile(pathname, function(err, data){
        if(err){
            res.statusCode = 500;
            res.end('Error getting the file: '+err);
        } else {
            const ext = path.parse(pathname).ext;
            res.setHeader('Content-type', mimeType[ext] || 'text/plain' );
            res.end(data);
        }
    });
}

async function open(target, appName) {
    // Started with code from https://github.com/pwnall/node-open
    let opener;

    switch (process.platform) {
    case 'darwin':
        if (appName) {
            opener = 'open -a "' + escape(appName) + '"';
        } else {
            opener = 'open';
        }
        break;
    case 'win32':
        // if the first parameter to start is quoted, it uses that as the title
        // so we pass a blank title so we can quote the file we are opening
        if (appName) {
            opener = 'start "" "' + escape(appName) + '"';
        } else {
            opener = 'start ""';
        }
        break;
    default:
        if (appName) {
            opener = escape(appName);
        } else {
            // use Portlands xdg-open everywhere else
            opener = path.join(path.resolve(), '../vendor/xdg-open');
        }
        break;
    }

    if (process.env.SUDO_USER) {
        opener = 'sudo -u ' + process.env.SUDO_USER + ' ' + opener;
    }
    console.log(target)
    console.log(escape(target))
    return execSync(opener + ' "' + escape(target) + '"');
}

function escape(s) {
    return s.replace(/"/g, '\\\"');
}

function hashString(text){
    return text
        .split("")
        .reduce(function(a,b){
            a=((a<<5)-a)+b.charCodeAt(0);
            return a&a
        },0);
}

function createPortNumber(seed){
    const startPort = 49151;
    const endPort = 65535;
    return startPort + Math.abs(seed) % (endPort-startPort);
}

async function start(){
    if (process.argv.length !== 3){
        console.log("Need argument with path to start html file");
        return;
    }
    const url = process.argv[2];
    const [path, params] = url.split('?')
    if (!fs.existsSync('.'+path)){
        console.log("No file ");
        return;
    }

    const seed = hashString(process.cwd()+path);
    const portNumber = createPortNumber(seed);
    const server = http.createServer(handleRequest);
    server.listen(portNumber);
    let fullUrl = 'http://127.0.0.1:'+portNumber+url;
    await open(fullUrl);
}

start();