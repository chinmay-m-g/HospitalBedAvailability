import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import crypto from 'crypto';
import { initDb, query, run, get } from './database.js';

const app = express();
const httpServer = createServer(app);

// Configure CORS to allow connection from our Vite frontend (usually port 5173)
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Initialize Database
try {
  await initDb();
  console.log('Database initialized successfully.');
} catch (err) {
  console.error('Database initialization failed:', err);
}

// REST API Endpoints

// 1. GET /api/hospitals - Retrieve hospitals with count of available/total resources per category
app.get('/api/hospitals', async (req, res) => {
  try {
    const rows = await query(`
      SELECT 
        h.id as hospital_id,
        h.name as hospital_name,
        h.address,
        h.latitude,
        h.longitude,
        h.contact_number,
        c.id as category_id,
        c.code as category_code,
        c.name as category_name,
        COUNT(r.id) as total_count,
        SUM(CASE WHEN r.status = 'available' THEN 1 ELSE 0 END) as available_count
      FROM hospitals h
      CROSS JOIN categories c
      LEFT JOIN resources r ON r.hospital_id = h.id AND r.category_id = c.id
      GROUP BY h.id, c.id
    `);

    // Group rows by hospital
    const hospitalsMap = {};
    for (const row of rows) {
      const hid = row.hospital_id;
      if (!hospitalsMap[hid]) {
        hospitalsMap[hid] = {
          id: hid,
          name: row.hospital_name,
          address: row.address,
          latitude: row.latitude,
          longitude: row.longitude,
          contact_number: row.contact_number,
          categories: {}
        };
      }
      hospitalsMap[hid].categories[row.category_code] = {
        id: row.category_id,
        name: row.category_name,
        total: row.total_count,
        available: row.available_count
      };
    }

    res.json(Object.values(hospitalsMap));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// 2. GET /api/hospitals/:id/resources - Get detailed list of resources for a hospital
app.get('/api/hospitals/:id/resources', async (req, res) => {
  const { id } = req.params;
  try {
    const resources = await query(`
      SELECT 
        r.id,
        r.name,
        r.status,
        r.attributes,
        r.updated_at,
        c.name as category_name,
        c.code as category_code
      FROM resources r
      JOIN categories c ON r.category_id = c.id
      WHERE r.hospital_id = ?
    `, [id]);

    const formatted = resources.map(res => ({
      ...res,
      attributes: res.attributes ? JSON.parse(res.attributes) : {}
    }));

    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// 3. POST /api/reservations - Request a reservation
app.post('/api/reservations', async (req, res) => {
  const { resourceId, userName, userContact } = req.body;

  if (!resourceId || !userName || !userContact) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    // Check if resource exists and is available
    const resource = await get('SELECT * FROM resources WHERE id = ?', [resourceId]);
    if (!resource) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    if (resource.status !== 'available') {
      return res.status(400).json({ error: `Resource is currently ${resource.status}` });
    }

    const reservationId = crypto.randomUUID();
    // Set expiry to 15 minutes from now for MVP soft locking
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Begin soft lock (update resource to 'reserved' and create pending reservation)
    await run('UPDATE resources SET status = ? WHERE id = ?', ['reserved', resourceId]);
    await run(
      'INSERT INTO reservations (id, resource_id, user_name, user_contact, status, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      [reservationId, resourceId, userName, userContact, 'pending_approval', expiresAt]
    );

    // Fetch details for socket broadcasts
    const hospital = await get('SELECT name FROM hospitals WHERE id = ?', [resource.hospital_id]);
    const category = await get('SELECT code, name FROM categories WHERE id = ?', [resource.category_id]);

    const broadcastPayload = {
      reservationId,
      resourceId,
      resourceName: resource.name,
      hospitalId: resource.hospital_id,
      hospitalName: hospital.name,
      categoryCode: category.code,
      userName,
      userContact,
      status: 'pending_approval',
      expiresAt
    };

    // Notify all clients that counts changed, and notify admins of a new reservation
    io.emit('resource_status_updated', { hospitalId: resource.hospital_id });
    io.emit('new_reservation_request', broadcastPayload);

    res.status(201).json({
      message: 'Reservation request sent successfully',
      reservationId,
      expiresAt
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create reservation' });
  }
});

// 4. GET /api/reservations - Fetch active reservation requests
app.get('/api/reservations', async (req, res) => {
  try {
    const reservations = await query(`
      SELECT 
        res.id as reservation_id,
        res.user_name,
        res.user_contact,
        res.status as reservation_status,
        res.expires_at,
        res.created_at,
        r.id as resource_id,
        r.name as resource_name,
        h.id as hospital_id,
        h.name as hospital_name,
        c.name as category_name,
        c.code as category_code
      FROM reservations res
      JOIN resources r ON res.resource_id = r.id
      JOIN hospitals h ON r.hospital_id = h.id
      JOIN categories c ON r.category_id = c.id
      WHERE res.status = 'pending_approval'
      ORDER BY res.created_at DESC
    `);
    res.json(reservations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// 5. POST /api/reservations/:id/approve - Approve reservation
app.post('/api/reservations/:id/approve', async (req, res) => {
  const { id } = req.params;
  try {
    const reservation = await get('SELECT * FROM reservations WHERE id = ?', [id]);
    if (!reservation) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    if (reservation.status !== 'pending_approval') {
      return res.status(400).json({ error: `Reservation is already ${reservation.status}` });
    }

    // Confirm booking
    await run('UPDATE reservations SET status = ?, expires_at = NULL WHERE id = ?', ['confirmed', id]);
    // The resource remains status 'reserved' (locked in)
    await run('UPDATE resources SET status = ? WHERE id = ?', ['reserved', reservation.resource_id]);

    const resource = await get('SELECT hospital_id FROM resources WHERE id = ?', [reservation.resource_id]);

    io.emit('resource_status_updated', { hospitalId: resource.hospital_id });
    io.emit('reservation_approved', { reservationId: id, resourceId: reservation.resource_id });

    res.json({ message: 'Reservation approved successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to approve reservation' });
  }
});

// 6. POST /api/reservations/:id/decline - Decline reservation
app.post('/api/reservations/:id/decline', async (req, res) => {
  const { id } = req.params;
  try {
    const reservation = await get('SELECT * FROM reservations WHERE id = ?', [id]);
    if (!reservation) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    if (reservation.status !== 'pending_approval') {
      return res.status(400).json({ error: `Reservation is already ${reservation.status}` });
    }

    // Decline booking and free up resource
    await run('UPDATE reservations SET status = ?, expires_at = NULL WHERE id = ?', ['cancelled', id]);
    await run('UPDATE resources SET status = ? WHERE id = ?', ['available', reservation.resource_id]);

    const resource = await get('SELECT hospital_id FROM resources WHERE id = ?', [reservation.resource_id]);

    io.emit('resource_status_updated', { hospitalId: resource.hospital_id });
    io.emit('reservation_declined', { reservationId: id, resourceId: reservation.resource_id });

    res.json({ message: 'Reservation declined and resource freed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to decline reservation' });
  }
});

// 7. POST /api/resources/sync - EHR/HIS System Sync Endpoint (Simulates real-time telemetry ingestion)
app.post('/api/resources/sync', async (req, res) => {
  const { hospitalId, resourceName, status, attributes } = req.body;

  if (!hospitalId || !resourceName || !status) {
    return res.status(400).json({ error: 'Missing required parameters: hospitalId, resourceName, status' });
  }

  const validStatuses = ['available', 'reserved', 'occupied', 'maintenance'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  try {
    // Find the resource
    const resource = await get(
      'SELECT * FROM resources WHERE hospital_id = ? AND name = ?',
      [hospitalId, resourceName]
    );

    if (!resource) {
      return res.status(404).json({ error: `Resource "${resourceName}" not found at this hospital` });
    }

    // Update the resource status and attributes
    const mergedAttributes = attributes 
      ? JSON.stringify({ ...(resource.attributes ? JSON.parse(resource.attributes) : {}), ...attributes })
      : resource.attributes;

    await run(
      'UPDATE resources SET status = ?, attributes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, mergedAttributes, resource.id]
    );

    // If the status is changing away from available, and there was a pending reservation, we auto-cancel it to avoid double-booking
    if (status !== 'available' && status !== 'reserved') {
      await run(
        "UPDATE reservations SET status = 'cancelled' WHERE resource_id = ? AND status = 'pending_approval'",
        [resource.id]
      );
    }

    // Broadcast update
    io.emit('resource_status_updated', { hospitalId });

    res.json({ 
      message: 'Resource synchronized successfully',
      resourceId: resource.id,
      updatedStatus: status,
      attributes: mergedAttributes ? JSON.parse(mergedAttributes) : {}
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Telemetry sync failed' });
  }
});

// GET /api/categories - Lists all categories
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await query('SELECT * FROM categories');
    res.json(categories);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// WebSocket Server Event Handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start the Server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server is running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
