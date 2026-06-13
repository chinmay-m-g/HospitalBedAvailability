import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { 
  Building2, Search, Activity, User, Phone, CheckCircle2, 
  XCircle, Clock, Send, ShieldAlert, AlertTriangle, Code, 
  Terminal, ShieldCheck, HelpCircle, RefreshCw
} from 'lucide-react';

const SOCKET_URL = 'http://localhost:3001';
const API_URL = 'http://localhost:3001/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('public');
  const [hospitals, setHospitals] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeHospital, setActiveHospital] = useState(null);
  const [resources, setResources] = useState([]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [categories, setCategories] = useState([]);

  // Reservation lists
  const [adminReservations, setAdminReservations] = useState([]);
  const [myReservations, setMyReservations] = useState(() => {
    const saved = localStorage.getItem('hospital_bookings');
    return saved ? JSON.parse(saved) : [];
  });

  // Modal forms
  const [bookingModal, setBookingModal] = useState({ open: false, resource: null });
  const [bookingForm, setBookingForm] = useState({ userName: '', userContact: '', reason: '' });
  
  // API simulator
  const [apiSyncForm, setApiSyncForm] = useState({
    hospitalId: '',
    resourceName: 'Bed G-101',
    status: 'available',
    attributes: '{\n  "ward": "General Ward A",\n  "room": "101"\n}'
  });
  const [apiLogs, setApiLogs] = useState([]);

  // Global toasts
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'info') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  // Socket Connection and initial fetch
  useEffect(() => {
    const socket = io(SOCKET_URL);

    socket.on('connect', () => {
      console.log('Connected to WebSockets server');
    });

    // Real-time broadcast handlers
    socket.on('resource_status_updated', ({ hospitalId }) => {
      fetchHospitals();
      if (activeHospital && activeHospital.id === hospitalId) {
        fetchResources(hospitalId);
      }
      addToast(`Real-time update: Hospital data synchronized!`, 'info');
    });

    socket.on('new_reservation_request', (payload) => {
      fetchAdminReservations();
      addToast(`New booking request from ${payload.userName} for ${payload.resourceName}!`, 'info');
    });

    socket.on('reservation_approved', ({ reservationId, resourceId }) => {
      updateLocalBookingStatus(reservationId, 'confirmed');
      fetchAdminReservations();
      addToast('A booking request has been approved!', 'success');
    });

    socket.on('reservation_declined', ({ reservationId, resourceId }) => {
      updateLocalBookingStatus(reservationId, 'cancelled');
      fetchAdminReservations();
      addToast('A booking request has been declined/cancelled.', 'error');
    });

    // Initial data fetch
    fetchHospitals();
    fetchCategories();
    fetchAdminReservations();

    return () => {
      socket.disconnect();
    };
  }, [activeHospital]);

  // Sync localStorage bookings state
  useEffect(() => {
    localStorage.setItem('hospital_bookings', JSON.stringify(myReservations));
  }, [myReservations]);

  const updateLocalBookingStatus = (id, newStatus) => {
    setMyReservations(prev => 
      prev.map(res => res.reservationId === id ? { ...res, status: newStatus } : res)
    );
  };

  const fetchHospitals = async () => {
    try {
      const res = await fetch(`${API_URL}/hospitals`);
      const data = await res.json();
      setHospitals(data);
      // Update currently selected hospital details if it's open
      if (activeHospital) {
        const updated = data.find(h => h.id === activeHospital.id);
        if (updated) setActiveHospital(updated);
      }
    } catch (err) {
      console.error('Error fetching hospitals:', err);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch(`${API_URL}/categories`);
      const data = await res.json();
      setCategories(data);
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  const fetchResources = async (hospitalId) => {
    try {
      const res = await fetch(`${API_URL}/hospitals/${hospitalId}/resources`);
      const data = await res.json();
      setResources(data);
    } catch (err) {
      console.error('Error fetching resources:', err);
    }
  };

  const fetchAdminReservations = async () => {
    try {
      const res = await fetch(`${API_URL}/reservations`);
      const data = await res.json();
      setAdminReservations(data);
    } catch (err) {
      console.error('Error fetching admin reservations:', err);
    }
  };

  // View resources for selected hospital
  const handleSelectHospital = (hospital) => {
    setActiveHospital(hospital);
    fetchResources(hospital.id);
    // Pre-fill simulator form with selected hospital
    setApiSyncForm(prev => ({ ...prev, hospitalId: hospital.id }));
  };

  // Create booking request
  const handleOpenBooking = (resource) => {
    if (resource.status !== 'available') return;
    setBookingModal({ open: true, resource });
    setBookingForm({ userName: '', userContact: '', reason: '' });
  };

  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    const { resource } = bookingModal;
    
    try {
      const res = await fetch(`${API_URL}/reservations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceId: resource.id,
          userName: bookingForm.userName,
          userContact: bookingForm.userContact
        })
      });

      const data = await res.json();
      
      if (res.ok) {
        addToast('Booking requested successfully!', 'success');
        
        // Add to local bookings
        const newBooking = {
          reservationId: data.reservationId,
          resourceId: resource.id,
          resourceName: resource.name,
          hospitalId: activeHospital.id,
          hospitalName: activeHospital.name,
          categoryCode: resource.category_code,
          categoryName: resource.category_name,
          status: 'pending_approval',
          expiresAt: data.expiresAt,
          userName: bookingForm.userName,
          created: new Date().toISOString()
        };
        
        setMyReservations(prev => [newBooking, ...prev]);
        setBookingModal({ open: false, resource: null });
        fetchHospitals();
        fetchResources(activeHospital.id);
      } else {
        addToast(data.error || 'Failed to request booking', 'error');
      }
    } catch (err) {
      console.error(err);
      addToast('Network error while booking', 'error');
    }
  };

  // Admin Actions
  const handleApproveReservation = async (reservationId) => {
    try {
      const res = await fetch(`${API_URL}/reservations/${reservationId}/approve`, {
        method: 'POST'
      });
      if (res.ok) {
        addToast('Reservation approved', 'success');
        fetchAdminReservations();
        fetchHospitals();
      }
    } catch (err) {
      console.error(err);
      addToast('Error approving reservation', 'error');
    }
  };

  const handleDeclineReservation = async (reservationId) => {
    try {
      const res = await fetch(`${API_URL}/reservations/${reservationId}/decline`, {
        method: 'POST'
      });
      if (res.ok) {
        addToast('Reservation declined', 'info');
        fetchAdminReservations();
        fetchHospitals();
      }
    } catch (err) {
      console.error(err);
      addToast('Error declining reservation', 'error');
    }
  };

  // Simulator API sync call
  const handleApiSyncSubmit = async (e) => {
    e.preventDefault();
    
    let parsedAttributes = {};
    try {
      parsedAttributes = JSON.parse(apiSyncForm.attributes);
    } catch (err) {
      addToast('Invalid attributes JSON format', 'error');
      return;
    }

    const logEntry = {
      timestamp: new Date().toLocaleTimeString(),
      method: 'POST',
      url: '/api/resources/sync',
      payload: {
        hospitalId: apiSyncForm.hospitalId,
        resourceName: apiSyncForm.resourceName,
        status: apiSyncForm.status,
        attributes: parsedAttributes
      }
    };

    try {
      const res = await fetch(`${API_URL}/resources/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logEntry.payload)
      });
      const data = await res.json();

      logEntry.status = res.status;
      logEntry.response = data;

      setApiLogs(prev => [logEntry, ...prev]);
      
      if (res.ok) {
        addToast('EHR Status synced successfully!', 'success');
        fetchHospitals();
      } else {
        addToast(data.error || 'Sync failed', 'error');
      }
    } catch (err) {
      logEntry.status = 500;
      logEntry.response = { error: 'Network error' };
      setApiLogs(prev => [logEntry, ...prev]);
      addToast('EHR Sync failed: Network error', 'error');
    }
  };

  // Search filter
  const filteredHospitals = hospitals.filter(h => 
    h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    h.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Timer component logic inside public active bookings
  const ReservationTimer = ({ expiresAt, status }) => {
    const [timeLeft, setTimeLeft] = useState('');

    useEffect(() => {
      if (!expiresAt || status !== 'pending_approval') {
        setTimeLeft('');
        return;
      }

      const updateTimer = () => {
        const difference = new Date(expiresAt) - new Date();
        if (difference <= 0) {
          setTimeLeft('Expired');
          return;
        }

        const mins = Math.floor(difference / 60000);
        const secs = Math.floor((difference % 60000) / 1000);
        setTimeLeft(`${mins}m ${secs}s`);
      };

      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
    }, [expiresAt, status]);

    if (status !== 'pending_approval') return null;
    return (
      <span className="badge maintenance" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <Clock size={12} /> Auto-release: {timeLeft}
      </span>
    );
  };

  return (
    <div>
      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            <Activity size={18} />
            <div>{t.message}</div>
          </div>
        ))}
      </div>

      {/* Navigation bar */}
      <nav className="navbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '40px', height: '40px', background: 'var(--primary)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyCenter: 'center', justifyContent: 'center', color: '#ffffff' }}>
            <Activity size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem' }}>AuraBed Live</h2>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginTop: '-3px' }}>Real-time Bed Registry</span>
          </div>
        </div>
        
        <div className="nav-links">
          <button 
            className={`nav-link ${activeTab === 'public' ? 'active' : ''}`}
            onClick={() => setActiveTab('public')}
          >
            Find Bed
          </button>
          <button 
            className={`nav-link ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('admin');
              fetchAdminReservations();
            }}
          >
            Hospital Admin Portal
          </button>
          <button 
            className={`nav-link ${activeTab === 'api-sync' ? 'active' : ''}`}
            onClick={() => setActiveTab('api-sync')}
          >
            EHR API Sandbox
          </button>
        </div>
      </nav>

      <div className="app-container">
        
        {/* PUBLIC AVAILABILITY FINDER VIEW */}
        {activeTab === 'public' && (
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'stretch' }}>
              
              {/* Left Column: Hospitals search and list */}
              <div style={{ flex: 2, minWidth: '320px' }}>
                <div className="glass-panel" style={{ marginBottom: '24px' }}>
                  <h3 style={{ marginBottom: '12px' }}>Search Hospitals</h3>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type="text" 
                      placeholder="Type hospital name or address..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px 14px 12px 42px',
                        borderRadius: '12px',
                        border: '1px solid var(--input-border)',
                        background: 'var(--input-bg)',
                        color: 'var(--text-main)',
                        fontSize: '1rem',
                        outline: 'none'
                      }}
                    />
                    <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  </div>
                </div>

                <div className="hospital-grid">
                  {filteredHospitals.map(h => (
                    <div 
                      key={h.id} 
                      className={`glass-panel hospital-card ${activeHospital?.id === h.id ? 'active-outline' : ''}`}
                      onClick={() => handleSelectHospital(h)}
                      style={{
                        borderColor: activeHospital?.id === h.id ? 'var(--primary)' : 'var(--panel-border)'
                      }}
                    >
                      <div className="hospital-header">
                        <div>
                          <h4 className="hospital-title">{h.name}</h4>
                          <span className="hospital-meta"><Building2 size={14} /> {h.address}</span>
                          <span className="hospital-meta"><Phone size={14} /> {h.contact_number}</span>
                        </div>
                      </div>

                      {/* Real-time counts */}
                      <div className="availability-pill-container">
                        <div className="availability-pill">
                          <span style={{ color: 'var(--text-muted)' }}>General Beds:</span>
                          <span style={{ fontWeight: '600', color: h.categories.general_bed?.available > 0 ? 'var(--color-available)' : 'var(--color-occupied)' }}>
                            {h.categories.general_bed?.available || 0} / {h.categories.general_bed?.total || 0}
                          </span>
                        </div>
                        <div className="availability-pill">
                          <span style={{ color: 'var(--text-muted)' }}>ICU Beds:</span>
                          <span style={{ fontWeight: '600', color: h.categories.icu_bed?.available > 0 ? 'var(--color-available)' : 'var(--color-occupied)' }}>
                            {h.categories.icu_bed?.available || 0} / {h.categories.icu_bed?.total || 0}
                          </span>
                        </div>
                        <div className="availability-pill">
                          <span style={{ color: 'var(--text-muted)' }}>OPD Slots:</span>
                          <span style={{ fontWeight: '600', color: h.categories.opd_appointment?.available > 0 ? 'var(--color-available)' : 'var(--color-occupied)' }}>
                            {h.categories.opd_appointment?.available || 0} / {h.categories.opd_appointment?.total || 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredHospitals.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      No hospitals found matching your criteria.
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Interactive Bed Visualizer & Booking panel */}
              <div style={{ flex: 3, minWidth: '350px' }}>
                {activeHospital ? (
                  <div className="glass-panel" style={{ height: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--panel-border)', paddingBottom: '16px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="pulse-dot available"></span>
                          <h3 style={{ fontSize: '1.4rem' }}>{activeHospital.name}</h3>
                        </div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Live Bed and Slot Visualizer</span>
                      </div>
                      
                      {/* Filter Categories */}
                      <select 
                        value={selectedCategoryFilter} 
                        onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '8px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                      >
                        <option value="all">All Categories</option>
                        {categories.map(c => (
                          <option key={c.id} value={c.code}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Legend */}
                    <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '20px', fontSize: '0.8rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '10px', height: '10px', borderRadius: '20%', background: 'var(--color-available)' }}></span> Available</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '10px', height: '10px', borderRadius: '20%', background: 'var(--color-reserved)' }}></span> Reserved (Pending/Confirmed)</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '10px', height: '10px', borderRadius: '20%', background: 'var(--color-occupied)' }}></span> Occupied</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '10px', height: '10px', borderRadius: '20%', background: 'var(--color-maintenance)' }}></span> Maintenance</span>
                    </div>

                    <div className="resource-grid">
                      {resources
                        .filter(r => selectedCategoryFilter === 'all' || r.category_code === selectedCategoryFilter)
                        .map(r => (
                          <div 
                            key={r.id} 
                            className={`resource-card ${r.status}`}
                            onClick={() => handleOpenBooking(r)}
                            style={{
                              cursor: r.status === 'available' ? 'pointer' : 'not-allowed',
                              opacity: r.status === 'available' ? 1 : 0.75
                            }}
                          >
                            <span className="resource-name">{r.name}</span>
                            <span className="badge available" style={{
                              background: `var(--color-${r.status}-glow)`,
                              color: `var(--color-${r.status})`,
                              fontSize: '0.7rem',
                              padding: '2px 8px',
                              marginTop: '8px'
                            }}>
                              {r.status}
                            </span>
                            
                            <div className="resource-desc">
                              {r.category_code === 'general_bed' && `Room ${r.attributes.room}`}
                              {r.category_code === 'icu_bed' && (r.attributes.ventilator_connected ? 'Ventilator' : 'ICU Regular')}
                              {r.category_code === 'opd_appointment' && `${r.attributes.doctor_name} (${r.attributes.time_slot})`}
                            </div>
                          </div>
                        ))}
                    </div>

                    {resources.filter(r => selectedCategoryFilter === 'all' || r.category_code === selectedCategoryFilter).length === 0 && (
                      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                        No beds or doctor slots found for this category.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="glass-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyCenter: 'center', justifyContent: 'center', minHeight: '350px', borderStyle: 'dashed' }}>
                    <Building2 size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
                    <h4>Select a Hospital</h4>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '6px', textAlign: 'center' }}>Click any hospital card on the left to explore available beds and register online reservation requests.</p>
                  </div>
                )}
              </div>
            </div>

            {/* User Personal Reservations list */}
            {myReservations.length > 0 && (
              <div className="glass-panel" style={{ marginTop: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <ShieldCheck size={20} style={{ color: 'var(--color-available)' }} />
                  <h3>My Online Bookings</h3>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                  {myReservations.map(r => (
                    <div key={r.reservationId} className="glass-panel" style={{ background: 'var(--input-bg)', padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <h4 style={{ fontSize: '1rem' }}>{r.resourceName}</h4>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>{r.hospitalName}</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>Category: {r.categoryName}</span>
                        </div>
                        <span className={`badge ${r.status}`}>
                          {r.status.replace('_', ' ')}
                        </span>
                      </div>
                      
                      <div style={{ marginTop: '12px', borderTop: '1px solid var(--panel-border)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>User: {r.userName}</span>
                        <ReservationTimer expiresAt={r.expiresAt} status={r.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* HOSPITAL PORTAL / CONTROL ROOM VIEW */}
        {activeTab === 'admin' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldAlert style={{ color: 'var(--primary)' }} />
                    Live Reservation Requests Queue
                  </h3>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>These beds are soft-locked (pending approval) for 15 minutes. Confirming reserves the bed permanently.</span>
                </div>
                <button className="btn-secondary" onClick={fetchAdminReservations}>
                  <RefreshCw size={14} /> Reload Queue
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Hospital</th>
                      <th>Resource / Bed</th>
                      <th>Category</th>
                      <th>Patient Name</th>
                      <th>Contact Details</th>
                      <th>Expiration</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminReservations.map(r => (
                      <tr key={r.reservation_id}>
                        <td style={{ fontWeight: '500' }}>{r.hospital_name}</td>
                        <td>{r.resource_name}</td>
                        <td>
                          <span className={`badge ${r.category_code === 'general_bed' ? 'available' : r.category_code === 'icu_bed' ? 'error' : 'info'}`}>
                            {r.category_name}
                          </span>
                        </td>
                        <td>{r.user_name}</td>
                        <td><span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Phone size={12} /> {r.user_contact}</span></td>
                        <td><ReservationTimer expiresAt={r.expires_at} status="pending_approval" /></td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button 
                              className="btn-primary" 
                              onClick={() => handleApproveReservation(r.reservation_id)}
                              style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'var(--color-available)' }}
                            >
                              <CheckCircle2 size={12} /> Approve
                            </button>
                            <button 
                              className="btn-secondary" 
                              onClick={() => handleDeclineReservation(r.reservation_id)}
                              style={{ padding: '6px 12px', fontSize: '0.8rem', color: 'var(--color-occupied)', borderColor: 'var(--color-occupied-glow)' }}
                            >
                              <XCircle size={12} /> Decline
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {adminReservations.length === 0 && (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                          No pending reservation requests in the queue.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quick Manual Grid Toggler */}
            <div className="glass-panel">
              <h3>Direct Bed / Room Status Manager</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px' }}>Select a hospital to manually override bed statuses (e.g. mark bed as under Maintenance or Occupied).</p>
              
              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                {hospitals.map(h => (
                  <button 
                    key={h.id} 
                    className={`btn-secondary ${activeHospital?.id === h.id ? 'btn-primary' : ''}`}
                    onClick={() => handleSelectHospital(h)}
                    style={{
                      background: activeHospital?.id === h.id ? 'var(--primary)' : 'transparent',
                      color: activeHospital?.id === h.id ? '#ffffff' : 'var(--text-main)'
                    }}
                  >
                    {h.name}
                  </button>
                ))}
              </div>

              {activeHospital && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
                  {resources.map(r => (
                    <div key={r.id} className="glass-panel" style={{ background: 'var(--input-bg)', padding: '14px', borderLeft: `4px solid var(--color-${r.status})` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ fontSize: '0.95rem' }}>{r.name}</h4>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.category_name}</span>
                      </div>
                      
                      <div style={{ marginTop: '12px' }}>
                        <select 
                          value={r.status}
                          onChange={async (e) => {
                            try {
                              const res = await fetch(`${API_URL}/resources/sync`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  hospitalId: activeHospital.id,
                                  resourceName: r.name,
                                  status: e.target.value
                                })
                              });
                              if (res.ok) {
                                addToast('Bed status updated manually', 'success');
                                fetchHospitals();
                                fetchResources(activeHospital.id);
                              }
                            } catch (err) {
                              console.error(err);
                              addToast('Failed to update bed status', 'error');
                            }
                          }}
                          style={{ width: '100%', padding: '6px', borderRadius: '6px', background: 'var(--bg-color)', border: '1px solid var(--panel-border)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                        >
                          <option value="available">Available</option>
                          <option value="reserved">Reserved</option>
                          <option value="occupied">Occupied</option>
                          <option value="maintenance">Maintenance</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* API SYNC SIMULATOR VIEW */}
        {activeTab === 'api-sync' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
            
            {/* Left: Input parameters */}
            <div style={{ flex: 1, minWidth: '320px' }} className="glass-panel">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Code size={20} style={{ color: 'var(--primary)' }} />
                <h3>HIS Telemetry Webhook Simulator</h3>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '20px' }}>
                Simulate how a hospital's internal Electronic Health Record (EHR) system sends real-time updates directly to the central registry.
              </p>

              <form onSubmit={handleApiSyncSubmit}>
                <div className="form-group">
                  <label>1. Target Hospital</label>
                  <select 
                    value={apiSyncForm.hospitalId}
                    onChange={(e) => setApiSyncForm(prev => ({ ...prev, hospitalId: e.target.value }))}
                    required
                  >
                    <option value="">Select Target Hospital...</option>
                    {hospitals.map(h => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>2. Bed / Resource Name</label>
                  <input 
                    type="text" 
                    value={apiSyncForm.resourceName}
                    onChange={(e) => setApiSyncForm(prev => ({ ...prev, resourceName: e.target.value }))}
                    placeholder="e.g. Bed G-101"
                    required
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>Name must match a seeded bed (e.g. Bed G-101, Bed G-102, ICU Bed 201).</span>
                </div>

                <div className="form-group">
                  <label>3. Telemetry Status</label>
                  <select 
                    value={apiSyncForm.status}
                    onChange={(e) => setApiSyncForm(prev => ({ ...prev, status: e.target.value }))}
                  >
                    <option value="available">Available (Vacated / Discharged)</option>
                    <option value="occupied">Occupied (Patient Admitted)</option>
                    <option value="reserved">Reserved (Booked)</option>
                    <option value="maintenance">Maintenance (Sterilization / Repair)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>4. Metadata JSON (Attributes)</label>
                  <textarea 
                    value={apiSyncForm.attributes}
                    onChange={(e) => setApiSyncForm(prev => ({ ...prev, attributes: e.target.value }))}
                    rows="5"
                    style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                  ></textarea>
                </div>

                <button type="submit" className="btn-primary" style={{ width: '100%' }}>
                  <Send size={16} /> Dispatch Sync Event (POST)
                </button>
              </form>
            </div>

            {/* Right: Terminal logs */}
            <div style={{ flex: 1.5, minWidth: '350px' }} className="glass-panel">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Terminal size={20} style={{ color: 'var(--color-available)' }} />
                <h3>Live Webhook Telemetry Console</h3>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '16px' }}>Showing requests dispatched and real-time response logs.</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {apiLogs.map((log, idx) => (
                  <div key={idx} style={{ background: '#090d16', border: '1px solid var(--panel-border)', borderRadius: '8px', padding: '14px', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', marginBottom: '8px' }}>
                      <span>[{log.timestamp}] HTTP {log.method}</span>
                      <span style={{ color: log.status < 300 ? '#10b981' : '#f43f5e' }}>STATUS {log.status}</span>
                    </div>
                    <div style={{ color: '#38bdf8', marginBottom: '4px' }}>Path: {log.url}</div>
                    
                    <div style={{ display: 'flex', gap: '20px', marginTop: '10px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#e2e8f0', borderBottom: '1px solid #1e293b', paddingBottom: '2px', marginBottom: '4px' }}>Payload Sent:</div>
                        <pre style={{ overflowX: 'auto', maxHeight: '120px', color: '#94a3b8' }}>{JSON.stringify(log.payload, null, 2)}</pre>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#e2e8f0', borderBottom: '1px solid #1e293b', paddingBottom: '2px', marginBottom: '4px' }}>Response Received:</div>
                        <pre style={{ overflowX: 'auto', maxHeight: '120px', color: '#94a3b8' }}>{JSON.stringify(log.response, null, 2)}</pre>
                      </div>
                    </div>
                  </div>
                ))}

                {apiLogs.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)', border: '1px dashed var(--panel-border)', borderRadius: '8px' }}>
                    Logs will display here in real-time when telemetry calls are triggered.
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Booking Form Modal Overlay */}
      {bookingModal.open && (
        <div className="modal-overlay" onClick={() => setBookingModal({ open: false, resource: null })}>
          <div className="glass-panel modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem' }}>Reserve {bookingModal.resource.name}</h3>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{activeHospital.name}</span>
              </div>
              <button 
                onClick={() => setBookingModal({ open: false, resource: null })}
                style={{ background: 'transparent', padding: '4px', border: 'none', color: 'var(--text-muted)' }}
              >
                <XCircle size={20} />
              </button>
            </div>

            <div style={{ background: 'var(--primary-glow)', border: '1px solid var(--panel-border)', borderRadius: '8px', padding: '12px', marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.8rem' }}>
              <Clock size={16} style={{ color: 'var(--primary)' }} />
              <div>
                <strong>Soft Lock Notice:</strong> This bed will be reserved under pending status for 15 minutes while awaiting hospital review.
              </div>
            </div>

            <form onSubmit={handleBookingSubmit}>
              <div className="form-group">
                <label><User size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} /> Patient Full Name</label>
                <input 
                  type="text" 
                  value={bookingForm.userName} 
                  onChange={(e) => setBookingForm(prev => ({ ...prev, userName: e.target.value }))}
                  placeholder="e.g. John Doe"
                  required 
                />
              </div>

              <div className="form-group">
                <label><Phone size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} /> Contact Number</label>
                <input 
                  type="tel" 
                  value={bookingForm.userContact} 
                  onChange={(e) => setBookingForm(prev => ({ ...prev, userContact: e.target.value }))}
                  placeholder="e.g. +1 (555) 123-4567"
                  required 
                />
              </div>

              <div className="form-group">
                <label>Reason for Reservation</label>
                <textarea 
                  value={bookingForm.reason} 
                  onChange={(e) => setBookingForm(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Brief health reason or department preference..."
                  rows="3"
                ></textarea>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button type="button" className="btn-secondary" onClick={() => setBookingModal({ open: false, resource: null })}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Confirm Reservation Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
