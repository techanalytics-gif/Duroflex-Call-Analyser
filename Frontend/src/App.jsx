import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import GmbAggregatedDashboard from './components/GmbAggregatedDashboard';
import GmbReportList from './components/GmbReportList';
import GmbReportDetail from './components/GmbReportDetail';
import AudioCallUpload from './components/AudioCallUpload';
import VideoCallsList from './components/VideoCallsList';
import VideoCallDetail from './components/VideoCallDetail';
import VideoAggregatedDashboard from './components/VideoAggregatedDashboard';
import VideoCallUpload from './components/VideoCallUpload';
import StoreWalkinCallsList from './components/StoreWalkinCallsList';
import OutboundCallUpload from './components/OutboundCallUpload';
import StoreWalkinReportDetail from './components/StoreWalkinReportDetail';
import StoreWalkinAggregatedDashboard from './components/StoreWalkinAggregatedDashboard';
import AbcCallUpload from './components/AbcCallUpload';
import AbcReportsList from './components/AbcReportsList';
import AbcReportDetail from './components/AbcReportDetail';
import AbcAggregatedDashboard from './components/AbcAggregatedDashboard';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/" />;
};

function App() {
  return (
    <Router>
      <div className="app">
        <Routes>
          {/* Public Route */}
          <Route path="/" element={<Login />} />

          {/* Protected Routes */}
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />


          {/* GMB Audio Call Reports Routes */}
          <Route path="/Gmb_Inbound" element={<ProtectedRoute><GmbReportList /></ProtectedRoute>} />
          <Route path="/Gmb_Inbound/upload" element={<ProtectedRoute><AudioCallUpload /></ProtectedRoute>} />
          <Route path="/Gmb_Inbound/:callId" element={<ProtectedRoute><GmbReportDetail /></ProtectedRoute>} />
          <Route path="/Gmb_Inbound/analytics" element={<ProtectedRoute><GmbAggregatedDashboard /></ProtectedRoute>} />

          {/* Video Call Reports Routes */}
          <Route path="/popins-inbound" element={<ProtectedRoute><VideoCallsList /></ProtectedRoute>} />
          <Route path="/popins-inbound/upload" element={<ProtectedRoute><VideoCallUpload /></ProtectedRoute>} />
          <Route path="/popins-inbound/:reportId" element={<ProtectedRoute><VideoCallDetail /></ProtectedRoute>} />
          <Route path="/popins-inbound/analytics" element={<ProtectedRoute><VideoAggregatedDashboard /></ProtectedRoute>} />

          {/* Outbound (Store Walkin) Call Reports Routes */}
          <Route path="/storewalkin-outbound-calls" element={<ProtectedRoute><StoreWalkinCallsList /></ProtectedRoute>} />
          <Route path="/storewalkin-outbound-calls/upload" element={<ProtectedRoute><OutboundCallUpload /></ProtectedRoute>} />
          <Route path="/storewalkin-outbound-calls/:callId" element={<ProtectedRoute><StoreWalkinReportDetail /></ProtectedRoute>} />
          <Route path="/storewalkin-outbound-calls/analytics" element={<ProtectedRoute><StoreWalkinAggregatedDashboard /></ProtectedRoute>} />

          {/* ABC Cart Recovery Routes */}
          <Route path="/abc-outbound-calls" element={<ProtectedRoute><AbcReportsList /></ProtectedRoute>} />
          <Route path="/abc-outbound-calls/upload" element={<ProtectedRoute><AbcCallUpload /></ProtectedRoute>} />
          <Route path="/abc-outbound-calls/:callId" element={<ProtectedRoute><AbcReportDetail /></ProtectedRoute>} />
          <Route path="/abc-outbound-calls/analytics" element={<ProtectedRoute><AbcAggregatedDashboard /></ProtectedRoute>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
