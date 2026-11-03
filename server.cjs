// Startup file for hosting panels that run Node.js apps with Phusion Passenger,
// such as cPanel's "Setup Node.js App". Set "Application startup file" to: server.cjs
//
// Passenger loads this file with require(), so it must be plain CommonJS
// JavaScript (.cjs). It switches on tsx's loader, which lets Node.js run our
// TypeScript files, and then starts the real app (src/index.ts).
// Passenger tells the app where to listen; locally you can try it with: node server.cjs
const { register } = require('tsx/esm/api');

register();

import('./src/index.ts').catch((error) => {
  console.error('The app could not start:', error);
  process.exit(1);
});
