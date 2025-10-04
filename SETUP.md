# GEO MAP STARTER - LIVE ATTACK VISUALIZATION
________________________________________

## Prerequisites
• Docker Desktop installed and running
• Node.js LTS installed (node -v, npm -v should work)
• Visual Studio Code installed
• PowerShell (Windows) or Terminal (macOS/Linux)

________________________________________

## 1. Start TileServer-GL

In a terminal (WSL/Linux/macOS) or PowerShell (Windows):
```bash
cd ~/geo-map-starter
docker run --name tileserver \
  --rm -it -p 8080:8080 \
  -v "$(pwd)/data":/data \
  maptiler/tileserver-gl:latest \
  -c /data/config.json
```

**Check:**
• http://localhost:8080 → dashboard
• http://localhost:8080/styles/dark-matter/style.json → style JSON loads

**Keep this container running.**

________________________________________

## 2. Setup React Application

Open VS Code, then:
```bash
cd ~/geo-map-starter
npx create-react-app react-map
cd react-map
npm install maplibre-gl @turf/turf socket.io-client
```

**Dependencies:**
• `maplibre-gl` - Map rendering library
• `@turf/turf` - Geospatial calculations for attack arcs
• `socket.io-client` - Real-time communication with webhook server

________________________________________

## 3. Add MapLibre CSS

Edit `src/index.js`:
```javascript
import 'maplibre-gl/dist/maplibre-gl.css';
```

________________________________________

## 4. Create Live Attack Map Component

Create `src/MapAttackLive.jsx`:
```javascript
import React, { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import * as turf from "@turf/turf";
import { io } from "socket.io-client";
import "maplibre-gl/dist/maplibre-gl.css";

const SOCKET_URL = "http://localhost:4000";

// Attack simulation data
const ATTACK_SOURCES = {
  malaysia: {
    name: "Malaysia",
    coordinates: [101.9758, 4.2105], // Kuala Lumpur
    color: "#ff4444",
    severity: "high"
  },
  brunei: {
    name: "Brunei",
    coordinates: [114.7277, 4.5353], // Bandar Seri Begawan
    color: "#4444ff", 
    severity: "medium"
  }
};

const SINGAPORE_COORDS = [103.8198, 1.3521]; // Singapore

export default function MapAttackLive() {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const animRefs = useRef({});
  const simulationRef = useRef(null);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "http://localhost:8080/styles/dark-matter/style.json",
      center: [103.8, 1.3],
      zoom: 6,
    });
    mapRef.current = map;

    const socket = io(SOCKET_URL);
    socket.on("attack", (event) => triggerAttack(map, event));

    // Start automatic attack simulation
    startAttackSimulation(map);

    return () => {
      socket.disconnect();
      if (simulationRef.current) {
        clearInterval(simulationRef.current);
      }
      Object.values(animRefs.current).forEach(({ marker, raf }) => {
        if (marker) marker.remove();
        if (raf) cancelAnimationFrame(raf);
      });
      map.remove();
    };
  }, []);

  function startAttackSimulation(map) {
    let attackCounter = 0;
    
    simulationRef.current = setInterval(() => {
      // Alternate between Malaysia and Brunei attacks
      const sourceKey = attackCounter % 2 === 0 ? 'malaysia' : 'brunei';
      const source = ATTACK_SOURCES[sourceKey];
      
      const attackEvent = {
        id: `sim-${Date.now()}-${attackCounter}`,
        origin: source.coordinates,
        destination: SINGAPORE_COORDS,
        severity: source.severity,
        color: source.color
      };
      
      triggerAttack(map, attackEvent);
      attackCounter++;
    }, 2000); // Attack every 2 seconds
  }

  function triggerAttack(map, event) {
    const { id, origin, destination, severity, color } = event;
    
    // Validate and convert coordinate formats
    const validOrigin = Array.isArray(origin) ? origin : [origin.lng || origin.lon, origin.lat];
    const validDestination = Array.isArray(destination) ? destination : [destination.lng || destination.lon, destination.lat];
    
    console.log('Attack event:', { id, origin: validOrigin, destination: validDestination, severity, color });
    
    const arc = buildArc(validOrigin, validDestination);
    const srcId = `arc-${id}`;
    const lineId = `${srcId}-line`;

    map.addSource(srcId, {
      type: "geojson",
      data: { type: "Feature", geometry: { type: "LineString", coordinates: arc } },
    });

    // Determine color (use custom color if available, otherwise default)
    const lineColor = color || (severity === "high" ? "#ff4d4d" : "#ffaa00");

    map.addLayer({
      id: lineId,
      type: "line",
      source: srcId,
      paint: {
        "line-color": lineColor,
        "line-width": severity === "high" ? 4 : 2,
        "line-opacity": 0.9,
      },
    });

    const el = document.createElement("div");
    el.style.width = "12px";
    el.style.height = "12px";
    el.style.borderRadius = "50%";
    el.style.background = lineColor;
    el.style.boxShadow = `0 0 10px ${lineColor}`;
    const marker = new maplibregl.Marker({ element: el }).setLngLat(arc[0]).addTo(map);

    let start = performance.now();
    const duration = 3000;

    function animate(now) {
      const t = Math.min((now - start) / duration, 1);
      const i = Math.floor(t * (arc.length - 1));
      
      // Validate index range
      const currentIndex = Math.min(i, arc.length - 1);
      const currentPosition = arc[currentIndex];
      
      if (currentPosition && Array.isArray(currentPosition) && currentPosition.length >= 2) {
        marker.setLngLat(currentPosition);
      }
      
      if (t < 1) {
        animRefs.current[id].raf = requestAnimationFrame(animate);
      } else {
        marker.remove();
        if (map.getLayer(lineId)) map.removeLayer(lineId);
        if (map.getSource(srcId)) map.removeSource(srcId);
        delete animRefs.current[id];
      }
    }

    animRefs.current[id] = { marker, raf: requestAnimationFrame(animate) };
  }

  function buildArc(from, to) {
    // Validate coordinates
    if (!from || !to || !Array.isArray(from) || !Array.isArray(to) || 
        from.length < 2 || to.length < 2) {
      console.error('Invalid coordinates for arc:', { from, to });
      return [[0, 0], [0, 0]]; // Return default values
    }
    
    const line = turf.lineString([from, to]);
    const distance = turf.length(line, { units: "kilometers" });
    const points = [];
    
    for (let i = 0; i <= 100; i++) {
      const segment = turf.along(line, distance * (i / 100), { units: "kilometers" });
      points.push(segment.geometry.coordinates);
    }
    
    return points;
  }

  return <div ref={containerRef} style={{ width: "100%", height: "100vh" }} />;
}
```

