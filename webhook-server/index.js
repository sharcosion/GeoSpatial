/**
 * webhook-server/index.js
 * 
 * Real-Time Cyber Attack Webhook Server
 * 
 * This Express.js server provides a secure webhook endpoint for triggering
 * real-time cyber attack visualizations. It features:
 * - Secure webhook authentication with secret tokens
 * - Rate limiting to prevent abuse
 * - Real-time WebSocket communication with React frontend
 * - Input validation and error handling
 * - Security headers via Helmet.js
 * 
 * API Endpoints:
 * POST /webhook - Trigger attack visualization
 * 
 * WebSocket Events:
 * 'attack' - Broadcast attack data to connected clients
 * 
 * @author Your Name
 * @version 1.0.0
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Initialize Express application
const app = express();

// Middleware configuration
app.use(express.json()); // Parse JSON request bodies
app.use(helmet()); // Security headers for protection against common vulnerabilities

// Rate limiting configuration - prevents abuse of webhook endpoint
app.use(rateLimit({ 
  windowMs: 60 * 1000, // 1 minute window
  max: 100 // Maximum 100 requests per minute per IP
}));

// Create HTTP server and Socket.IO instance
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { 
    origin: '*' // Allow all origins for development (restrict in production)
  } 
});

// Webhook authentication secret - should be set via environment variable in production
const SECRET = process.env.WEBHOOK_SECRET || 'supersecretnode';

/**
 * WebSocket connection handler
 * Manages real-time connections with React frontend clients
 */
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Handle client disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

/**
 * Webhook endpoint for triggering attack visualizations
 * 
 * Expected request format:
 * POST /webhook
 * Headers: x-webhook-secret: <secret_token>
 * Body: {
 *   "origin": [lng, lat] or {lng: <lng>, lat: <lat>},
 *   "destination": [lng, lat] or {lng: <lng>, lat: <lat>},
 *   "severity": "high|medium|low" (optional, defaults to "normal")
 * }
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
app.post('/webhook', (req, res) => {
  // Authenticate webhook request using secret token
  const token = req.get('x-webhook-secret');
  if (token !== SECRET) {
    console.log('Unauthorized webhook attempt from IP:', req.ip);
    return res.status(401).json({ error: 'invalid secret' });
  }

  // Extract and validate required attack data
  const { origin, destination, severity } = req.body;
  if (!origin || !destination) {
    console.log('Invalid webhook data - missing origin or destination');
    return res.status(400).json({ error: 'missing data' });
  }

  // Create attack event object with unique identifier
  const event = {
    id: Date.now().toString(), // Simple timestamp-based ID
    origin,
    destination,
    severity: severity || 'normal' // Default severity if not specified
  };

  // Broadcast attack event to all connected WebSocket clients
  io.emit('attack', event);
  console.log('Attack event emitted:', event);
  
  // Return success response
  return res.status(200).json({ ok: true });
});

// Server configuration and startup
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Webhook server listening on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhook`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
});
