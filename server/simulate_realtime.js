import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../database.sqlite');
const API_URL = 'http://localhost:3001/api';

const db = new sqlite3.Database(dbPath);

const getDbRow = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

async function runTest() {
  console.log('--- STARTING AUTOMATED REAL-TIME SYNC TEST ---');
  
  try {
    // 1. Fetch a hospital ID from the database
    const hospital = await getDbRow('SELECT id, name FROM hospitals LIMIT 1');
    if (!hospital) {
      throw new Error('No hospitals found in database. Seed data might be missing.');
    }
    console.log(`Using Hospital: ${hospital.name} (${hospital.id})`);

    // 2. Fetch a resource (general bed) for this hospital
    const resource = await getDbRow(
      'SELECT id, name, status FROM resources WHERE hospital_id = ? AND name = ?',
      [hospital.id, 'Bed G-101']
    );
    if (!resource) {
      throw new Error('Target resource "Bed G-101" not found. Seed data might be missing.');
    }
    console.log(`Target Resource: ${resource.name} (Current Status: ${resource.status})`);

    // 3. Define target test state
    const newStatus = resource.status === 'available' ? 'occupied' : 'available';
    console.log(`Sending API request to update status to: "${newStatus}"...`);

    // 4. Send API request
    const response = await fetch(`${API_URL}/resources/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hospitalId: hospital.id,
        resourceName: 'Bed G-101',
        status: newStatus,
        attributes: {
          ward: 'General Ward A',
          room: '101',
          test_log: 'Automated test suite update'
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Sync request failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('API Response:', data);

    // 5. Query the database directly to verify persistence
    const updatedResource = await getDbRow(
      'SELECT status, attributes FROM resources WHERE id = ?',
      [resource.id]
    );

    console.log(`Database Resource Status: "${updatedResource.status}"`);
    console.log(`Database Resource Attributes: ${updatedResource.attributes}`);

    if (updatedResource.status !== newStatus) {
      throw new Error(`Verification FAILED: Expected database status "${newStatus}", got "${updatedResource.status}"`);
    }

    console.log('SUCCESS: Real-time telemetry API synced and verified in database correctly!');
    console.log('--- TEST COMPLETED SUCCESSFULLY ---');
    process.exit(0);

  } catch (err) {
    console.error('TEST FAILED:', err.message);
    process.exit(1);
  }
}

// Give the server a second to initialize if running tests externally
setTimeout(runTest, 1000);