________________________________________

## 5. Wire Map into App

Replace `src/App.js`:
```javascript
import MapAttackLive from "./MapAttackLive";

function App() {
  return <MapAttackLive />;
}

export default App;
```

________________________________________

## 6. Setup Webhook Server

Create webhook server directory:
```bash
cd ~/geo-map-starter
mkdir webhook-server
cd webhook-server
npm init -y
npm install express socket.io helmet express-rate-limit
```

Create `webhook-server/index.js`:
```javascript
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(express.json());
app.use(helmet());
app.use(rateLimit({ windowMs: 60*1000, max: 100 }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const SECRET = process.env.WEBHOOK_SECRET || 'supersecretnode';

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
});

app.post('/webhook', (req, res) => {
  const token = req.get('x-webhook-secret');
  if (token !== SECRET) return res.status(401).json({ error: 'invalid secret' });

  const { origin, destination, severity } = req.body;
  if (!origin || !destination) return res.status(400).json({ error: 'missing data' });

  const event = {
    id: Date.now().toString(),
    origin,
    destination,
    severity: severity || 'normal'
  };

  io.emit('attack', event);
  console.log('Attack event emitted:', event);
  return res.status(200).json({ ok: true });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));
```

________________________________________

## 7. Run the Applications

### Terminal 1: Start TileServer (keep running)
```bash
cd ~/geo-map-starter
docker run --name tileserver --rm -it -p 8080:8080 -v "$(pwd)/data":/data maptiler/tileserver-gl:latest -c /data/config.json
```

### Terminal 2: Start Webhook Server
```bash
cd ~/geo-map-starter/webhook-server
node index.js
```

### Terminal 3: Start React App
```bash
cd ~/geo-map-starter/react-map
npm start
```

**Check:**
• http://localhost:3000 → React app with live attack visualization
• http://localhost:4000 → Webhook server running
• http://localhost:8080 → TileServer dashboard

________________________________________

## 8. Test Manual Attacks

### PowerShell (Windows):
```powershell
$json = '{"origin": [103.8, 1.3], "destination": [104.0, 1.5], "severity": "high"}'
Invoke-RestMethod -Uri "http://localhost:4000/webhook" -Method POST -Body $json -ContentType "application/json" -Headers @{ "x-webhook-secret" = "supersecretnode" }
```

### Terminal (macOS/Linux):
```bash
curl -X POST http://localhost:4000/webhook \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: supersecretnode" \
  -d '{"origin": [103.8, 1.3], "destination": [104.0, 1.5], "severity": "high"}'
```

________________________________________

## Features

### Automatic Attack Simulation
• **Malaysia** (Kuala Lumpur) → Singapore (Red attacks, high severity)
• **Brunei** (Bandar Seri Begawan) → Singapore (Blue attacks, medium severity)
• Alternates every 2 seconds automatically

### Manual Attack Triggers
• Send webhook requests to trigger custom attacks
• Support for different severities and custom coordinates
• Real-time visualization via Socket.IO

### Visual Effects
• Animated projectile markers with glow effects
• Color-coded attack lines based on severity/source
• Smooth arc trajectories using Turf.js geospatial calculations
• 3-second animation duration with cleanup

________________________________________

## Troubleshooting

### Common Issues:
1. **TileServer not accessible**: Ensure Docker is running and port 8080 is available
2. **Webhook server connection failed**: Check if port 4000 is available
3. **React app compilation errors**: Ensure all dependencies are installed
4. **Coordinate format errors**: Verify webhook payload uses [lng, lat] array format

### Port Conflicts:
• TileServer: Change `-p 8080:8080` to `-p 8090:8080` and update style URL
• Webhook: Set `PORT=4001` environment variable
• React: Use `PORT=3001 npm start`

________________________________________

## Production Deployment

### React App:
```bash
cd react-map
npm run build
# Deploy build/ folder to your hosting service
```

### Webhook Server:
• Set `WEBHOOK_SECRET` environment variable
• Use process manager (PM2, systemd)
• Configure reverse proxy (nginx)
• Enable HTTPS for production webhooks

________________________________________

## Notes
• OSM attribution must be visible (© OpenStreetMap contributors)
• Ensure all three services (TileServer, Webhook Server, React App) are running
• WebSocket connections require CORS configuration for cross-origin requests
• Attack simulations run automatically on page load
• Manual webhook attacks can be sent while simulation is running