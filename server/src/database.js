import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../../database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to SQLite database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// Promisify database operations for cleaner async/await code
export const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

export const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

export const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

// Initialize database schema
export async function initDb() {
  await run(`PRAGMA foreign_keys = ON;`);

  // Hospitals Table
  await run(`
    CREATE TABLE IF NOT EXISTS hospitals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      contact_number TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Categories Table
  await run(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      description TEXT
    )
  `);

  // Resources Table
  await run(`
    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      hospital_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT CHECK(status IN ('available', 'reserved', 'occupied', 'maintenance')) DEFAULT 'available',
      attributes TEXT, -- JSON String
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    )
  `);

  // Reservations Table
  await run(`
    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      resource_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_contact TEXT NOT NULL,
      status TEXT CHECK(status IN ('pending_approval', 'confirmed', 'cancelled', 'completed')) DEFAULT 'pending_approval',
      reserved_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
    )
  `);

  // Seed Data if empty
  const hospitalCount = await get(`SELECT COUNT(*) as count FROM hospitals`);
  if (hospitalCount.count === 0) {
    console.log('Seeding initial database...');
    
    // Seed Categories
    const catGeneralId = crypto.randomUUID();
    const catIcuId = crypto.randomUUID();
    const catOpdId = crypto.randomUUID();

    await run(`
      INSERT INTO categories (id, name, code, description) VALUES
      (?, 'General Bed', 'general_bed', 'Standard ward hospital bed for general admission'),
      (?, 'ICU Bed', 'icu_bed', 'Intensive Care Unit bed equipped with specialized monitoring and life-support tools'),
      (?, 'OPD Appointment', 'opd_appointment', 'Outpatient Department doctor appointment time slot')
    `, [catGeneralId, catIcuId, catOpdId]);

    // Seed Hospitals
    const hosp1Id = crypto.randomUUID();
    const hosp2Id = crypto.randomUUID();
    const hosp3Id = crypto.randomUUID();

    await run(`
      INSERT INTO hospitals (id, name, address, latitude, longitude, contact_number) VALUES
      (?, 'City Central Hospital', '123 Health Ave, Downtown', 40.7128, -74.0060, '+1 (555) 019-2834'),
      (?, 'St. Jude Medical Center', '456 Mercy Blvd, Westside', 40.7306, -73.9352, '+1 (555) 014-9876'),
      (?, 'Metro Care Clinic', '789 Plaza Rd, Northside', 40.6782, -73.9442, '+1 (555) 016-5432')
    `, [hosp1Id, hosp2Id, hosp3Id]);

    // Helper function to insert resources
    const addResource = async (hospitalId, categoryId, name, status, attributes) => {
      await run(`
        INSERT INTO resources (id, hospital_id, category_id, name, status, attributes)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [crypto.randomUUID(), hospitalId, categoryId, name, status, JSON.stringify(attributes)]);
    };

    // Hospital 1 Resources (City Central)
    // Beds
    await addResource(hosp1Id, catGeneralId, 'Bed G-101', 'available', { ward: 'General Ward A', floor: '1st Floor', room: '101' });
    await addResource(hosp1Id, catGeneralId, 'Bed G-102', 'available', { ward: 'General Ward A', floor: '1st Floor', room: '102' });
    await addResource(hosp1Id, catGeneralId, 'Bed G-103', 'occupied', { ward: 'General Ward B', floor: '1st Floor', room: '103' });
    await addResource(hosp1Id, catGeneralId, 'Bed G-104', 'available', { ward: 'General Ward B', floor: '1st Floor', room: '104' });
    await addResource(hosp1Id, catGeneralId, 'Bed G-105', 'maintenance', { ward: 'General Ward B', floor: '1st Floor', room: '105' });
    // ICU Beds
    await addResource(hosp1Id, catIcuId, 'ICU Bed 201', 'available', { ventilator_connected: true, oxygen_level_monitor: true });
    await addResource(hosp1Id, catIcuId, 'ICU Bed 202', 'occupied', { ventilator_connected: true, oxygen_level_monitor: true });
    // OPD Appointments
    await addResource(hosp1Id, catOpdId, 'Dr. Sarah Connor - Slot A', 'available', { doctor_name: 'Dr. Sarah Connor', specialty: 'Cardiology', time_slot: '10:00 AM - 10:30 AM' });
    await addResource(hosp1Id, catOpdId, 'Dr. Sarah Connor - Slot B', 'available', { doctor_name: 'Dr. Sarah Connor', specialty: 'Cardiology', time_slot: '11:00 AM - 11:30 AM' });

    // Hospital 2 Resources (St. Jude)
    // Beds
    await addResource(hosp2Id, catGeneralId, 'Bed G-301', 'available', { ward: 'West Wing Ward 1', floor: '3rd Floor', room: '301' });
    await addResource(hosp2Id, catGeneralId, 'Bed G-302', 'available', { ward: 'West Wing Ward 1', floor: '3rd Floor', room: '302' });
    await addResource(hosp2Id, catGeneralId, 'Bed G-303', 'available', { ward: 'West Wing Ward 2', floor: '3rd Floor', room: '303' });
    // ICU Beds
    await addResource(hosp2Id, catIcuId, 'ICU Bed 401', 'available', { ventilator_connected: true, oxygen_level_monitor: true });
    // OPD Appointments
    await addResource(hosp2Id, catOpdId, 'Dr. John Doe - Slot A', 'available', { doctor_name: 'Dr. John Doe', specialty: 'Pediatrics', time_slot: '09:00 AM - 09:30 AM' });

    // Hospital 3 Resources (Metro Care)
    // Beds
    await addResource(hosp3Id, catGeneralId, 'Bed G-501', 'available', { ward: 'Main Ward', floor: 'Ground Floor', room: '501' });
    await addResource(hosp3Id, catGeneralId, 'Bed G-502', 'occupied', { ward: 'Main Ward', floor: 'Ground Floor', room: '502' });
    // ICU Beds
    await addResource(hosp3Id, catIcuId, 'ICU Bed 601', 'available', { ventilator_connected: false, oxygen_level_monitor: true });

    console.log('Database seeded successfully!');
  }
}

export default db;
