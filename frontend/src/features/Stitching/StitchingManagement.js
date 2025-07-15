import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Container, Paper, Typography, Box, Button, TextField, Skeleton } from '@mui/material';
import { ContentCut } from '@mui/icons-material';
import apiService from '../../services/apiService';
import StitchingGrid from './StitchingGrid';
import AddStitchingModal from './AddStitchingModal';
import AddWashingModal from '../Washing/AddWashingModal';

function StitchingManagement() {
  const { orderId } = useParams();
  const [stitchingRecords, setStitchingRecords] = useState();
  const [washingRecords, setWashingRecords] = useState({});
  const [order, setOrder] = useState(null);
  const [stitchingVendors, setStitchingVendors] = useState([]);
  const [washingVendors, setWashingVendors] = useState([]);
  const [openStitchingModal, setOpenStitchingModal] = useState(false);
  const [openWashingModal, setOpenWashingModal] = useState(false);
  const [selectedLot, setSelectedLot] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedWashingRecord, setSelectedWashingRecord] = useState(null);
  const [totalStitchedQuantity, setTotalStitchedQuantity] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const token = localStorage.getItem('token');

  const fetchData = async () => {
    try {
      const [stitchingRes, orderRes, stitchingVendorsRes, washingVendorsRes] = await Promise.all([
        apiService.stitching.getStitching('', orderId, ''),
        apiService.orders.getOrderById(orderId),
        apiService.stitchingVendors.getStitchingVendors(),
        apiService.washingVendors.getWashingVendors()
      ]);
      setTimeout(() => setStitchingRecords(stitchingRes), process.env.REACT_APP_DATA_LOAD_TIMEOUT);
      setTimeout(() => setOrder(orderRes), process.env.REACT_APP_DATA_LOAD_TIMEOUT);
      setStitchingVendors(stitchingVendorsRes);
      setWashingVendors(washingVendorsRes);
      const total = stitchingRes.reduce((sum, record) => sum + record.quantity, 0);
      setTotalStitchedQuantity(total);
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        alert('Session expired. Please log in again.');
        window.location.href = '/login';
      } else {
        alert(err.response?.error || 'An error occurred');
      }
    }
  };

  useEffect(() => {
    fetchData();
  }, [orderId, token]);

  const fetchWashingRecords = async (lotId) => {
    try {
      const washingRes = await apiService.washing.getWashing('', lotId, '');
      setWashingRecords(prev => ({ ...prev, [lotId]: washingRes }));
    } catch (err) {
      alert(err.response?.error || 'An error occurred while fetching washing records');
    }
  };

  const handleAddStitching = (newStitching) => {
    if (selectedRecord && selectedRecord._id === newStitching._id) {
      // Update existing record
      setStitchingRecords(stitchingRecords.map(record => 
        record._id === newStitching._id ? newStitching : record
      ));
      setTotalStitchedQuantity(stitchingRecords.reduce((sum, record) => 
        record._id === newStitching._id ? sum + Number(newStitching.quantity) : sum + Number(record.quantity), 
        0
      ));
    } else {
      // Add new record
      setStitchingRecords([...stitchingRecords, newStitching]);
      setTotalStitchedQuantity(prev => prev + Number(newStitching.quantity));
    }
    setSelectedRecord(null);
    setOpenStitchingModal(false);
  };

  const handleUpdateStitchOut = (id, stitchOutDate) => {
    apiService.stitching.updateStitchingStatus(id, { stitchOutDate })
      .then(res => {
        setStitchingRecords(stitchingRecords.map(record => record._id === id ? res : record));
      });
  };

  const handleEditStitching = (record) => {
    setSelectedRecord(record);
    setOpenStitchingModal(true);
  };

  const handleAddWashing = (lotId, newWashing) => {
    if (selectedWashingRecord && selectedWashingRecord._id === newWashing._id) {
      // Update existing washing record
      setWashingRecords(prev => ({
        ...prev,
        [lotId]: prev[lotId].map(record => 
          record._id === newWashing._id ? newWashing : record
        )
      }));
    } else {
      // Add new washing record
      setWashingRecords(prev => ({
        ...prev,
        [lotId]: [...(prev[lotId] || []), newWashing]
      }));
    }
    setSelectedWashingRecord(null);
    setOpenWashingModal(false);
  };

  const handleUpdateWashOut = (lotId, id, washOutDate) => {
    apiService.washing.updateWashingStatus(id, { washOutDate })
      .then(res => {
        setWashingRecords(prev => ({
          ...prev,
          [lotId]: prev[lotId].map(record => record._id === id ? res : record)
        }));
      });
  };

  const handleEditWashing = (record) => {
    setSelectedWashingRecord(record);
    setOpenWashingModal(true);
  };

  return (
    <>
      {/* <Paper sx={{ p: 3 }}> */}
      <>
        <Typography variant="h4" sx={{ mb: 1 }}>Stitching Management</Typography>
        {!order ? (<Skeleton animation="wave" variant="text" sx={{ marginBottom: 2, width: '60%' }} />) : (
          <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
            <Typography>Order ID: <b>{order.orderId}</b></Typography>
            <Typography>Total Quantity: <b>{order.totalQuantity}</b></Typography>
            <Typography>Stitched Quantity: <b>{totalStitchedQuantity}</b></Typography>
            <Typography>Remaining Quantity: <b>{order.totalQuantity - totalStitchedQuantity}</b></Typography>
          </Box>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <TextField
            label="Search Stitching"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            fullWidth
            variant="standard"
            sx={{ maxWidth: '190px' }}
          />
          <Button variant="contained" endIcon={<ContentCut />} onClick={() => { setSelectedRecord(null); setOpenStitchingModal(true); }} sx={{ mt: 2 }}>
            Add
          </Button>
        </Box>
        <StitchingGrid
          stitchingRecords={stitchingRecords}
          washingRecords={washingRecords}
          fetchWashingRecords={fetchWashingRecords}
          handleUpdateStitchOut={handleUpdateStitchOut}
          handleUpdateWashOut={handleUpdateWashOut}
          setOpenWashingModal={setOpenWashingModal}
          setSelectedLot={setSelectedLot}
          searchTerm={searchTerm}
          onEditStitching={handleEditStitching}
          onEditWashing={handleEditWashing}
        />
        <AddStitchingModal
          open={openStitchingModal}
          onClose={() => { setOpenStitchingModal(false); setSelectedRecord(null); }}
          orderId={orderId}
          vendors={stitchingVendors}
          onAddStitching={handleAddStitching}
          editRecord={selectedRecord}
        />
        <AddWashingModal
          open={openWashingModal}
          onClose={() => { setOpenWashingModal(false); setSelectedWashingRecord(null); }}
          orderId={orderId}
          lotNumber={selectedWashingRecord?.lotId?.lotNumber || selectedLot?.lotNumber || ''}
          lotId={selectedWashingRecord?.lotId?._id || selectedLot?.lotId || ''}
          invoiceNumber={selectedWashingRecord?.lotId?.invoiceNumber || selectedLot?.invoiceNumber || ''}
          vendors={washingVendors}
          onAddWashing={handleAddWashing}
          editRecord={selectedWashingRecord}
        />
      </>
    </>
  );
}

export default StitchingManagement;