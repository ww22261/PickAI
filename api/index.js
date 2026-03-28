/**
 * PickAI Vercel Serverless Function Entry Point
 * This file serves as the main entry point for Vercel deployment
 */

// Import the Express app from server
const app = require('../server/server.js');

// Export for Vercel Serverless Functions
module.exports = app;
