// Production startup file.
//  - cPanel "Setup Node.js App" (Phusion Passenger): set "Application startup file" to server.cjs
//  - Render: the start command in render.yaml is "node server.cjs"
//
// Passenger loads this file with require(), so it must be plain CommonJS
// JavaScript (.cjs). It switches on tsx's loader, which lets Node.js run our
// TypeScript files, and then starts the real app (src/index.ts).
// Passenger tells the app where to listen; locally you can try it with: node server.cjs
const { register } = require('tsx/esm/api');

register();

import('./src/index.ts').catch((error) => {
  console.error('The app could not start:', error);
  // exitCode (not process.exit()) lets Node.js finish writing the message to
  // the log first; the process then ends by itself with status 1.
  process.exitCode = 1;
});
